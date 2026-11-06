import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="review-empty">
      <h1>Report not found</h1>
      <p>This report is not available at this address.</p>
      <Link className="primary-button" href="/admin/reports">
        Back to reports
      </Link>
    </section>
  );
}
