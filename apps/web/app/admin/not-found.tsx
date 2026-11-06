import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="review-empty">
      <h1>Submission not found</h1>
      <p>This campaign is no longer available at this address.</p>
      <Link className="primary-button" href="/admin/campaigns">
        Back to the queue
      </Link>
    </section>
  );
}
