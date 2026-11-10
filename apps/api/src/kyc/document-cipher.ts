import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/**
 * The deployment's document cipher: KYC_ENCRYPTION_KEY, or a key derived from
 * JWT_SECRET so installs without one keep working. Identity and organisation
 * documents share it; the storage key in the AAD keeps each file to its path.
 */
export function documentCipher(config: ConfigService<Env, true>): DocumentCipher {
  const own = config.get('KYC_ENCRYPTION_KEY', { infer: true });
  return own
    ? new DocumentCipher(own, 'openraise-kyc-document-v1')
    : new DocumentCipher(
        config.get('JWT_SECRET', { infer: true }),
        'openraise-kyc-document-from-jwt-secret-v1',
      );
}

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM for ID document images. Storage buckets often serve files
 * publicly (campaign photos live there too), so documents are encrypted
 * before they are written and only the API can read them back.
 *
 * Layout: [version 1 byte][IV 12 bytes][tag 16 bytes][ciphertext]. The
 * storage key is bound in as associated data, so a document copied to
 * another user's path won't decrypt.
 */
export class DocumentCipher {
  private readonly key: Buffer;

  constructor(secret: string, label: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', secret, Buffer.alloc(0), label, 32),
    );
  }

  encrypt(plain: Uint8Array, storageKey: string): Uint8Array {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(storageKey));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      body,
    ]);
  }

  /** Throws if the data was altered, moved or encrypted with another key. */
  decrypt(sealed: Uint8Array, storageKey: string): Uint8Array {
    const data = Buffer.from(sealed);
    if (data.length < 1 + IV_BYTES + TAG_BYTES || data[0] !== VERSION)
      throw new Error('Unrecognised document format');
    const iv = data.subarray(1, 1 + IV_BYTES);
    const tag = data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(storageKey));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  }
}
