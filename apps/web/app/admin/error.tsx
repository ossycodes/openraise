'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="review-empty" role="alert">
      <h1>The review workspace couldn’t load.</h1>
      <p>
        Reload the latest campaign state before making or retrying a decision.
      </p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
      <Link href="/dashboard">Return to dashboard</Link>
    </section>
  );
}
