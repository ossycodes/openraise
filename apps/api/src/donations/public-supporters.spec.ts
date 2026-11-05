import { NotFoundException } from '@nestjs/common';
import { DonationsService } from './donations.service.js';

describe('public supporter privacy', () => {
  const campaign = { findFirst: vi.fn() };
  const donation = { findMany: vi.fn() };
  const service = new DonationsService(
    { campaign, donation } as never,
    {} as never,
    {} as never,
    null,
  );
  beforeEach(() => vi.resetAllMocks());
  it('restricts the query to public campaigns and settled donations and selects no donor identifiers', async () => {
    campaign.findFirst.mockResolvedValue({ id: 'campaign' });
    donation.findMany.mockResolvedValue([
      {
        id: 'donation',
        amount: 500000n,
        currency: 'NGN',
        succeededAt: new Date('2026-11-05T12:00:00Z'),
      },
    ]);
    expect(await service.publicSupporters('slug')).toEqual({
      items: [
        {
          id: 'donation',
          amount: '500000',
          currency: 'NGN',
          confirmedAt: '2026-11-05T12:00:00.000Z',
        },
      ],
    });
    expect(campaign.findFirst).toHaveBeenCalledWith({
      where: { slug: 'slug', status: { in: ['ACTIVE', 'PAUSED', 'ENDED'] } },
      select: { id: true },
    });
    expect(donation.findMany).toHaveBeenCalledWith({
      where: {
        campaignId: 'campaign',
        status: 'SUCCEEDED',
        ledgerTransactionId: { not: null },
        succeededAt: { not: null },
      },
      select: { id: true, amount: true, currency: true, succeededAt: true },
      orderBy: [{ succeededAt: 'desc' }, { id: 'desc' }],
      take: 6,
    });
  });
  it('does not query donations when the campaign is unavailable or private', async () => {
    campaign.findFirst.mockResolvedValue(null);
    await expect(service.publicSupporters('private')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(donation.findMany).not.toHaveBeenCalled();
  });
});
