import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="review-empty">
      <h1>Money record not found</h1>
      <p>Check the record address or return to the workspace.</p>
      <Link href="/admin/money">Money overview</Link>
    </section>
  );
}
