/**
 * Normaliza URL gravada no banco para uso em <img src> (caminho local ou absoluta).
 */
export function resolveProductImageSrc(url: string | null | undefined): string | null {
  if (url == null) return null;
  const s = String(url).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return s;
  if (s.startsWith('/')) return s;
  return `/${s.replace(/^\/+/, '')}`;
}
