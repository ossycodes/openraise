import { SUPPORTED_CURRENCIES } from '@openraise/shared';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 16px' }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>OpenRaise</h1>
      <p style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1.5 }}>
        Raise money for what matters, together. Open source and run by the
        communities that use it.
      </p>
      <p style={{ color: 'var(--muted)' }}>
        Accepting {SUPPORTED_CURRENCIES.join(', ')} soon.
      </p>
    </main>
  );
}
