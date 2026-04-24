import { NextRequest, NextResponse } from 'next/server';
import { getDbPool, getProdutosColumnSchema, type ProdutosColumnSchema } from '@/lib/db';
import {
  applyUploadThumbnailFallback,
  scanProductUploadThumbnails,
} from '@/lib/product-upload-fallback';
import sql from 'mssql';

function bracketId(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

/** Aceita "19,90" ou "19.90" em query params */
function parseMoneyQuery(s: string | null): number | null {
  if (s === null || s === undefined || s.trim() === '') return null;
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function mapRowToProduct(
  row: any,
  schema: ProdutosColumnSchema
): {
  id: number;
  nome: string;
  preco: number;
  estoque: number;
  imagemUrl: string | null;
  estado: string | null;
} {
  let imagemUrl: string | null = null;
  if (schema.imagemColumn && row._ImagemRaw !== undefined && row._ImagemRaw !== null) {
    imagemUrl = String(row._ImagemRaw).trim() || null;
  }

  let estado: string | null = null;
  if (schema.estadoColumn && row._EstadoRaw !== undefined && row._EstadoRaw !== null) {
    if (schema.estadoIsBit) {
      estado = row._EstadoRaw === true || row._EstadoRaw === 1 ? 'Ativo' : 'Inativo';
    } else {
      estado = String(row._EstadoRaw).trim() || null;
    }
  }

  return {
    id: row.Id,
    nome: row.Nome,
    preco: parseFloat(row.Preco),
    estoque: row.Estoque,
    imagemUrl,
    estado,
  };
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const isManage = searchParams.get('manage') === '1' || searchParams.get('manage') === 'true';

    if (isManage) {
      const pool = await getDbPool();
      const schema = await getProdutosColumnSchema();
      const req = pool.request();

      const search = (searchParams.get('search') || '').trim();
      const sort = searchParams.get('sort') || 'nome';
      const order = (searchParams.get('order') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const estadoFilter = (searchParams.get('estado') || '').trim();
      const estoqueMin = searchParams.get('estoqueMin');
      const estoqueMax = searchParams.get('estoqueMax');
      const precoMin = searchParams.get('precoMin');
      const precoMax = searchParams.get('precoMax');
      let limit = parseInt(searchParams.get('limit') || '200', 10);
      if (isNaN(limit) || limit < 1) limit = 200;
      if (limit > 500) limit = 500;

      const sortMap: Record<string, string> = {
        nome: 'Nome',
        preco: 'Preco',
        estoque: 'Estoque',
        id: 'Id',
      };
      const orderCol = sortMap[sort.toLowerCase()] || 'Nome';

      const selectCols = ['p.Id', 'p.Nome', 'p.Preco', 'p.Estoque'];
      if (schema.imagemColumn) {
        selectCols.push(`p.${bracketId(schema.imagemColumn)} AS _ImagemRaw`);
      }
      if (schema.estadoColumn) {
        if (schema.estadoIsBit) {
          selectCols.push(`CAST(p.${bracketId(schema.estadoColumn)} AS INT) AS _EstadoRaw`);
        } else {
          selectCols.push(`p.${bracketId(schema.estadoColumn)} AS _EstadoRaw`);
        }
      }

      const where: string[] = ['1=1'];
      if (search.length >= 1) {
        if (!isNaN(Number(search)) && search.length <= 9) {
          req.input('sid', sql.Int, parseInt(search, 10));
          where.push('(p.Id = @sid OR p.Nome COLLATE Latin1_General_CI_AI LIKE @sname)');
          req.input('sname', sql.NVarChar(200), `%${search}%`);
        } else {
          req.input('sname2', sql.NVarChar(200), `%${search}%`);
          where.push('p.Nome COLLATE Latin1_General_CI_AI LIKE @sname2 COLLATE Latin1_General_CI_AI');
        }
      }

      if (estoqueMin !== null && estoqueMin !== undefined && estoqueMin !== '') {
        const n = parseInt(estoqueMin, 10);
        if (!isNaN(n)) {
          req.input('emin', sql.Int, n);
          where.push('p.Estoque >= @emin');
        }
      }
      if (estoqueMax !== null && estoqueMax !== undefined && estoqueMax !== '') {
        const n = parseInt(estoqueMax, 10);
        if (!isNaN(n)) {
          req.input('emax', sql.Int, n);
          where.push('p.Estoque <= @emax');
        }
      }
      const pMinN = parseMoneyQuery(precoMin);
      if (pMinN !== null) {
        req.input('pmin', sql.Decimal(12, 2), pMinN);
        where.push('p.Preco >= @pmin');
      }
      const pMaxN = parseMoneyQuery(precoMax);
      if (pMaxN !== null) {
        req.input('pmax', sql.Decimal(12, 2), pMaxN);
        where.push('p.Preco <= @pmax');
      }

      if (estadoFilter && schema.estadoColumn) {
        const col = `p.${bracketId(schema.estadoColumn)}`;
        if (schema.estadoIsBit) {
          const active =
            estadoFilter.toLowerCase() === 'ativo' ||
            estadoFilter === '1' ||
            estadoFilter.toLowerCase() === 'true';
          req.input('estBit', sql.Bit, active ? 1 : 0);
          where.push(`${col} = @estBit`);
        } else {
          req.input('estStr', sql.NVarChar(100), estadoFilter);
          where.push(`${col} = @estStr`);
        }
      }

      req.input('lim', sql.Int, limit);

      const sqlText = `
        SELECT TOP (@lim) ${selectCols.join(', ')}
        FROM Produtos p
        WHERE ${where.join(' AND ')}
        ORDER BY p.${bracketId(orderCol)} ${order}
      `;

      const result = await req.query(sqlText);
      const products = (result.recordset as any[]).map((row) => mapRowToProduct(row, schema));
      const uploadThumbs = await scanProductUploadThumbnails();
      applyUploadThumbnailFallback(products, uploadThumbs);

      return NextResponse.json({
        products,
        schemaHints: {
          imagemUrl: Boolean(schema.imagemColumn),
          estado: Boolean(schema.estadoColumn),
          estadoIsBit: schema.estadoIsBit,
        },
      });
    }

    // PDV / busca existente
    const query = searchParams.get('query') || '';

    if (query.trim().length > 0 && query.trim().length < 2) {
      return NextResponse.json({ products: [] });
    }

    const pool = await getDbPool();
    const requestDb = pool.request();
    const schema = await getProdutosColumnSchema();

    let result: sql.IResult<any>;

    const trimmedQuery = query.trim();
    if (trimmedQuery && !isNaN(Number(trimmedQuery))) {
      requestDb.input('id', sql.Int, parseInt(trimmedQuery, 10));
      const cols = ['Id', 'Nome', 'Preco', 'Estoque'];
      if (schema.imagemColumn) cols.push(`${bracketId(schema.imagemColumn)} AS _ImagemRaw`);
      if (schema.estadoColumn) {
        if (schema.estadoIsBit) {
          cols.push(`CAST(${bracketId(schema.estadoColumn)} AS INT) AS _EstadoRaw`);
        } else {
          cols.push(`${bracketId(schema.estadoColumn)} AS _EstadoRaw`);
        }
      }
      result = await requestDb.query(`
        SELECT ${cols.join(', ')}
        FROM Produtos
        WHERE Id = @id
      `);
    } else if (trimmedQuery) {
      requestDb.input('nome', sql.VarChar(100), `%${trimmedQuery}%`);
      const cols = ['Id', 'Nome', 'Preco', 'Estoque'];
      if (schema.imagemColumn) cols.push(`${bracketId(schema.imagemColumn)} AS _ImagemRaw`);
      if (schema.estadoColumn) {
        if (schema.estadoIsBit) {
          cols.push(`CAST(${bracketId(schema.estadoColumn)} AS INT) AS _EstadoRaw`);
        } else {
          cols.push(`${bracketId(schema.estadoColumn)} AS _EstadoRaw`);
        }
      }
      result = await requestDb.query(`
        SELECT TOP 100 ${cols.join(', ')}
        FROM Produtos
        WHERE Nome COLLATE Latin1_General_CI_AI LIKE @nome COLLATE Latin1_General_CI_AI
        ORDER BY Nome
      `);
    } else {
      const cols = ['Id', 'Nome', 'Preco', 'Estoque'];
      if (schema.imagemColumn) cols.push(`${bracketId(schema.imagemColumn)} AS _ImagemRaw`);
      if (schema.estadoColumn) {
        if (schema.estadoIsBit) {
          cols.push(`CAST(${bracketId(schema.estadoColumn)} AS INT) AS _EstadoRaw`);
        } else {
          cols.push(`${bracketId(schema.estadoColumn)} AS _EstadoRaw`);
        }
      }
      result = await requestDb.query(`
        SELECT TOP 100 ${cols.join(', ')}
        FROM Produtos
        ORDER BY Nome
      `);
    }

    const uploadThumbs = await scanProductUploadThumbnails();

    const products = (result.recordset as any[]).map((row) => {
      const full = mapRowToProduct(row, schema);
      let imagemUrl = full.imagemUrl?.trim() || null;
      if (!imagemUrl) {
        const u = uploadThumbs.get(full.id);
        if (u) imagemUrl = u;
      }
      const item: Record<string, unknown> = {
        id: full.id,
        nome: full.nome,
        preco: full.preco,
        estoque: full.estoque,
      };
      if (imagemUrl) item.imagemUrl = imagemUrl;
      if (schema.estadoColumn) item.estado = full.estado;
      return item;
    });

    return NextResponse.json({ products });
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const preco = parseFloat(body.preco);
    const estoque = parseInt(body.estoque, 10);
    const imagemUrl =
      body.imagemUrl === null || body.imagemUrl === undefined
        ? null
        : String(body.imagemUrl).trim() || null;
    const estadoStr =
      body.estado === null || body.estado === undefined ? undefined : String(body.estado);

    if (!nome) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }
    if (isNaN(preco) || preco < 0) {
      return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });
    }
    if (isNaN(estoque) || estoque < 0) {
      return NextResponse.json({ error: 'Estoque inválido' }, { status: 400 });
    }

    const pool = await getDbPool();
    const schema = await getProdutosColumnSchema();
    const req = pool.request();

    req.input('nome', sql.NVarChar(500), nome);
    req.input('preco', sql.Decimal(12, 2), preco);
    req.input('estoque', sql.Int, estoque);

    const insertCols = ['Nome', 'Preco', 'Estoque'];
    const insertVals = ['@nome', '@preco', '@estoque'];

    if (schema.imagemColumn) {
      if (imagemUrl === null) {
        req.input('imagemUrl', sql.NVarChar(4000), null);
      } else {
        req.input('imagemUrl', sql.NVarChar(2000), imagemUrl.slice(0, 2000));
      }
      insertCols.push(bracketId(schema.imagemColumn));
      insertVals.push('@imagemUrl');
    } else if (imagemUrl) {
      return NextResponse.json(
        {
          error: 'Coluna de imagem não existe na tabela Produtos',
          hint: 'Execute o script scripts/produtos-admin-columns.sql no SQL Server ou crie uma coluna ImagemUrl.',
        },
        { status: 400 }
      );
    }

    if (schema.estadoColumn) {
      const parsed = parseEstadoForDb(estadoStr, schema);
      if (parsed) {
        if (parsed.useBit) {
          req.input('estadoVal', sql.Bit, parsed.dbValue);
        } else {
          req.input('estadoVal', sql.NVarChar(100), parsed.dbValue);
        }
        insertCols.push(bracketId(schema.estadoColumn));
        insertVals.push('@estadoVal');
      }
    }

    const q = `
      INSERT INTO Produtos (${insertCols.join(', ')})
      OUTPUT INSERTED.Id AS id
      VALUES (${insertVals.join(', ')})
    `;
    const result = await req.query(q);
    const id = result.recordset[0]?.id;
    if (id === undefined || id === null) {
      return NextResponse.json({ error: 'Falha ao obter Id do produto inserido' }, { status: 500 });
    }

    return NextResponse.json({ id, message: 'Produto criado' }, { status: 201 });
  } catch (error: any) {
    console.error('❌ ERRO POST /api/products:', error);
    return NextResponse.json(
      {
        error: 'Erro ao criar produto',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
