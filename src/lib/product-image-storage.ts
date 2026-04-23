import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const OBJECT_PREFIX = 'products';

/**
 * Upload centralizado (S3-compatível: AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces…).
 * Defina no .env (todas obrigatórias para ativar o modo remoto):
 *
 * - S3_BUCKET
 * - S3_ACCESS_KEY_ID
 * - S3_SECRET_ACCESS_KEY
 * - S3_PUBLIC_BASE_URL — URL pública base **sem** barra final (ex.: https://pub-xxxxx.r2.dev)
 *
 * Opcionais:
 * - S3_REGION — padrão "us-east-1"; Cloudflare R2 use "auto"
 * - S3_ENDPOINT — ex.: https://ACCOUNT_ID.r2.cloudflarestorage.com (R2 / MinIO)
 * - S3_FORCE_PATH_STYLE — "true" para MinIO; com S3_ENDPOINT costuma ser necessário
 */
export function isProductImageRemoteStorageEnabled(): boolean {
  const b = process.env.S3_BUCKET?.trim();
  const k = process.env.S3_ACCESS_KEY_ID?.trim();
  const s = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const u = process.env.S3_PUBLIC_BASE_URL?.trim();
  return Boolean(b && k && s && u);
}

function s3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === 'true' ||
    process.env.S3_FORCE_PATH_STYLE === '1' ||
    Boolean(endpoint);
  return new S3Client({
    region: (process.env.S3_REGION || 'us-east-1').trim(),
    endpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
    },
    ...(forcePathStyle ? { forcePathStyle: true as const } : {}),
  });
}

export async function uploadProductImageRemote(
  buffer: Buffer,
  contentType: string,
  filename: string
): Promise<string> {
  const bucket = process.env.S3_BUCKET!.trim();
  const base = process.env.S3_PUBLIC_BASE_URL!.trim().replace(/\/$/, '');
  const key = `${OBJECT_PREFIX}/${filename}`;
  const client = s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${base}/${key}`;
}

export async function deleteProductImageRemoteIfApplicable(
  storedPath: string
): Promise<void> {
  const trimmed = storedPath.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return;
  }
  if (!isProductImageRemoteStorageEnabled()) {
    return;
  }
  let key: string;
  try {
    key = decodeURIComponent(new URL(trimmed).pathname.replace(/^\/+/, ''));
  } catch {
    return;
  }
  if (!key.startsWith(`${OBJECT_PREFIX}/`)) {
    return;
  }
  const bucket = process.env.S3_BUCKET!.trim();
  try {
    const client = s3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (e) {
    console.warn('⚠️ Falha ao apagar imagem no bucket (ignorado):', key, e);
  }
}
