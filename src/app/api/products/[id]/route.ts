import { NextRequest, NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import sql from 'mssql';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/products/[id] - Atualizar produto (preço, estoque, ativo)
 * Body: { preco?: number, estoque?: number, ativo?: boolean }
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
    const ativo =
      body.ativo !== undefined ? Boolean(body.ativo) : undefined;

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
    const requestDb = pool.request();
    requestDb.input('id', sql.Int, id);

    const sets: string[] = [];
    if (preco !== undefined) {
      requestDb.input('preco', sql.Decimal(10, 2), preco);
      sets.push('Preco = @preco');
    }
    if (estoque !== undefined) {
      requestDb.input('estoque', sql.Int, estoque);
      sets.push('Estoque = @estoque');
    }
    if (ativo !== undefined) {
      requestDb.input('statusVal', sql.Int, ativo ? 1 : 0);
      sets.push('[Status] = @statusVal');
    }

    if (sets.length === 0) {
      return NextResponse.json(
        { error: 'Envie ao menos um campo: preco, estoque ou ativo' },
        { status: 400 }
      );
    }

    await requestDb.query(`
      UPDATE Produtos
      SET ${sets.join(', ')}
      WHERE Id = @id
    `);

    const selectResult = await requestDb.query(`
      SELECT Id, Nome, Preco, Estoque, ISNULL([Status], 1) AS ProductStatus
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
      ativo: Number(row.ProductStatus ?? 1) === 1,
    });
  } catch (error: any) {
    console.error('❌ ERRO PATCH /api/products/[id]:', error);
    return NextResponse.json(
      {
        error: 'Erro ao atualizar produto',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
