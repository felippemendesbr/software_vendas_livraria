import { NextRequest, NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import {
  getProdutosSchema,
  sqlActiveProductWhere,
  sqlPathImageSelect,
  sqlProductStatusSelect,
} from '@/lib/produtos-schema';
import sql from 'mssql';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';

    // Debounce server-side: se query muito curta, retornar vazio sem conectar
    if (query.trim().length > 0 && query.trim().length < 2) {
      return NextResponse.json({ products: [] });
    }

    const pool = await getDbPool();
    const schema = await getProdutosSchema(pool);
    const statusSel = sqlProductStatusSelect(schema);
    const pathSel = sqlPathImageSelect(schema);
    const activeWhere = sqlActiveProductWhere(schema);
    const requestDb = pool.request();

    let result: sql.IResult<any>;

    // NOTA: A tabela Produtos já está criada e preenchida no banco
    // Este endpoint APENAS CONSULTA (SELECT) - não faz INSERT/UPDATE/DELETE

    // Se query for um número (após trim), buscar por ID exato
    const trimmedQuery = query.trim();
    if (trimmedQuery && !isNaN(Number(trimmedQuery))) {
      requestDb.input('id', sql.Int, parseInt(trimmedQuery, 10));
      result = await requestDb.query(`
        SELECT Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
        FROM Produtos
        WHERE Id = @id AND (${activeWhere})
      `);
    } else if (trimmedQuery) {
      // Buscar por nome (LIKE case-insensitive e accent-insensitive) - busca semântica
      // Usando COLLATE Latin1_General_CI_AI para ignorar acentos e maiúsculas/minúsculas
      // CI = Case Insensitive, AI = Accent Insensitive
      // O % permite buscar em qualquer parte do texto (início, meio ou fim)
      // Preservar espaços no meio da busca (apenas trim no início/fim)
      requestDb.input('nome', sql.VarChar(100), `%${trimmedQuery}%`);
      result = await requestDb.query(`
        SELECT Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
        FROM Produtos
        WHERE Nome COLLATE Latin1_General_CI_AI LIKE @nome COLLATE Latin1_General_CI_AI
          AND (${activeWhere})
        ORDER BY Nome
      `);
    } else {
      // Sem query: listar para inventário (limit configurável)
      const limitParam = searchParams.get('limit');
      const limit = limitParam && !isNaN(Number(limitParam)) ? Math.min(Number(limitParam), 2000) : 100;
      requestDb.input('limit', sql.Int, limit);
      result = await requestDb.query(`
        SELECT TOP (@limit) Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
        FROM Produtos
        ORDER BY Nome
      `);
    }

    const products = result.recordset.map((row: any) => ({
      id: row.Id,
      nome: row.Nome,
      preco: parseFloat(row.Preco),
      estoque: row.Estoque,
      ativo: Number(row.ProductStatus) === 1,
      pathImage:
        row.pathImage != null && String(row.pathImage).trim() !== ''
          ? String(row.pathImage).trim()
          : null,
    }));

    return NextResponse.json(
      { products },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ ERRO /api/products:', error);

    return NextResponse.json(
      {
        error: 'Erro ao buscar produtos',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products - Cadastrar novo produto (SKU)
 * Body: { nome: string, preco: number, estoque: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const preco = typeof body.preco === 'number' ? body.preco : parseFloat(body.preco);
    const estoque = typeof body.estoque === 'number' ? body.estoque : parseInt(String(body.estoque), 10);

    if (!nome || nome.length === 0) {
      return NextResponse.json(
        { error: 'Nome do produto é obrigatório' },
        { status: 400 }
      );
    }
    if (nome.length > 100) {
      return NextResponse.json(
        { error: 'Nome deve ter no máximo 100 caracteres' },
        { status: 400 }
      );
    }
    if (isNaN(preco) || preco < 0) {
      return NextResponse.json(
        { error: 'Preço inválido (deve ser número >= 0)' },
        { status: 400 }
      );
    }
    if (isNaN(estoque) || estoque < 0) {
      return NextResponse.json(
        { error: 'Estoque inválido (deve ser número inteiro >= 0)' },
        { status: 400 }
      );
    }

    const pool = await getDbPool();
    const schema = await getProdutosSchema(pool);
    const requestDb = pool.request();
    requestDb.input('nome', sql.VarChar(100), nome);
    requestDb.input('preco', sql.Decimal(10, 2), preco);
    requestDb.input('estoque', sql.Int, estoque);

    let result: sql.IResult<any>;
    if (schema.hasStatus) {
      result = await requestDb.query(`
        INSERT INTO Produtos (Nome, Preco, Estoque, [Status])
        OUTPUT INSERTED.Id, INSERTED.Nome, INSERTED.Preco, INSERTED.Estoque, INSERTED.[Status] AS ProductStatus
        VALUES (@nome, @preco, @estoque, CASE WHEN @estoque > 0 THEN 1 ELSE 0 END)
      `);
    } else if (schema.hasAtivo) {
      result = await requestDb.query(`
        INSERT INTO Produtos (Nome, Preco, Estoque, [Ativo])
        OUTPUT INSERTED.Id, INSERTED.Nome, INSERTED.Preco, INSERTED.Estoque, INSERTED.[Ativo] AS InsertedAtivo
        VALUES (@nome, @preco, @estoque, CASE WHEN @estoque > 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END)
      `);
    } else {
      result = await requestDb.query(`
        INSERT INTO Produtos (Nome, Preco, Estoque)
        OUTPUT INSERTED.Id, INSERTED.Nome, INSERTED.Preco, INSERTED.Estoque
        VALUES (@nome, @preco, @estoque)
      `);
    }

    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json(
        { error: 'Falha ao inserir produto' },
        { status: 500 }
      );
    }

    const ativoFromRow =
      row.ProductStatus !== undefined && row.ProductStatus !== null
        ? Number(row.ProductStatus) === 1
        : row.InsertedAtivo !== undefined && row.InsertedAtivo !== null
          ? Boolean(row.InsertedAtivo)
          : estoque > 0;

    return NextResponse.json({
      id: row.Id,
      nome: row.Nome,
      preco: parseFloat(row.Preco),
      estoque: row.Estoque,
      ativo: ativoFromRow,
      pathImage: null,
    });
  } catch (error: any) {
    console.error('❌ ERRO POST /api/products:', error);
    return NextResponse.json(
      {
        error: 'Erro ao cadastrar produto',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
