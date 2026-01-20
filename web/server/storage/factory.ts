import type { Storage } from "./types"
import { S3Storage } from "./s3"
import { env } from "../env"

/**
 * Create S3-compatible storage.
 * Dev: credentials auto-provided by docker-compose (MinIO)
 * Prod: credentials must be set in deployment config (real S3/R2)
 */
export function createStorage(): Storage {
  return new S3Storage({
    endpoint: env.S3_ENDPOINT,
    publicUrl: env.S3_PUBLIC_URL,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
  })
}
