import {
  CreateBucketCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * Files in any S3-compatible store (SeaweedFS locally, R2 or S3 in
 * production). Browsers upload directly with presigned URLs, so file bytes
 * never pass through the API.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;
  private readonly createBucket: boolean;

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('STORAGE_ENDPOINT');
    this.s3 = new S3Client({
      region: config.get('STORAGE_REGION'),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE'),
      // The SDK now adds CRC checksums by default, including to presigned
      // URLs. A browser upload can't match them and many S3-compatible stores
      // reject them (BadDigest), so only send checksums where S3 requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.get('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = config.get('STORAGE_BUCKET');
    this.publicBase = config.get('STORAGE_PUBLIC_URL').replace(/\/+$/, '');
    this.createBucket = config.get('STORAGE_CREATE_BUCKET');
  }

  async onModuleInit(): Promise<void> {
    if (!this.createBucket) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket "${this.bucket}"`);
      } catch (error) {
        // Don't stop the API booting; uploads will fail with a clear error.
        this.logger.warn(`Storage unavailable: ${String(error)}`);
      }
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /** A URL the browser can PUT one file to, with this exact Content-Type. */
  presignUpload(
    key: string,
    contentType: string,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  /** Size and type of a stored object, or null if it doesn't exist. */
  async head(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** The first `length` bytes of an object, to check what it really is. */
  async readStart(key: string, length = 16): Promise<Uint8Array> {
    const res = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    return res.Body ? res.Body.transformToByteArray() : new Uint8Array();
  }

  /** Server-owned immutable snapshot: no presigned PUT is issued for the destination. */
  async copy(source: string, destination: string): Promise<void> {
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destination,
        CopySource: [this.bucket, ...source.split('/')]
          .map(encodeURIComponent)
          .join('/'),
      }),
    );
  }
  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Delete without failing the caller; logs instead. For cleanup. */
  async deleteQuietly(key: string): Promise<void> {
    try {
      await this.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${String(error)}`);
    }
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
