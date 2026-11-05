export default function LoadingCampaign() {
  return (
    <main
      id="main"
      className="campaign-main"
      aria-busy="true"
      aria-label="Loading campaign"
    >
      <p className="sr-only" role="status">
        Loading the campaign story…
      </p>
      <div className="campaign-layout" style={{ paddingBlock: 50 }}>
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-cover" />
          <div className="skeleton" />
        </div>
        <div className="skeleton skeleton-card" />
      </div>
    </main>
  );
}
