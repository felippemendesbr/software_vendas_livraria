import { NextRequest, NextResponse } from 'next/server';
import { getDbPool, discoverPedidosSchema, checkPedidoItensFormaPagamento } from '@/lib/db';
import sql, { ISOLATION_LEVEL } from 'mssql';

interface SaleItem {
  produtoId: number;
  quantidade: number;
}

interface SaleRequest {
  itens: SaleItem[];
  formaPagamento: 'PIX' | 'CARTAO' | 'DINHEIRO';
}

export async function POST(request: NextRequest) {
  let transaction: sql.Transaction | null = null;
  let transactionStarted = false;
  
  try {
    const body: SaleRequest = await request.json();

    // Validações
    if (!body.itens || !Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json(
        { error: 'Lista de itens é obrigatória e não pode estar vazia' },
        { status: 400 }
      );
    }

    if (!body.formaPagamento || !['PIX', 'CARTAO', 'DINHEIRO'].includes(body.formaPagamento)) {
      return NextResponse.json(
        { error: 'Forma de pagamento inválida. Use: PIX, CARTAO ou DINHEIRO' },
        { status: 400 }
      );
    }

    for (const item of body.itens) {
      if (!item.produtoId || item.quantidade <= 0) {
        return NextResponse.json(
          { error: 'Todos os itens devem ter produtoId e quantidade > 0' },
          { status: 400 }
        );
      }
    }

    const pool = await getDbPool();
    // Criar transação passando o pool no construtor
    transaction = new sql.Transaction(pool);
    
    // Iniciar transação com isolation level explícito
    // READ_COMMITTED (valor 2) é o padrão e mais seguro para operações de venda
    try {
      // Tentar usar a constante ISOLATION_LEVEL primeiro
      const isolationLevel = ISOLATION_LEVEL?.READ_COMMITTED ?? 2; // 2 = READ_COMMITTED
      await transaction.begin(isolationLevel);
      transactionStarted = true;
    } catch (beginError: any) {
      console.error('❌ Erro ao iniciar transação:', beginError);
      console.error('   Detalhes do erro:', {
        message: beginError.message,
        code: beginError.code,
        name: beginError.name,
      });
      throw new Error(`Erro ao iniciar transação: ${beginError.message || 'Invalid isolation level'}`);
    }

    // Descobrir estrutura das tabelas
    const pedidosSchema = await discoverPedidosSchema();
    const pedidoItensFormaPagamento = await checkPedidoItensFormaPagamento();

    // 1. Buscar preços atuais dos produtos (APENAS CONSULTA - tabela já existe e está preenchida)
    const produtosRequest = new sql.Request(transaction);
    const produtoIds = body.itens.map(item => item.produtoId);
    const produtosPlaceholders = produtoIds.map((_, i) => `@produtoId${i}`).join(',');
    
    produtoIds.forEach((id, i) => {
      produtosRequest.input(`produtoId${i}`, sql.Int, id);
    });

    const produtosResult = await produtosRequest.query(`
      SELECT Id, Nome, Preco, Estoque, ISNULL([Status], 0) AS ProductStatus
      FROM Produtos
      WHERE Id IN (${produtosPlaceholders})
    `);

    if (produtosResult.recordset.length !== produtoIds.length) {
      if (transaction && transactionStarted) {
        await transaction.rollback();
      }
      return NextResponse.json(
        { error: 'Um ou mais produtos não foram encontrados' },
        { status: 404 }
      );
    }

    const produtosMap = new Map(
      produtosResult.recordset.map((p: any) => [
        p.Id,
        {
          nome: p.Nome,
          preco: parseFloat(p.Preco),
          estoque: p.Estoque,
          ativo: Number(p.ProductStatus) === 1,
        },
      ])
    );

    for (const id of produtoIds) {
      const p = produtosMap.get(id);
      if (p && !p.ativo) {
        if (transaction && transactionStarted) {
          await transaction.rollback();
        }
        return NextResponse.json(
          {
            error: 'Produto inativo no cadastro',
            message: `"${p.nome}" não pode ser vendido (Status = 0 no banco).`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Validar estoque e calcular total
    let total = 0;
    const itensComPreco = body.itens.map(item => {
      const produto = produtosMap.get(item.produtoId);
      if (!produto) {
        throw new Error(`Produto ${item.produtoId} não encontrado`);
      }

      if (produto.estoque < item.quantidade) {
        throw new Error(`Estoque insuficiente para produto ${produto.nome} (disponível: ${produto.estoque}, solicitado: ${item.quantidade})`);
      }

      const subtotal = produto.preco * item.quantidade;
      total += subtotal;

      return {
        ...item,
        precoUnitario: produto.preco,
        subtotal,
        nome: produto.nome,
      };
    });

    // 3. Criar registro em Pedidos
    const pedidoRequest = new sql.Request(transaction);
    
    // Montar INSERT dinâmico baseado no schema descoberto
    const pedidoColumns: string[] = [];
    const pedidoValues: string[] = [];

    if (pedidosSchema.hasDataHora) {
      const colName = pedidosSchema.dataHoraColumn || 'DataHora';
      pedidoColumns.push(colName);
      pedidoValues.push('GETDATE()');
    }

    if (pedidosSchema.hasTotal) {
      const colName = pedidosSchema.totalColumn || 'Total';
      pedidoColumns.push(colName);
      pedidoValues.push('@total');
      pedidoRequest.input('total', sql.Decimal(10, 2), total);
    }

    if (pedidosSchema.hasFormaPagamento) {
      const colName = pedidosSchema.formaPagamentoColumn || 'FormaPagamento';
      pedidoColumns.push(colName);
      pedidoValues.push('@formaPagamento');
      pedidoRequest.input('formaPagamento', sql.NVarChar(20), body.formaPagamento);
    }

    const pedidoInsertQuery = `
      INSERT INTO Pedidos (${pedidoColumns.join(', ')})
      OUTPUT INSERTED.Id
      VALUES (${pedidoValues.join(', ')})
    `;

    const pedidoResult = await pedidoRequest.query(pedidoInsertQuery);
    const pedidoId = pedidoResult.recordset[0].Id;

    // 4. Inserir itens em PedidoItens (INSERT realizado ao finalizar venda)
    // NOTA: A tabela PedidoItens já está criada no banco - apenas fazemos INSERT aqui
    for (const item of itensComPreco) {
      const itemRequest = new sql.Request(transaction);
      itemRequest.input('pedidoId', sql.Int, pedidoId);
      itemRequest.input('produtoId', sql.Int, item.produtoId);
      itemRequest.input('quantidade', sql.Int, item.quantidade);
      itemRequest.input('precoUnitario', sql.Decimal(10, 2), item.precoUnitario);

      const itemColumns = ['PedidoId', 'ProdutoId', 'Quantidade', 'PrecoUnitario'];
      const itemValues = ['@pedidoId', '@produtoId', '@quantidade', '@precoUnitario'];

      // Se FormaPagamento existir em PedidoItens, incluir
      if (pedidoItensFormaPagamento.exists) {
        itemColumns.push(pedidoItensFormaPagamento.columnName!);
        itemValues.push('@formaPagamentoItem');
        itemRequest.input('formaPagamentoItem', sql.NVarChar(20), body.formaPagamento);
      }

      // INSERT em PedidoItens - executado quando o vendedor clica em "Finalizar Venda"
      await itemRequest.query(`
        INSERT INTO PedidoItens (${itemColumns.join(', ')})
        VALUES (${itemValues.join(', ')})
      `);

      // 5. Dar baixa no estoque (com validação de estoque suficiente)
      const estoqueRequest = new sql.Request(transaction);
      estoqueRequest.input('produtoId', sql.Int, item.produtoId);
      estoqueRequest.input('quantidade', sql.Int, item.quantidade);

      const estoqueResult = await estoqueRequest.query(`
        UPDATE Produtos
        SET Estoque = Estoque - @quantidade
        WHERE Id = @produtoId AND Estoque >= @quantidade
      `);

      if (estoqueResult.rowsAffected[0] === 0) {
        throw new Error(`Estoque insuficiente para produto ${item.nome} (pode ter sido alterado durante a transação)`);
      }
    }

    // Commit da transação
    if (transaction && transactionStarted) {
      await transaction.commit();
    }

    return NextResponse.json({
      pedidoId,
      total,
      formaPagamento: body.formaPagamento,
      itens: itensComPreco.map(item => ({
        produtoId: item.produtoId,
        nome: item.nome,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal: item.subtotal,
      })),
    });
  } catch (error: any) {
    console.error('❌ Erro ao processar venda:', error);
    
    // Rollback em caso de erro (apenas se a transação foi iniciada)
    if (transaction && transactionStarted) {
      try {
        await transaction.rollback();
      } catch (rollbackError: any) {
        // Ignorar erro se a transação não foi iniciada
        if (rollbackError.code !== 'ENOTBEGUN') {
          console.error('❌ Erro ao fazer rollback:', rollbackError);
        }
      }
    }

    return NextResponse.json(
      {
        error: 'Erro ao processar venda',
        message: error.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
