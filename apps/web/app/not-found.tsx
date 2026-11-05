import { SiteHeader, SiteFooter } from './_components/site-header';
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="error-page">
        <div className="section-eyebrow">Let’s find another story</div>
        <h1>This campaign isn’t available.</h1>
        <p>
          The link may be incorrect, or the organiser hasn’t published the
          campaign. Explore the active campaigns to find a cause to support.
        </p>
        <a className="primary-button" href="/">
          Explore campaigns
        </a>
      </main>
      <SiteFooter />
    </>
  );
}
