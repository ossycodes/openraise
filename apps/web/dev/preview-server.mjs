// Local-only fictional campaign API for design review and browser tests.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { computeDonationFees, DEFAULT_FEE_CONFIG } from '@openraise/shared';
const previewPort = Number(process.env.CAMPAIGN_PREVIEW_PORT ?? 4401);
const slug = 'help-ada-finish-nursing-school';
const campaign = {
  id: 'preview-campaign',
  slug,
  title: 'Help Ada finish nursing school',
  summary:
    'Two semesters to go. A lifetime of caring ahead. Help Ada turn her calling into a career.',
  story:
    'Ada has always been the person who shows up. For her neighbours, for her family, and now for the patients she meets during her clinical placements. Becoming a nurse isn’t just her dream. It’s how she hopes to give back.\n\nShe is in her final year of nursing school in Ibadan. After a fire destroyed her father’s shop, her family could no longer cover her remaining tuition and clinical fees. Two semesters stand between Ada and the work she has spent years preparing for.\n\nWe’re raising ₦5,000,000 to cover her final-year tuition, required clinical placements, examination fees and essential learning materials. Every contribution helps close that gap, however big or small.\n\nI’m Chidinma, Ada’s older sister. I’m organising this fundraiser with our family, and I’ll use the money raised to pay the school and clinical fees. Thank you for being part of what comes next.',
  category: { slug: 'education', name: 'Education' },
  owner: { name: 'Chidinma Okafor' },
  beneficiaryName: 'Ada Okafor',
  location: 'Ibadan, Nigeria',
  currency: 'NGN',
  goalAmount: '500000000',
  raisedAmount: '324500000',
  donorCount: 64,
  status: 'ACTIVE',
  endsAt: null,
  publishedAt: '2026-10-22T10:00:00Z',
  createdAt: '2026-10-21T10:00:00Z',
  coverImageUrl: '/preview/ada-study.png',
  images: [{ id: 'preview-photo', url: '/preview/ada-study.png', position: 0 }],
};
const previewUpdates = [
  {
    id: 'preview-update-1',
    title: 'One step closer: Ada is back in class',
    body: 'Because you showed up, Ada’s first semester fees are now paid. She returned to her clinical placement this week, with her books, uniform and a little more room to breathe.\n\nWe still have one semester to go. Thank you for helping this next chapter take shape. We’ll keep sharing our progress here.',
    publishedAt: '2026-11-06T09:00:00Z',
    hiddenAt: null,
    images: [
      { id: 'update-photo', url: '/preview/ada-study.png', position: 0 },
    ],
  },
  {
    id: 'preview-update-2',
    title: 'A little kindness, a very big beginning',
    body: 'Our family is grateful for every gift, every message and every person who shared Ada’s story. This is our first update, and the beginning of a journey we’re glad to share with you.',
    publishedAt: '2026-11-02T12:00:00Z',
    hiddenAt: null,
    images: [],
  },
];
const reviewCampaigns = [
  {
    ...campaign,
    id: 'review-ada',
    status: 'PENDING_REVIEW',
    raisedAmount: '0',
    donorCount: 0,
    publishedAt: null,
    submittedAt: '2026-11-04T10:00:00Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
  },
  {
    ...campaign,
    id: 'review-library',
    title: 'A reading room for our neighbourhood',
    summary: 'Help us put books and possibility within reach.',
    owner: { name: 'Tomi Adeyemi' },
    location: 'Yaba, Lagos',
    goalAmount: '180000000',
    coverImageUrl: null,
    images: [],
    status: 'PENDING_REVIEW',
    submittedAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
  },
  {
    ...campaign,
    id: 'review-water',
    title: 'Clean water. A healthier beginning.',
    owner: { name: 'Amina Yusuf' },
    category: { slug: 'community', name: 'Community' },
    location: 'Kaduna, Nigeria',
    goalAmount: '320000000',
    coverImageUrl: null,
    images: [],
    status: 'PENDING_REVIEW',
    submittedAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
  },
];
const reviewHistory = new Map();
const reportCampaign = {
  ...campaign,
  updatedAt: '2026-11-06T10:00:00.000Z',
  moderationPaused: false,
  moderationPauseReason: null,
  payoutsFrozen: false,
  payoutFreezeReason: null,
};
const previewReports = [
  {
    id: 'report-budget',
    campaignId: campaign.id,
    category: 'MISLEADING',
    details:
      'The tuition figures in the story appear to add up to a different amount from the fundraising goal. Please ask the organiser for a breakdown before more donations are collected.',
    status: 'OPEN',
    createdAt: '2026-11-06T09:15:00Z',
    updatedAt: '2026-11-06T09:15:00.000Z',
  },
  {
    id: 'report-photo',
    campaignId: campaign.id,
    category: 'OTHER',
    details:
      'Could the organiser clarify when the campaign photo was taken and how the money will be used?',
    status: 'OPEN',
    createdAt: '2026-11-06T09:40:00Z',
    updatedAt: '2026-11-06T09:40:00.000Z',
  },
];
const reportActions = new Map();
const reportKeys = new Set();
const sessions = new Map();
const keys = new Map();
const serialize = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  );
const supporters = [2500000, 1000000, 500000, 2000000].map((amount, index) => ({
  id: `supporter-${index}`,
  amount: String(amount),
  currency: 'NGN',
  confirmedAt: `2026-11-0${5 - index}T10:00:00Z`,
  displayName: index === 0 ? 'Amaka' : 'Anonymous',
  message:
    index === 0
      ? 'One step closer. We are cheering you on!'
      : index === 1
        ? 'Wishing you every success.'
        : null,
}));
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, value) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  let body = {};
  if (req.method === 'POST') {
    let raw = '';
    for await (const part of req) raw += part;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(400, { message: 'Invalid JSON' });
    }
  }
  if (url.pathname === '/__test/state' && req.method === 'POST') {
    const session = sessions.get(body.id);
    if (!session) return send(404, {});
    session.status = body.status ?? 'SUCCEEDED';
    return send(200, session);
  }
  // Optional loopback-only admin fixtures. Never used by the deployed API.
  if (process.env.REVIEW_PREVIEW === 'true') {
    const isAdmin = req.headers.authorization === 'Bearer fictional-admin';
    if (url.pathname === '/users/me')
      return send(200, {
        name: 'Review team',
        role: isAdmin ? 'ADMIN' : 'USER',
      });
    if (
      url.pathname.match(/^\/campaigns\/[^/]+\/reports$/) &&
      req.method === 'POST'
    ) {
      const key = req.headers['idempotency-key'];
      if (!reportKeys.has(key)) {
        reportKeys.add(key);
        previewReports.push({
          id: randomUUID(),
          campaignId: campaign.id,
          ...body,
          status: 'OPEN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return send(202, { received: true });
    }
    if (url.pathname === '/campaigns/mine') return send(200, [reportCampaign]);
    if (
      url.pathname === '/admin/reports' ||
      url.pathname.startsWith('/admin/reports/')
    ) {
      if (!isAdmin)
        return send(403, { message: 'Administrator access needed' });
      if (url.pathname === '/admin/reports') {
        const q = url.searchParams.get('q') || '';
        if (q === 'unavailable')
          return send(503, { message: 'Preview outage' });
        const items = previewReports
          .filter(
            (r) =>
              r.status === (url.searchParams.get('status') || 'OPEN') &&
              campaign.title.toLowerCase().includes(q.toLowerCase()),
          )
          .map((r) => ({
            ...r,
            details: r.details.slice(0, 160),
            campaign: reportCampaign,
          }));
        return send(200, {
          items,
          total: items.length,
          open: previewReports.filter((r) => r.status === 'OPEN').length,
          page: 1,
          limit: 20,
        });
      }
      const match = url.pathname.match(
        /^\/admin\/reports\/([^/]+)(\/actions)?$/,
      );
      const report = previewReports.find((r) => r.id === match?.[1]);
      if (!report) return send(404, { message: 'Report not found' });
      if (req.method === 'POST') {
        if (
          report.updatedAt !== body.expectedReportUpdatedAt ||
          reportCampaign.updatedAt !== body.expectedCampaignUpdatedAt
        )
          return send(409, {
            message:
              'This report or campaign has changed. Reload before taking action.',
          });
        const { action, reason } = body;
        if (action === 'PAUSE') {
          reportCampaign.status = 'PAUSED';
          reportCampaign.moderationPaused = true;
          reportCampaign.moderationPauseReason = reason;
        }
        if (action === 'LIFT_PAUSE') {
          reportCampaign.moderationPaused = false;
          reportCampaign.moderationPauseReason = null;
        }
        if (action === 'FREEZE') {
          reportCampaign.payoutsFrozen = true;
          reportCampaign.payoutFreezeReason = reason;
        }
        if (action === 'UNFREEZE') {
          reportCampaign.payoutsFrozen = false;
          reportCampaign.payoutFreezeReason = null;
        }
        if (action === 'RESOLVE') report.status = 'RESOLVED';
        if (action === 'DISMISS') report.status = 'DISMISSED';
        report.updatedAt = new Date().toISOString();
        reportCampaign.updatedAt = new Date().toISOString();
        reportActions.set(report.id, [
          {
            id: randomUUID(),
            action,
            reason,
            createdAt: new Date().toISOString(),
            actor: { name: 'Review team' },
          },
          ...(reportActions.get(report.id) || []),
        ]);
        return send(200, { recorded: true });
      }
      return send(200, {
        report,
        campaign: reportCampaign,
        controls: reportCampaign,
        actions: reportActions.get(report.id) || [],
      });
    }
    if (url.pathname.startsWith('/admin/')) {
      if (!isAdmin)
        return send(403, { message: 'Administrator access needed' });
      if (url.pathname === '/admin/campaigns') {
        const q = url.searchParams.get('q') || '';
        if (q === 'unavailable')
          return send(503, { message: 'Preview outage' });
        const items = reviewCampaigns.filter(
          (c) =>
            c.status === (url.searchParams.get('status') || 'PENDING_REVIEW') &&
            (c.title + ' ' + c.owner.name)
              .toLowerCase()
              .includes(q.toLowerCase()),
        );
        return send(200, {
          items,
          total: items.length,
          pending: reviewCampaigns.filter((c) => c.status === 'PENDING_REVIEW')
            .length,
          page: 1,
          limit: 20,
        });
      }
      const match = url.pathname.match(
        /^\/admin\/campaigns\/([^/]+)(\/review)?$/,
      );
      const c = reviewCampaigns.find((c) => c.id === match?.[1]);
      if (!c) return send(404, { message: 'Campaign not found' });
      if (req.method === 'POST') {
        if (
          c.status !== 'PENDING_REVIEW' ||
          c.updatedAt !== body.expectedUpdatedAt
        )
          return send(409, {
            message:
              'This submission has changed or was already reviewed. Reload it before deciding.',
          });
        c.status = body.decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
        c.rejectionReason = body.reason ?? null;
        c.updatedAt = new Date().toISOString();
        reviewHistory.set(c.id, [
          {
            id: randomUUID(),
            decision: body.decision,
            reason: body.reason ?? null,
            createdAt: new Date().toISOString(),
            reviewer: { name: 'Review team' },
          },
        ]);
        return send(200, c);
      }
      return send(200, {
        campaign: c,
        organiser: {
          name: c.owner.name,
          emailVerified: true,
          createdAt: '2026-10-20T12:00:00Z',
        },
        reviews: reviewHistory.get(c.id) ?? [],
      });
    }
  }
  if (url.pathname === '/config/fees')
    return send(200, {
      currency: 'NGN',
      platformFeeBps: 350,
      donorFeeBps: 150,
      donorFlatFee: '10000',
      donorFlatFeeThreshold: '250000',
      withdrawalFee: '5000',
    });
  if (url.pathname === '/categories')
    return send(
      200,
      [
        'Education',
        'Medical',
        'Community',
        'Emergencies',
        'Environment',
        'Creative',
        'Business',
        'Animals',
      ].map((name) => ({ slug: name.toLowerCase(), name })),
    );
  if (url.pathname === '/campaigns') {
    const category = url.searchParams.get('category');
    const items = !category || category === 'education' ? [campaign] : [];
    return send(200, { items, page: 1, limit: 12, total: items.length });
  }
  // Fictional owner responses are confined to this loopback preview server.
  if (url.pathname === '/campaigns/mine') return send(200, [campaign]);
  const updatesMatch = url.pathname.match(
    /^\/campaigns\/([^/]+)\/updates(?:\/(mine))?$/,
  );
  if (updatesMatch) {
    const resource = updatesMatch[1];
    if (resource === 'unavailable-updates') return send(503, {});
    if (req.method === 'POST') {
      const update = {
        id: randomUUID(),
        ...body,
        publishedAt: new Date().toISOString(),
        hiddenAt: null,
        images: [],
      };
      previewUpdates.unshift(update);
      return send(201, update);
    }
    return send(200, {
      items: resource === 'empty-campaign' ? [] : previewUpdates,
      page: Number(url.searchParams.get('page') || 1),
      hasMore: false,
    });
  }
  if (
    url.pathname.startsWith('/campaign-update-subscriptions/') &&
    req.method === 'POST'
  )
    return send(200, { unsubscribed: true });
  const trailMatch = url.pathname.match(/^\/campaigns\/([^/]+)\/money-trail$/);
  if (trailMatch) {
    const resource = trailMatch[1];
    if (resource === 'unavailable-trail') return send(503, {});
    const page = Number(url.searchParams.get('page') || 1);
    let trail = {
      currency: 'NGN',
      asOf: '2026-11-06T14:00:00Z',
      raised: '324500000',
      platformFeesDeducted: '8125000',
      donorCoveredPlatformFees: '3232500',
      received: '316375000',
      donationCount: 64,
      walletBalance: '146375000',
      reserved: '50000000',
      paidOut: '119995000',
      withdrawalFeesPaid: '5000',
      returned: '25000000',
      otherWalletChanges: '0',
    };
    let items = [
      {
        id: 'trail-held',
        amount: '50000000',
        fee: '5000',
        netPaidOut: '49995000',
        state: 'IN_PROGRESS',
        requestedAt: '2026-11-06T10:00:00Z',
        recordedAt: '2026-11-06T10:00:00Z',
      },
      {
        id: 'trail-paid',
        amount: '120000000',
        fee: '5000',
        netPaidOut: '119995000',
        state: 'PAID',
        requestedAt: '2026-11-04T10:00:00Z',
        recordedAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 'trail-returned',
        amount: '25000000',
        fee: '5000',
        netPaidOut: '24995000',
        state: 'RETURNED',
        requestedAt: '2026-11-02T10:00:00Z',
        recordedAt: '2026-11-03T10:00:00Z',
      },
    ];
    if (resource === 'empty-campaign') {
      for (const key of [
        'raised',
        'platformFeesDeducted',
        'donorCoveredPlatformFees',
        'received',
        'walletBalance',
        'reserved',
        'paidOut',
        'withdrawalFeesPaid',
        'returned',
        'otherWalletChanges',
      ])
        trail[key] = '0';
      trail.donationCount = 0;
      items = [];
    }
    if (resource === 'adjusted-trail') {
      trail.otherWalletChanges = '-1000000';
      trail.walletBalance = '145375000';
    }
    if (resource === 'large-money-trail') {
      for (const key of [
        'platformFeesDeducted',
        'donorCoveredPlatformFees',
        'reserved',
        'paidOut',
        'withdrawalFeesPaid',
        'returned',
      ])
        trail[key] = '0';
      trail.raised = '9007199254740993';
      trail.received = trail.raised;
      trail.walletBalance = trail.raised;
      items = [];
    }
    if (resource === 'paged-trail') {
      items = Array.from({ length: 21 }, (_, i) => ({
        id: `page-withdrawal-${i}`,
        amount: '1000000',
        fee: '5000',
        netPaidOut: '995000',
        state: 'RETURNED',
        requestedAt: new Date(Date.UTC(2026, 10, 6, 12 - i)).toISOString(),
        recordedAt: new Date(Date.UTC(2026, 10, 6, 12 - i)).toISOString(),
      }));
      trail.walletBalance = trail.received;
      trail.reserved = '0';
      trail.paidOut = '0';
      trail.withdrawalFeesPaid = '0';
      trail.returned = '21000000';
    }
    return send(200, {
      ...trail,
      withdrawals: {
        items: items.slice((page - 1) * 20, page * 20),
        page,
        hasMore: items.length > page * 20,
        total: items.length,
      },
    });
  }
  const statusMatch = url.pathname.match(/^\/donations\/([^/]+)$/);
  if (statusMatch) {
    const session = sessions.get(statusMatch[1]);
    if (!session || req.headers['x-donation-token'] !== session.statusToken)
      return send(404, {});
    return send(200, session);
  }
  const match = url.pathname.match(
    /^\/campaigns\/([^/]+)(?:\/donations(?:\/(quote|checkout))?)?$/,
  );
  if (!match) return send(404, {});
  const resource = match[1];
  const action = match[2];
  if (resource === 'missing-campaign') return send(404, {});
  if (resource === 'unavailable-campaign') return send(503, {});
  const data = { ...campaign, slug: resource };
  if (resource === 'video-campaign' || resource === 'video-only-campaign')
    data.videoUrl = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
  if (resource === 'video-only-campaign') {
    data.coverImageUrl = null;
    data.images = [];
  }
  if (resource === 'paused-campaign') data.status = 'PAUSED';
  if (resource === 'empty-campaign') {
    data.raisedAmount = '0';
    data.donorCount = 0;
    data.images = [];
    data.coverImageUrl = null;
  }
  if (resource === 'long-campaign') {
    data.title =
      'A community coming together to support a remarkably long campaign title and a hopeful new beginning';
    data.owner = {
      name: 'A very long organiser name that must remain readable on every screen',
    };
  }
  if (!url.pathname.includes('/donations')) return send(200, data);
  if (!action && resource === 'partial-campaign') return send(503, {});
  if (!action)
    return send(200, {
      items:
        resource === 'empty-campaign'
          ? []
          : url.searchParams.get('sort') === 'top'
            ? [...supporters].sort((a, b) =>
                BigInt(a.amount) > BigInt(b.amount)
                  ? -1
                  : BigInt(a.amount) < BigInt(b.amount)
                    ? 1
                    : 0,
              )
            : supporters,
    });
  if (resource === 'payments-unavailable')
    return send(503, { message: 'Payments are disabled' });
  if (data.status !== 'ACTIVE') return send(404, {});
  let fees;
  try {
    if (!/^[1-9]\d{0,18}$/.test(body.amount) || BigInt(body.amount) < 100000n)
      return send(400, { message: 'Below minimum', minimumAmount: '100000' });
    fees = {
      ...serialize(
        computeDonationFees(BigInt(body.amount), DEFAULT_FEE_CONFIG, {
          donorCoversPlatformFee: body.donorCoversPlatformFee,
        }),
      ),
      currency: 'NGN',
      provider: 'bachs',
      minimumAmount: '100000',
    };
  } catch {
    return send(400, { message: 'Invalid amount' });
  }
  if (action === 'quote') return send(200, fees);
  const key = req.headers['idempotency-key'];
  if (!key) return send(400, { message: 'Idempotency key required' });
  if (keys.has(key)) return send(201, sessions.get(keys.get(key)));
  if (!body.email?.includes('@'))
    return send(400, { message: 'Email required' });
  const id = randomUUID();
  if (body.email === 'changed@example.com') {
    fees.totalCharged = String(BigInt(fees.totalCharged) + 100n);
    fees.donorFee = String(BigInt(fees.donorFee) + 100n);
  }
  const session = {
    ...fees,
    id,
    status: 'PENDING',
    checkoutState:
      body.email === 'uncertain@example.com' ? 'UNCERTAIN' : 'READY',
    checkoutUrl: `https://checkout.preview.test/${id}`,
    statusToken: randomUUID(),
  };
  sessions.set(id, session);
  keys.set(key, id);
  if (session.checkoutState === 'UNCERTAIN')
    return send(503, {
      donationId: id,
      statusToken: session.statusToken,
      message:
        'Checkout outcome is uncertain; check payment status before starting another donation.',
    });
  return send(201, session);
}).listen(previewPort, '127.0.0.1', () =>
  console.log(
    `Fictional preview API on http://127.0.0.1:${previewPort} · ${slug}`,
  ),
);
