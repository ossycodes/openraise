import type { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
/** Set only inside a transaction; PostgreSQL clears it on commit or rollback. */
export async function auditActor(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  await tx.$queryRaw`SELECT set_config('openraise.audit_actor', ${actorId}, true)`;
}

export function withAuditActor<T>(
  prisma: PrismaService,
  actorId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await auditActor(tx, actorId);
    return work(tx);
  });
}
