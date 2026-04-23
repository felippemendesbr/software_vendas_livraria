import { NextRequest, NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import {
  getProdutosSchema,
  sqlPathImageSelect,
  sqlProductStatusSelect,
  sqlSyncActiveFromStock,
} from '@/lib/produtos-schema';
import sql from 'mssql';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/products/[id]/stock - Adicionar quantidade ao estoque
 * Body: { quantidade: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json(
        { error: 'ID do produto inválido' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const quantidade =
      typeof body.quantidade === 'number'
        ? body.quantidade
        : parseInt(String(body.quantidade), 10);

    if (isNaN(quantidade) || quantidade < 1) {
      return NextResponse.json(
        { error: 'Quantidade inválida (deve ser inteiro >= 1)' },
        { status: 400 }
      );
    }

    const pool = await getDbPool();
    const schema = await getProdutosSchema(pool);

    const updateStockReq = pool.request();
    updateStockReq.input('id', sql.Int, id);
    updateStockReq.input('quantidade', sql.Int, quantidade);
    await updateStockReq.query(`
      UPDATE Produtos
      SET Estoque = Estoque + @quantidade
      WHERE Id = @id
    `);

    const syncSql = sqlSyncActiveFromStock(schema);
    if (syncSql) {
      const syncReq = pool.request();
      syncReq.input('id', sql.Int, id);
      await syncReq.query(syncSql);
    }

    const statusSel = sqlProductStatusSelect(schema);
    const pathSel = sqlPathImageSelect(schema);
    const selectReq = pool.request();
    selectReq.input('id', sql.Int, id);
    const selectResult = await selectReq.query(`
      SELECT Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
      FROM Produtos WHERE Id = @id
    `);
    const row = selectResult.recordset?.[0];
    if (!row) {
      return NextResponse.json(
        { error: 'Produto não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: row.Id,
      nome: row.Nome,
      preco: parseFloat(row.Preco),
      estoque: row.Estoque,
      ativo: Number(row.ProductStatus) === 1,
      pathImage:
        row.pathImage != null && String(row.pathImage).trim() !== ''
          ? String(row.pathImage).trim()
          : null,
    });
  } catch (error: any) {
    console.error('❌ ERRO PATCH /api/products/[id]/stock:', error);
    return NextResponse.json(
      {
        error: 'Erro ao atualizar estoque',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
