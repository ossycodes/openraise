import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
/** Recheck access at commit time, including after a slow provider lookup. */
export async function requireAdministrator(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "User" WHERE "id" = ${id} AND "role" = 'ADMIN' FOR SHARE`;
  if (!rows.length)
    throw new ForbiddenException('Administrator access is no longer available');
}
