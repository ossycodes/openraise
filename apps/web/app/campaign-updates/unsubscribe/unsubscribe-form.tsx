'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export function UnsubscribeForm() {
  const [subscription, setSubscription] = useState('');
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const readLink = () => {
      const data = new URLSearchParams(location.hash.slice(1));
      if (!data.has('subscription') || !data.has('token')) return;
      setSubscription(data.get('subscription') ?? '');
      setToken(data.get('token') ?? '');
      setDone(false);
      setError('');
      history.replaceState(null, '', location.pathname);
    };
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/campaign-updates/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subscription, token }),
      });
      if (!response.ok)
        throw new Error(
          'This link could not be confirmed. Open the link from your email again, or try later.',
        );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="unsubscribe-page">
      <div className="section-eyebrow">Your inbox. Your choice.</div>
      <h1>{done ? 'You’re unsubscribed.' : 'Stop campaign update emails?'}</h1>
      <p>
        {done
          ? 'You won’t receive more updates from this campaign. Your donation and receipt are unchanged.'
          : 'Confirm below to stop updates from this campaign. Opening this link alone does not change your subscription.'}
      </p>
      {!done &&
        (subscription && token ? (
          <button
            className="primary-button"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? 'Confirming…' : 'Unsubscribe from updates'}
          </button>
        ) : (
          <p className="privacy-note">
            Open the complete unsubscribe link from an update email.
          </p>
        ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Link href="/">Explore campaigns</Link>
    </main>
  );
}
