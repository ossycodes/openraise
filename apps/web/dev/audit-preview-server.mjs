// Loopback-only fictional audit records. Does not connect to a database.
import { createServer } from 'node:http';
const actions = [
  [
    'CAMPAIGN_CHANGED',
    'Campaign',
    { status: 'PENDING_REVIEW', moderationPaused: false, payoutsFrozen: false },
    { status: 'ACTIVE', moderationPaused: false, payoutsFrozen: false },
  ],
  [
    'BANK_ACCOUNT_CHANGED',
    'BankAccount',
    { isDefault: true, removed: false },
    { isDefault: false, removed: true },
  ],
  [
    'IDENTITY_DECIDED',
    'IdentityVerification',
    { status: 'PENDING' },
    { status: 'VERIFIED' },
  ],
  ['ROLE_CHANGED', 'User', { role: 'USER' }, { role: 'ADMIN' }],
  [
    'REPORT_CHANGED',
    'CampaignReport',
    { status: 'OPEN' },
    { status: 'RESOLVED' },
  ],
  [
    'BANK_ACCOUNT_ADDED',
    'BankAccount',
    null,
    { isDefault: true, removed: false },
  ],
];
const rows = Array.from({ length: 27 }, (_, n) => {
  const [action, targetType, before, after] = actions[n % actions.length];
  return {
    id: `audit-event-${String(27 - n).padStart(2, '0')}`,
    createdAt: new Date(
      Date.parse('2026-11-06T12:15:00Z') - n * 3600000,
    ).toISOString(),
    actorId: n === 3 ? null : 'cm-admin-01',
    action,
    targetType,
    targetId: `cm-record-${String(n).padStart(2, '0')}`,
    subjectId: targetType === 'CampaignReport' ? null : 'cm-creator-01',
    before,
    after,
  };
});
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const send = (status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/users/me')
    return send(200, {
      id: 'cm-admin-01',
      name: 'Preview operator',
      role: req.headers.authorization === 'Bearer viewer' ? 'USER' : 'ADMIN',
    });
  if (url.pathname === '/config/site')
    return send(200, {
      name: 'OpenRaise',
      supportEmail: 'help@example.com',
      accentColor: '#1c5c43',
    });
  if (url.pathname === '/admin/audit') {
    const q = url.searchParams.get('q') ?? '';
    if (q === 'loading')
      await new Promise((resolve) => setTimeout(resolve, 2500));
    if (q === 'unavailable')
      return send(503, { message: 'Fictional unavailable state' });
    if (q === 'denied' || req.headers.authorization === 'Bearer viewer')
      return send(403, {});
    const action = url.searchParams.get('action'),
      from = url.searchParams.get('from'),
      to = url.searchParams.get('to');
    const matching = rows.filter(
      (r) =>
        (!q || [r.actorId, r.targetId, r.subjectId, r.id].includes(q)) &&
        (!action || action === r.action) &&
        (!from || r.createdAt.slice(0, 10) >= from) &&
        (!to || r.createdAt.slice(0, 10) <= to),
    );
    const page = Number(url.searchParams.get('page') ?? 1);
    return send(200, {
      items: matching.slice((page - 1) * 25, page * 25),
      hasMore: matching.length > page * 25,
      page,
    });
  }
  send(404, {});
}).listen(Number(process.env.AUDIT_PREVIEW_PORT ?? 4410), '127.0.0.1', () =>
  console.log('Fictional audit preview API ready'),
);
