/**
 * Where uploads live. Local disk by default (development); STORAGE_DRIVER=s3 sends them to any
 * S3-compatible store. Cloudflare R2 in production:
 *   STORAGE_DRIVER=s3
 *   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   S3_REGION=auto
 *   S3_BUCKET=vendly-public            (listing photos, avatars, proof photos)
 *   S3_PRIVATE_BUCKET=vendly-private   (contracts, signatures, event files; never public)
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   S3_PUBLIC_URL=https://pub-xxxx.r2.dev   (or a custom domain like https://media.example.com)
 * The older AWS_* names still work as fallbacks.
 */
export function storageSettings() {
  const env = process.env;
  const driver: 'local' | 's3' = env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
  return {
    driver,
    endpoint: env.S3_ENDPOINT ?? env.AWS_ENDPOINT,
    region: env.S3_REGION ?? env.AWS_DEFAULT_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? env.AWS_BUCKET,
    privateBucket: env.S3_PRIVATE_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY,
    publicUrl: (env.S3_PUBLIC_URL ?? env.AWS_URL)?.replace(/\/+$/, ''),
  };
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Content type from the file name, so browsers show images instead of downloading them. */
export function contentTypeFor(key: string) {
  const ext = key.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}
