import { requireAdministrator } from '../auth/admin-authorization.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  settingsValuesSchema,
  type SaveSettings,
  type SettingsValues,
} from './settings.schemas.js';
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: ConfigService<Env, true>,
  ) {}
  defaults(): SettingsValues {
    return {
      name: this.env.get('SITE_NAME'),
      logoUrl: this.env.get('SITE_LOGO_URL') ?? null,
      primaryColor: this.env.get('SITE_PRIMARY_COLOR') ?? null,
      supportEmail: this.env.get('SITE_SUPPORT_EMAIL') ?? null,
      platformFeeBps: this.env.get('PLATFORM_FEE_BPS'),
      donorFeeBps: this.env.get('DONOR_FEE_BPS'),
      donorFlatFee: this.env.get('DONOR_FLAT_FEE').toString(),
      donorFlatFeeThreshold: this.env
        .get('DONOR_FLAT_FEE_THRESHOLD')
        .toString(),
      withdrawalFee: this.env.get('WITHDRAWAL_FEE').toString(),
    };
  }
  async get(db: Prisma.TransactionClient = this.prisma) {
    const row = await db.deploymentSettings.findUnique({
      where: { id: 'site' },
    });
    return {
      values: row ? settingsValuesSchema.parse(row.values) : this.defaults(),
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt ?? null,
      currency: this.env.get('DEFAULT_CURRENCY'),
    };
  }
  async save(actorId: string, input: SaveSettings) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(734267, 1)`;
      await requireAdministrator(tx, actorId);
      const current = await tx.deploymentSettings.findUnique({
        where: { id: 'site' },
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Settings changed. Reload before saving.');
      await tx.deploymentSettings.upsert({
        where: { id: 'site' },
        create: { id: 'site', values: input.values, version: 1 },
        update: { values: input.values, version: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'SETTINGS_CHANGED',
          targetType: 'DeploymentSettings',
          targetId: 'site',
          before: current?.values ?? this.defaults(),
          after: { ...input.values, reason: input.reason },
        },
      });
    });
    return this.get();
  }
}
