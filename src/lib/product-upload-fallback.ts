import { readdir } from 'fs/promises';
import path from 'path';

/** Arquivos gerados pelo upload: `{idProduto}-{timestamp}.{ext}` */
const UPLOAD_FILE_RE = /^(\d+)-(\d+)\.(png|jpe?g|webp|gif)$/i;

const CACHE_MS = 15_000;
let thumbCache: { at: number; map: Map<number, string> } | null = null;

/**
 * Lê `public/uploads/products` e monta mapa produtoId → URL pública (`/uploads/products/...`),
 * escolhendo o arquivo com timestamp mais recente quando há vários por id.
 * Resultado é cacheado por alguns segundos para não repetir `readdir` a cada request.
 */
export async function scanProductUploadThumbnails(): Promise<Map<number, string>> {
  const now = Date.now();
  if (thumbCache && now - thumbCache.at < CACHE_MS) {
    return thumbCache.map;
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', 'products');
  const best = new Map<number, { ts: number; filename: string }>();

  try {
    const names = await readdir(dir);
    for (const name of names) {
      const m = name.match(UPLOAD_FILE_RE);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      const ts = parseInt(m[2], 10);
      if (id < 1 || Number.isNaN(ts)) continue;

      const prev = best.get(id);
      if (!prev || ts >= prev.ts) {
        best.set(id, { ts, filename: name });
      }
    }
  } catch {
    // Pasta inexistente ou sem permissão: sem fallback
  }

  const urls = new Map<number, string>();
  for (const [id, { filename }] of best) {
    urls.set(id, `/uploads/products/${filename}`);
  }
  thumbCache = { at: now, map: urls };
  return urls;
}

/** Chame após gravar novo arquivo em `uploads/products` para a lista refletir na hora. */
export function clearProductUploadThumbnailCache(): void {
  thumbCache = null;
}

export function applyUploadThumbnailFallback<
  T extends { id: number; imagemUrl: string | null }
>(products: T[], byId: Map<number, string>): void {
  for (const p of products) {
    const cur = p.imagemUrl?.trim();
    if (cur) continue;
    const u = byId.get(p.id);
    if (u) p.imagemUrl = u;
  }
}
