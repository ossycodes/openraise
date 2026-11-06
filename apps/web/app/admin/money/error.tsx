'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="review-empty" role="alert">
      <h1>These records couldn’t load.</h1>
      <p>
        No financial action has been taken. Try again to inspect the latest
        information.
      </p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
      <Link href="/admin/money">Return to money overview</Link>
    </section>
  );
}
