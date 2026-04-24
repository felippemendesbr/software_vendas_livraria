import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { clearProductUploadThumbnailCache } from '@/lib/product-upload-fallback';

const MAX_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const entry = form.get('file');
    if (!entry || !(entry instanceof Blob)) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });
    }

    if (entry.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx. 5 MB)' }, { status: 400 });
    }

    const mime = entry.type || 'application/octet-stream';
    const ext = MIME_TO_EXT.get(mime);
    if (!ext) {
      return NextResponse.json(
        { error: 'Formato não suportado. Use JPG, PNG, WebP ou GIF.' },
        { status: 400 }
      );
    }

    const pidRaw = form.get('productId');
    let productId = 0;
    if (typeof pidRaw === 'string' && /^\d+$/.test(pidRaw)) {
      productId = parseInt(pidRaw, 10);
    } else if (typeof pidRaw === 'number' && Number.isFinite(pidRaw)) {
      productId = Math.max(0, Math.floor(pidRaw));
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'products');
    await mkdir(dir, { recursive: true });

    const filename = `${productId}-${Date.now()}.${ext}`;
    const filePath = path.join(dir, filename);
    const buffer = Buffer.from(await entry.arrayBuffer());
    await writeFile(filePath, buffer);
    clearProductUploadThumbnailCache();

    const url = `/uploads/products/${filename}`;
    return NextResponse.json({ url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('POST /api/products/upload:', error);
    return NextResponse.json({ error: 'Falha no upload', message }, { status: 500 });
  }
}
