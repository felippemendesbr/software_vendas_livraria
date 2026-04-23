import { NextRequest, NextResponse } from 'next/server';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { getDbPool } from '@/lib/db';
import {
  getProdutosSchema,
  sqlPathImageSelect,
  sqlProductStatusSelect,
  sqlSyncActiveFromStock,
} from '@/lib/produtos-schema';
import sql from 'mssql';

type RouteParams = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function uploadsRootAbs(): string {
  return path.resolve(path.join(process.cwd(), 'public', 'uploads', 'products'));
}

function resolveStoredImagePath(publicPath: string): string | null {
  const trimmed = publicPath.trim();
  if (!trimmed.startsWith('/uploads/products/')) return null;
  const abs = path.resolve(path.join(process.cwd(), 'public', trimmed.replace(/^\//, '')));
  const root = uploadsRootAbs();
  if (!abs.startsWith(root)) return null;
  return abs;
}

/**
 * POST /api/products/[id]/image — multipart, campo "file".
 * Grava em public/uploads/products e atualiza path_image no banco.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: 'ID do produto inválido' }, { status: 400 });
    }

    const formData = await request.formData();
    const entry = formData.get('file');
    if (!entry || typeof entry === 'string' || !('arrayBuffer' in entry)) {
      return NextResponse.json(
        { error: 'Envie um arquivo no campo "file"' },
        { status: 400 }
      );
    }
    const file = entry as File;
    if (file.size === 0) {
      return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Imagem muito grande (máximo ${MAX_BYTES / (1024 * 1024)} MB)` },
        { status: 400 }
      );
    }

    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return NextResponse.json(
        { error: 'Tipo não permitido. Use JPEG, PNG, WebP ou GIF.' },
        { status: 400 }
      );
    }

    const pool = await getDbPool();
    const schema = await getProdutosSchema(pool);
    if (!schema.hasPathImage) {
      return NextResponse.json(
        {
          error: 'Coluna path_image não existe na tabela Produtos',
          message: 'Execute o script scripts/sql/add_path_image_produtos.sql no banco.',
        },
        { status: 400 }
      );
    }

    const existing = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT [path_image] AS path_image FROM Produtos WHERE Id = @id`);
    const prevRow = existing.recordset?.[0];
    if (!prevRow) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    const prevPath =
      prevRow.path_image != null && String(prevRow.path_image).trim() !== ''
        ? String(prevRow.path_image).trim()
        : null;

    const filename = `${id}-${Date.now()}.${ext}`;
    const dir = uploadsRootAbs();
    await mkdir(dir, { recursive: true });
    const absFile = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absFile, buffer);

    const publicPath = `/uploads/products/${filename}`;

    const updateReq = pool.request();
    updateReq.input('id', sql.Int, id);
    updateReq.input('path_image', sql.NVarChar(500), publicPath);
    await updateReq.query(`
      UPDATE Produtos
      SET [path_image] = @path_image
      WHERE Id = @id
    `);

    const syncSql = sqlSyncActiveFromStock(schema);
    if (syncSql) {
      const syncReq = pool.request();
      syncReq.input('id', sql.Int, id);
      await syncReq.query(syncSql);
    }

    if (prevPath) {
      const oldAbs = resolveStoredImagePath(prevPath);
      if (oldAbs && existsSync(oldAbs) && oldAbs !== absFile) {
        try {
          await unlink(oldAbs);
        } catch {
          // arquivo antigo pode já ter sido removido
        }
      }
    }

    const statusSel = sqlProductStatusSelect(schema);
    const pathSel = sqlPathImageSelect(schema);
    const selectResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT Id, Nome, Preco, Estoque, ${statusSel}, ${pathSel}
        FROM Produtos
        WHERE Id = @id
      `);
    const row = selectResult.recordset?.[0];
    if (!row) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.Id,
      nome: row.Nome,
      preco: parseFloat(row.Preco),
      estoque: row.Estoque,
      ativo: Number(row.ProductStatus) === 1,
      pathImage: row.pathImage != null && row.pathImage !== '' ? String(row.pathImage) : null,
    });
  } catch (error: any) {
    console.error('❌ ERRO POST /api/products/[id]/image:', error);
    return NextResponse.json(
      {
        error: 'Erro ao enviar imagem',
        message: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
