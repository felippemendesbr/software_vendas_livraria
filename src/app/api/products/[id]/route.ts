import { NextRequest, NextResponse } from 'next/server';
import { getDbPool, getProdutosColumnSchema, type ProdutosColumnSchema } from '@/lib/db';
import sql from 'mssql';

function bracketId(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

function parseEstadoForDb(
  value: string | undefined,
  schema: ProdutosColumnSchema
): { useBit: boolean; dbValue: unknown } | null {
  if (!schema.estadoColumn) return null;
  const v = (value ?? '').trim();
  if (schema.estadoIsBit) {
    const active =
      v === '' ||
      v.toLowerCase() === 'ativo' ||
      v === '1' ||
      v.toLowerCase() === 'true' ||
      v.toLowerCase() === 'sim';
    return { useBit: true, dbValue: active ? 1 : 0 };
  }
  const s = v || 'Ativo';
  return { useBit: false, dbValue: s };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idParam = params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
    }

    const body = await request.json();
    const keys = Object.keys(body || {});
    if (keys.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    const pool = await getDbPool();
    const schema = await getProdutosColumnSchema();
    const req = pool.request();
    req.input('id', sql.Int, id);

    const sets: string[] = [];

    if ('nome' in body) {
      const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
      if (!nome) {
        return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 });
      }
      req.input('nome', sql.NVarChar(500), nome);
      sets.push('Nome = @nome');
    }

    if ('preco' in body) {
      const preco = parseFloat(body.preco);
      if (isNaN(preco) || preco < 0) {
        return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });
      }
      req.input('preco', sql.Decimal(12, 2), preco);
      sets.push('Preco = @preco');
    }

    if ('estoque' in body) {
      const estoque = parseInt(body.estoque, 10);
      if (isNaN(estoque) || estoque < 0) {
        return NextResponse.json({ error: 'Estoque inválido' }, { status: 400 });
      }
      req.input('estoque', sql.Int, estoque);
      sets.push('Estoque = @estoque');
    }

    if ('imagemUrl' in body) {
      if (!schema.imagemColumn) {
        return NextResponse.json(
          {
            error: 'Coluna de imagem não existe na tabela Produtos',
            hint: 'Execute scripts/produtos-admin-columns.sql ou crie ImagemUrl.',
          },
          { status: 400 }
        );
      }
      const imagemUrl =
        body.imagemUrl === null || body.imagemUrl === undefined
          ? null
          : String(body.imagemUrl).trim() || null;
      if (imagemUrl === null) {
        req.input('imagemUrl', sql.NVarChar(4000), null);
      } else {
        req.input('imagemUrl', sql.NVarChar(2000), imagemUrl.slice(0, 2000));
      }
      sets.push(`${bracketId(schema.imagemColumn)} = @imagemUrl`);
    }

    if ('estado' in body) {
      if (!schema.estadoColumn) {
        return NextResponse.json(
          {
            error: 'Coluna de estado não existe na tabela Produtos',
            hint: 'Execute scripts/produtos-admin-columns.sql ou crie Estado/Ativo.',
          },
          { status: 400 }
        );
      }
      const estadoStr =
        body.estado === null || body.estado === undefined ? undefined : String(body.estado);
      const parsed = parseEstadoForDb(estadoStr, schema);
      if (parsed) {
        if (parsed.useBit) {
          req.input('estadoVal', sql.Bit, parsed.dbValue);
        } else {
          req.input('estadoVal', sql.NVarChar(100), parsed.dbValue);
        }
        sets.push(`${bracketId(schema.estadoColumn)} = @estadoVal`);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo reconhecido para atualizar' }, { status: 400 });
    }

    const q = `
      UPDATE Produtos
      SET ${sets.join(', ')}
      WHERE Id = @id
    `;
    const result = await req.query(q);
    const affected = result.rowsAffected?.[0] ?? 0;
    if (affected === 0) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ id, message: 'Produto atualizado' });
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
