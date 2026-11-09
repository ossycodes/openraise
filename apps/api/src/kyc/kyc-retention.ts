import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withAuditActor } from '../audit/actor.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

/** Recorded as the actor on audit events the sweep causes. */
export const RETENTION_ACTOR = 'system:id-photo-retention';
/** An uploaded photo nobody submitted within a day is abandoned. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Deletes ID photos nobody needs any more: a verified person's photo once the
 * retention period has passed (the verification itself stands), and uploads
 * that were never submitted. Declined photos are deleted at decision time.
 */
@Injectable()
export class KycRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async sweep(now = new Date()): Promise<{ documents: number; orphans: number }> {
    return {
      documents: await this.expireVerified(now),
      orphans: await this.removeOrphans(now),
    };
  }

  private async expireVerified(now: Date): Promise<number> {
    const days = this.config.get('KYC_DOCUMENT_RETENTION_DAYS', { infer: true });
    const due = await this.prisma.identityVerification.findMany({
      where: {
        status: 'VERIFIED',
        documentKey: { not: null },
        decidedAt: { lt: new Date(now.getTime() - days * DAY_MS) },
      },
      orderBy: { decidedAt: 'asc' },
      take: BATCH,
      select: { id: true, documentKey: true },
    });
    let deleted = 0;
    for (const row of due) {
      // The row first, so the photo is never shown after this point; a failed
      // file delete is logged by deleteQuietly.
      const { count } = await withAuditActor(this.prisma, RETENTION_ACTOR, (tx) =>
        tx.identityVerification.updateMany({
          where: { id: row.id, documentKey: row.documentKey },
          data: {
            documentKey: null,
            documentContentType: null,
            documentDeletedAt: now,
          },
        }),
      );
      if (count === 0) continue;
      await this.storage.deleteQuietly(row.documentKey!);
      deleted++;
    }
    return deleted;
  }

  /** Uploads never submitted. Only keys this database recorded are touched. */
  private async removeOrphans(now: Date): Promise<number> {
    const stale = await this.prisma.identityDocumentUpload.findMany({
      where: { createdAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
      select: { key: true },
    });
    let removed = 0;
    for (const { key } of stale) {
      // Whoever deletes the row owns the file: a submit claiming the same
      // upload at this moment either wins (and keeps it) or is told to
      // upload again.
      const { count } = await this.prisma.identityDocumentUpload.deleteMany({
        where: { key },
      });
      if (count === 0) continue;
      await this.storage.deleteQuietly(key);
      removed++;
    }
    return removed;
  }
}

/** Runs the sweep hourly in every API process; each step is idempotent. */
@Injectable()
export class KycRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KycRetentionWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(private readonly retention: KycRetentionService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.run(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  run(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopping) return Promise.resolve();
    this.running = this.retention
      .sweep()
      .then(({ documents, orphans }) => {
        if (documents || orphans)
          this.logger.log(
            `ID photo retention: ${documents} expired, ${orphans} abandoned uploads deleted`,
          );
      })
      .catch((error: unknown) =>
        this.logger.warn(`ID photo retention sweep failed: ${String(error)}`),
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
