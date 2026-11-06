import type { Prisma } from '../generated/prisma/client.js';
/** Shared with the admin money workspace so alert thresholds cannot drift. */
export const withdrawalReviewWhere = (
  now = new Date(),
): Prisma.WithdrawalWhereInput => ({
  OR: [
    { reconciliationRequired: true },
    { status: 'UNCERTAIN' },
    {
      status: 'INITIALIZING',
      createdAt: { lt: new Date(now.getTime() - 60000) },
    },
    {
      status: 'PENDING',
      updatedAt: { lt: new Date(now.getTime() - 86400000) },
    },
  ],
});
