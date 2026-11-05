'use client';
export default function CampaignError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <div className="section-eyebrow">A pause, not the end of the story</div>
      <h1>This campaign couldn’t be loaded.</h1>
      <p>Check your connection and try again. No donation has been started.</p>
      <button className="primary-button" onClick={reset}>
        Try loading the campaign again
      </button>
      <p>
        <a href="/">Explore other campaigns</a>
      </p>
    </main>
  );
}
