// Loopback-only, fictional money records for UI review. Never moves funds.
import { createServer } from 'node:http';
const campaign = {
  id: 'preview-campaign',
  title: 'Help Ada finish nursing school',
  slug: 'help-ada-finish-nursing-school',
};
const createdAt = '2026-11-06T10:15:00Z';
const values = {
  NGN: {
    PROVIDER_CLEARING: '5085000',
    CAMPAIGN_WALLET: '4725000',
    PENDING_PAYOUTS: '100000',
    PLATFORM_REVENUE: '175000',
    DONOR_FEES: '85000',
  },
  USD: {
    PROVIDER_CLEARING: '102900',
    CAMPAIGN_WALLET: '96500',
    PENDING_PAYOUTS: '0',
    PLATFORM_REVENUE: '3500',
    DONOR_FEES: '2900',
  },
};
const makeEntries = (currency, amounts) =>
  Object.entries(amounts).map(([type, amount], i) => ({
    id: `entry-${currency}-${i}`,
    amount,
    account: {
      id: `account-${type}-${currency}`,
      type,
      currency,
      campaign: type === 'CAMPAIGN_WALLET' ? campaign : null,
    },
  }));
const postings = [
  {
    id: 'ledger-donation',
    kind: 'DONATION',
    currency: 'NGN',
    description: 'Donation don_DEMO_1001',
    createdAt,
    entries: makeEntries('NGN', {
      PROVIDER_CLEARING: '5085000',
      CAMPAIGN_WALLET: '-4825000',
      PLATFORM_REVENUE: '-175000',
      DONOR_FEES: '-85000',
    }),
    donation: { id: 'don-settled', reference: 'don_DEMO_1001' },
  },
  {
    id: 'ledger-reservation',
    kind: 'WITHDRAWAL_HOLD',
    currency: 'NGN',
    description: 'Withdrawal reservation wd_DEMO_2001',
    createdAt,
    entries: makeEntries('NGN', {
      CAMPAIGN_WALLET: '100000',
      PENDING_PAYOUTS: '-100000',
    }),
    withdrawalHold: { id: 'withdrawal-review', reference: 'wd_DEMO_2001' },
  },
  {
    id: 'ledger-usd',
    kind: 'DONATION',
    currency: 'USD',
    description: 'Donation don_DEMO_1002',
    createdAt,
    entries: makeEntries('USD', {
      PROVIDER_CLEARING: '102900',
      CAMPAIGN_WALLET: '-96500',
      PLATFORM_REVENUE: '-3500',
      DONOR_FEES: '-2900',
    }),
    donation: { id: 'don-usd', reference: 'don_DEMO_1002' },
  },
];
const records = {
  WITHDRAWAL: [
    {
      id: 'withdrawal-review',
      kind: 'WITHDRAWAL',
      campaign,
      reference: 'wd_DEMO_2001',
      provider: 'paystack',
      currency: 'NGN',
      amount: '100000',
      fee: '5000',
      netPaidOut: '95000',
      status: 'UNCERTAIN',
      reason: 'provider-outcome-uncertain',
      createdAt,
      updatedAt: createdAt,
      providerPayoutId: null,
      bankName: 'Demo Bank',
      maskedAccountNumber: '•••• 7890',
      payoutsFrozen: true,
      payoutFreezeReason: 'Waiting for a confirmed provider outcome.',
      ledgerLinks: [{ id: 'ledger-reservation', label: 'Reservation' }],
      freezes: [
        {
          id: 'freeze-1',
          frozen: true,
          reason: 'Waiting for a confirmed provider outcome.',
          createdAt,
          actor: { name: 'Operations reviewer' },
        },
      ],
    },
  ],
  DONATION: [
    {
      id: 'checkout-review',
      kind: 'DONATION',
      campaign,
      reference: 'don_DEMO_1003',
      provider: 'paystack',
      providerCheckoutId: null,
      providerPaymentId: null,
      currency: 'NGN',
      amount: '500000',
      totalCharged: '517500',
      platformFee: '17500',
      donorFee: '17500',
      netToCampaign: '482500',
      status: 'PENDING',
      checkoutState: 'UNCERTAIN',
      reason: 'unknown-checkout-outcome',
      createdAt,
      updatedAt: createdAt,
      ledgerLinks: [],
    },
  ],
  EVENT: [
    {
      id: 'event-review',
      kind: 'EVENT',
      reference: 'don_DEMO_1003',
      provider: 'paystack',
      eventId: 'charge.success:demo-3001',
      type: 'payment.succeeded',
      resourceId: 'provider-payment-demo',
      currency: 'NGN',
      amount: '517400',
      status: 'REJECTED',
      outcome: 'REJECTED',
      reason: 'amount-or-currency-mismatch',
      createdAt,
      receivedAt: createdAt,
      occurredAt: createdAt,
      processedAt: createdAt,
      campaign: null,
      ledgerLinks: [],
      relatedRecords: [
        { id: 'checkout-review', kind: 'DONATION', reference: 'don_DEMO_1003' },
      ],
    },
  ],
};
let mode = 'normal';
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, data) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/__mode') {
    mode = url.searchParams.get('value') ?? 'normal';
    return send(200, { mode });
  }
  if (url.pathname === '/config/site') return send(404, {});
  const admin = req.headers.authorization === 'Bearer fictional-admin';
  if (url.pathname === '/users/me')
    return send(200, {
      name: 'Operations reviewer',
      role: admin ? 'ADMIN' : 'USER',
    });
  if (!admin) return send(403, { message: 'Administrator access needed' });
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 1200));
  if (url.pathname === '/admin/money/summary')
    return mode === 'summary-error'
      ? send(503, { message: 'Preview unavailable' })
      : send(200, {
          asOf: createdAt,
          transactionCount: 3,
          unbalancedCount: mode === 'integrity-warning' ? 1 : 0,
          balances: Object.entries(values).flatMap(([currency, types]) =>
            Object.entries(types).map(([type, balance]) => ({
              currency,
              type,
              balance,
            })),
          ),
          review: { withdrawals: 1, donations: 1, events: 1 },
        });
  if (url.pathname === '/admin/money/ledger') {
    const q = url.searchParams.get('q') ?? '',
      currency = url.searchParams.get('currency'),
      kind = url.searchParams.get('kind');
    if (q === 'unavailable')
      return send(503, { message: 'Preview unavailable' });
    const items = postings
      .filter(
        (p) =>
          (!currency || p.currency === currency) &&
          (!kind || p.kind === kind) &&
          (!q ||
            (p.description + ' ' + p.id)
              .toLowerCase()
              .includes(q.toLowerCase())),
      )
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        currency: p.currency,
        description: p.description,
        createdAt: p.createdAt,
        entryCount: p.entries.length,
        debits: p.entries
          .reduce(
            (n, e) => n + (BigInt(e.amount) > 0n ? BigInt(e.amount) : 0n),
            0n,
          )
          .toString(),
        credits: p.entries
          .reduce(
            (n, e) => n + (BigInt(e.amount) < 0n ? -BigInt(e.amount) : 0n),
            0n,
          )
          .toString(),
      }));
    return send(200, {
      campaignWallet: url.searchParams.get('campaignId')
        ? {
            campaign,
            balances: [
              { currency: 'NGN', balance: '4725000' },
              { currency: 'USD', balance: '96500' },
            ],
          }
        : null,
      items,
      total: items.length,
      page: 1,
      limit: 20,
    });
  }
  const posting = url.pathname.match(/^\/admin\/money\/ledger\/([^/]+)$/);
  if (posting) {
    const p = postings.find((p) => p.id === posting[1]);
    return p
      ? send(200, {
          donation: null,
          withdrawalHold: null,
          withdrawalSettlement: null,
          withdrawalReversal: null,
          ...p,
          sum: '0',
          balanced: true,
        })
      : send(404, { message: 'Posting not found' });
  }
  if (url.pathname === '/admin/money/reconciliation') {
    const kind = url.searchParams.get('kind') ?? 'WITHDRAWAL',
      q = url.searchParams.get('q') ?? '',
      currency = url.searchParams.get('currency');
    if (q === 'unavailable')
      return send(503, { message: 'Preview unavailable' });
    const items = (records[kind] ?? [])
      .filter(
        (r) =>
          (!currency || r.currency === currency) &&
          (!q ||
            (r.reference + ' ' + (r.campaign?.title ?? ''))
              .toLowerCase()
              .includes(q.toLowerCase())),
      )
      .map((r) => ({
        ...r,
        status: kind === 'DONATION' ? r.checkoutState : r.status,
        amount: kind === 'DONATION' ? r.totalCharged : r.amount,
      }));
    return send(200, { items, total: items.length, page: 1, limit: 20 });
  }
  const match = url.pathname.match(
    /^\/admin\/money\/reconciliation\/(WITHDRAWAL|DONATION|EVENT)\/([^/]+)$/,
  );
  if (match) {
    if (match[2] === 'unknown-currency')
      return send(200, {
        ...records.EVENT[0],
        currency: 'XXX',
        amount: '517400',
      });
    const row = (records[match[1]] ?? []).find((r) => r.id === match[2]);
    return row
      ? send(200, row)
      : send(404, { message: 'Money record not found' });
  }
  send(404, {});
}).listen(Number(process.env.MONEY_PREVIEW_PORT ?? 4408), '127.0.0.1', () =>
  console.log('Fictional read-only money preview API on 4408'),
);
