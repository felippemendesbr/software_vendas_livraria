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
 * PATCH /api/products/[id] - Atualizar produto (preço e/ou estoque).
 * Status no banco segue a regra: ativo (1) se Estoque > 0, senão inativo (0).
 * Body: { preco?: number, estoque?: number }
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
    const preco =
      body.preco !== undefined
        ? typeof body.preco === 'number'
          ? body.preco
          : parseFloat(String(body.preco))
        : undefined;
    const estoque =
      body.estoque !== undefined
        ? typeof body.estoque === 'number'
          ? body.estoque
          : parseInt(String(body.estoque), 10)
        : undefined;

    if (preco !== undefined && (isNaN(preco) || preco < 0)) {
      return NextResponse.json(
        { error: 'Preço inválido (deve ser número >= 0)' },
        { status: 400 }
      );
    }
    if (estoque !== undefined && (isNaN(estoque) || estoque < 0)) {
      return NextResponse.json(
        { error: 'Estoque inválido (deve ser inteiro >= 0)' },
        { status: 400 }
      );
    }

    const pool = await getDbPool();
    const schema = await getProdutosSchema(pool);

    const sets: string[] = [];
    const updateReq = pool.request();
    updateReq.input('id', sql.Int, id);
    if (preco !== undefined) {
      updateReq.input('preco', sql.Decimal(10, 2), preco);
      sets.push('Preco = @preco');
    }
    if (estoque !== undefined) {
      updateReq.input('estoque', sql.Int, estoque);
      sets.push('Estoque = @estoque');
    }

    if (sets.length === 0) {
      return NextResponse.json(
        { error: 'Envie ao menos um campo: preco ou estoque' },
        { status: 400 }
      );
    }

    await updateReq.query(`
      UPDATE Produtos
      SET ${sets.join(', ')}
      WHERE Id = @id
    `);

    const syncSql = sqlSyncActiveFromStock(schema);
    if (syncSql) {
      const syncStatusReq = pool.request();
      syncStatusReq.input('id', sql.Int, id);
      await syncStatusReq.query(syncSql);
    }

    const statusSel = sqlProductStatusSelect(schema);
    const pathSel = sqlPathImageSelect(schema);
    const selectReq = pool.request();
    selectReq.input('id', sql.Int, id);
    const selectResult = await selectReq.query(`
      SELECT Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
      FROM Produtos
      WHERE Id = @id
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
    console.error('❌ ERRO PATCH /api/products/[id]:', error);
    const msg = error?.message || 'Erro desconhecido';
    return NextResponse.json(
      {
        error: 'Erro ao atualizar produto',
        message: msg,
      },
      { status: 500 }
    );
  }
}
