import { createHash, randomBytes } from 'node:crypto';

/** A URL-safe random token (32 bytes = 256 bits by default). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hex SHA-256. Tokens are stored only as this hash. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
