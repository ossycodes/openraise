import { Clock, EyeOff, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { VerificationForm } from '../_components/verification-form';
import { identity } from '../_lib/data';
import { DOCUMENT_LABEL, type IdentityVerification } from '../_lib/types';

export const metadata = { title: 'Verify your identity' };

const date = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeZone: 'Africa/Lagos',
});

function Facts({ v }: { v: IdentityVerification }) {
  return (
    <dl className="identity-facts">
      <div>
        <dt>Document</dt>
        <dd>
          {DOCUMENT_LABEL[v.documentType]} ending {v.idNumberLast4}
        </dd>
      </div>
      <div>
        <dt>Name entered</dt>
        <dd>{v.legalName}</dd>
      </div>
      <div>
        <dt>Sent</dt>
        <dd>{date.format(new Date(v.createdAt))}</dd>
      </div>
    </dl>
  );
}

export default async function VerificationPage() {
  const state = await identity('/dashboard/verification');
  const v = state.verification;

  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">Verification</div>
          <h1>Verify your identity</h1>
          <p className="dashboard-lede">
            We check who is raising money before a campaign goes live or money
            is paid out. It protects the people who give, and it protects you.
          </p>
        </div>
      </div>
      <div className="dashboard-columns main-first">
        <div className="dashboard-main">
          {state.status === 'VERIFIED' && v ? (
            <section className="dashboard-panel" aria-labelledby="id-status">
              <div className="identity-verified">
                <ShieldCheck size={28} strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <h2 id="id-status">Verified as {v.verifiedName}</h2>
                  <p>
                    You can submit campaigns for review and withdraw what you
                    raise. Payout accounts need to be in this name.
                  </p>
                </div>
              </div>
              <Facts v={v} />
            </section>
          ) : state.status === 'PENDING' && v ? (
            <section className="dashboard-panel" aria-labelledby="id-status">
              <div className="review-note waiting">
                <Clock size={18} aria-hidden="true" />
                <div>
                  <strong id="id-status">We’re checking your details</strong>
                  <p>
                    {state.provider === 'manual'
                      ? 'Someone on the team compares your photo with what you entered. We’ll email you when it’s done.'
                      : 'Our identity provider is checking what you sent. We’ll email you when it’s done.'}
                  </p>
                </div>
              </div>
              <Facts v={v} />
            </section>
          ) : (
            <section className="dashboard-panel" aria-labelledby="id-form">
              <h2 id="id-form">
                {state.status === 'REJECTED' ? 'Try again' : 'Your details'}
              </h2>
              {state.status === 'REJECTED' && v?.reason && (
                <div className="review-note" role="status">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <div>
                    <strong>We couldn’t verify what you sent</strong>
                    <p>{v.reason}</p>
                  </div>
                </div>
              )}
              <VerificationForm
                documentRequired={state.documentRequired}
                selfieRequired={state.selfieRequired}
                privacyPolicyUrl={state.privacyPolicyUrl}
                previous={state.status === 'REJECTED' ? v : null}
              />
            </section>
          )}
        </div>
        <aside className="dashboard-side">
          <section className="dashboard-panel" aria-labelledby="privacy-title">
            <h2 id="privacy-title">How we handle your details</h2>
            <ul className="identity-privacy">
              <li>
                <EyeOff size={16} aria-hidden="true" />
                We keep only the last four characters of your ID number, never
                the whole number.
              </li>
              <li>
                <LockKeyhole size={16} aria-hidden="true" />
                Your ID photo or selfie is encrypted. Only the administrator
                reviewing it can open it.
              </li>
              <li>
                <Trash2 size={16} aria-hidden="true" />
                If we can’t verify a photo, we delete it.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
