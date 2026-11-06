'use client';

import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface GoogleIdentity {
  initialize(options: Record<string, unknown>): void;
  prompt(): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

// GIS is page-global, even when Next.js mounts separate sign-in components.
let configuredClientId: string | null = null;
let credentialHandler: ((response: { credential: string }) => void) | null =
  null;
let prompted = false;
let credentialOwner: symbol | null = null;

/**
 * Google Identity Services: the One Tap prompt, the "Sign in with Google"
 * button, or both. Google hands back an ID token, which our route handler
 * exchanges for a session cookie.
 */
export function GoogleSignIn({
  clientId,
  oneTap = false,
  button = false,
  next = '/',
}: {
  clientId: string;
  oneTap?: boolean;
  button?: boolean;
  next?: string;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const renderedButton = useRef<HTMLElement | null>(null);
  const owner = useRef(Symbol('google-sign-in'));
  const mounted = useRef(false);
  const handler = useRef<(response: { credential: string }) => void>(() => {});
  useEffect(() => {
    handler.current = (response) => {
      void exchange(response);
    };
  });
  useEffect(() => {
    const currentOwner = owner.current;
    mounted.current = true;
    start();
    return () => {
      mounted.current = false;
      if (credentialOwner !== currentOwner) return;
      credentialOwner = null;
      credentialHandler = null;
      if (oneTap) window.google?.accounts.id.cancel();
    };
  }, [clientId, button, oneTap]);

  async function exchange({ credential }: { credential: string }) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? 'Google sign-in failed. Try again.');
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Google sign-in failed. Try again.',
      );
      setBusy(false);
    }
  }

  function start() {
    if (!mounted.current) return;
    const id = window.google?.accounts.id;
    if (!id) return;
    credentialOwner = owner.current;
    credentialHandler = (response) => handler.current(response);
    if (configuredClientId !== clientId) {
      id.initialize({
        client_id: clientId,
        callback: (response: { credential: string }) =>
          credentialHandler?.(response),
        context: 'signin',
        cancel_on_tap_outside: true,
        itp_support: true,
      });
      configuredClientId = clientId;
      prompted = false;
    }
    if (
      button &&
      buttonRef.current &&
      renderedButton.current !== buttonRef.current
    ) {
      renderedButton.current = buttonRef.current;
      id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: Math.min(buttonRef.current.clientWidth || 320, 400),
      });
    }
    if (oneTap && !prompted && process.env.NODE_ENV === 'production') {
      prompted = true;
      id.prompt();
    }
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={start}
        onError={() =>
          setError(
            'Google sign-in could not load. Check your connection and reload the page.',
          )
        }
      />
      {button && (
        <div className="google-sign-in">
          <div ref={buttonRef} className="google-button" aria-busy={busy} />
          {busy && <p className="google-status">Signing you in…</p>}
        </div>
      )}
      {error && (
        <p
          className={oneTap && !button ? 'google-toast' : 'google-error'}
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}
