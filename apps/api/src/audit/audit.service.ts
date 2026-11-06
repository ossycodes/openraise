import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuditQuery } from './audit.schemas.js';
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async list(q: AuditQuery) {
    const where: Prisma.AuditEventWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.q
        ? {
            OR: [
              { actorId: q.q },
              { targetId: q.q },
              { subjectId: q.q },
              { id: q.q },
            ],
          }
        : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
              ...(q.to
                ? { lt: new Date(Date.parse(`${q.to}T00:00:00Z`) + 86400000) }
                : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * 25,
      take: 26,
      select: {
        id: true,
        createdAt: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        subjectId: true,
        before: true,
        after: true,
      },
    });
    return {
      items: rows.slice(0, 25),
      page: q.page,
      hasMore: rows.length > 25,
    };
  }
}
