'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Heart,
  Info,
  LockKeyhole,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { formatMoney, toMinorUnits } from '@openraise/shared';
import {
  decimalInput,
  progressPercent,
  suggestedAmounts,
  type Campaign,
  type DonationQuote,
  type DonationSession,
} from '../_lib/campaign';
import { ShareButton } from './share-button';
interface Attempt {
  key: string;
  amount: string;
  currency: Campaign['currency'];
  donorCoversPlatformFee: boolean;
  email: string;
  donorName?: string | null;
  donorMessage?: string | null;
  isAnonymous?: boolean;
}
function money(amount: string, currency: Campaign['currency']) {
  return formatMoney(BigInt(amount), currency);
}
function validHosted(url: string | null): url is string {
  try {
    return !!url && new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
export function DonationPanel({
  campaign,
  initial,
  withdrawal,
}: {
  campaign: Campaign;
  initial: DonationQuote | null;
  withdrawal: { amount: string; currency: Campaign['currency'] } | null;
}) {
  const id = useId();
  const [amount, setAmount] = useState(
    decimalInput(suggestedAmounts[campaign.currency][1]!),
  );
  const [cover, setCover] = useState(false);
  const [email, setEmail] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorMessage, setDonorMessage] = useState('');
  const [isAnonymous, setAnonymous] = useState(true);
  const nameInput = useRef<HTMLInputElement>(null);
  const [quote, setQuote] = useState(initial);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [session, setSession] = useState<DonationSession | null>(null);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updatedFees, setUpdatedFees] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const firstQuote = useRef(true);
  const storageKey = `openraise-attempt:${campaign.slug}`;
  const active =
    campaign.status === 'ACTIVE' &&
    (!campaign.endsAt || new Date(campaign.endsAt).getTime() > Date.now());
  const percent = progressPercent(campaign.raisedAmount, campaign.goalAmount);
  let minor: string | null = null;
  try {
    const value = toMinorUnits(amount, campaign.currency);
    if (value > 0n && value <= 9223372036854775807n) minor = value.toString();
  } catch {
    /* validated on continue */
  }

  async function checkStatus(showError = true) {
    setChecking(true);
    try {
      const response = await fetch('/api/donations/session', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (response.ok && result.campaignSlug === campaign.slug) {
        setSession(result);
        if (result.status !== 'PENDING') {
          sessionStorage.removeItem(storageKey);
          attempt.current = null;
          setSaved(false);
        }
        return result as DonationSession;
      }
      if (showError)
        setError(
          response.status === 404
            ? 'No payment status is available yet. Retry your saved checkout request.'
            : 'Unable to check payment status. Try again.',
        );
    } catch {
      if (showError)
        setError(
          'Unable to check payment status. Check your connection and try again.',
        );
    } finally {
      setChecking(false);
    }
    return null;
  }
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) {
        const parsed = JSON.parse(value) as Attempt;
        if (
          parsed.currency === campaign.currency &&
          /^[1-9]\d{0,18}$/.test(parsed.amount) &&
          typeof parsed.key === 'string' &&
          typeof parsed.email === 'string'
        ) {
          attempt.current = parsed;
          setAmount(decimalInput(parsed.amount));
          setEmail(parsed.email);
          setDonorName(parsed.donorName ?? '');
          setDonorMessage(parsed.donorMessage ?? '');
          setAnonymous(parsed.isAnonymous ?? true);
          setCover(parsed.donorCoversPlatformFee);
          setSaved(true);
        }
      }
    } catch {
      /* a fresh attempt will require working storage before submission */
    }
    setRestored(true);
    void checkStatus(false).then((result) => {
      if (
        result &&
        (window.location.search.includes('reference=') ||
          window.location.search.includes('checkout_id='))
      )
        dialog.current?.showModal();
    });
    // This restoration is scoped to a campaign; no provider redirect is trusted as payment proof.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.slug]);
  useEffect(() => {
    if (!restored || !active) return;
    if (
      firstQuote.current &&
      initial &&
      minor === initial.amount &&
      cover === initial.donorCoversPlatformFee
    ) {
      firstQuote.current = false;
      return;
    }
    firstQuote.current = false;
    if (!minor) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    const abort = new AbortController();
    setQuoteLoading(true);
    setQuoteError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/campaigns/${encodeURIComponent(campaign.slug)}/donations/quote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: minor,
              currency: campaign.currency,
              donorCoversPlatformFee: cover,
            }),
            signal: abort.signal,
          },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.minimumAmount
              ? `Choose at least ${money(data.minimumAmount, campaign.currency)}.`
              : response.status === 503
                ? 'Donations are temporarily unavailable. You can still share this campaign.'
                : 'Unable to load fees. Check the amount and try again.',
          );
        if (!abort.signal.aborted) setQuote(data);
      } catch (failure) {
        if (!abort.signal.aborted) {
          setQuote(null);
          setQuoteError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load fees. Try again.',
          );
        }
      } finally {
        if (!abort.signal.aborted) setQuoteLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    restored,
    minor,
    cover,
    retry,
    active,
    campaign.slug,
    campaign.currency,
    initial,
  ]);

  function open() {
    setError('');
    if (
      !session &&
      !saved &&
      (!minor ||
        !quote ||
        quote.amount !== minor ||
        quote.donorCoversPlatformFee !== cover)
    ) {
      setError(
        quoteError ||
          'Enter a valid donation amount and wait for the fee breakdown.',
      );
      amountInput.current?.focus();
      return;
    }
    dialog.current?.showModal();
  }
  async function startNew() {
    await fetch('/api/donations/session', { method: 'DELETE' });
    sessionStorage.removeItem(storageKey);
    attempt.current = null;
    setSaved(false);
    setSession(null);
    setError('');
    setUpdatedFees(false);
  }
  function handoff(data: DonationSession) {
    if (validHosted(data.checkoutUrl)) window.location.assign(data.checkoutUrl);
    else
      setError(
        'The checkout link is unavailable. Check payment status before trying again.',
      );
  }
  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (
      session?.status === 'PENDING' &&
      session.checkoutState === 'READY' &&
      session.checkoutUrl
    ) {
      handoff(session);
      return;
    }
    if (
      !attempt.current &&
      (!emailInput.current?.checkValidity() || !email.trim())
    ) {
      setError('Enter your email address to receive the receipt.');
      emailInput.current?.focus();
      return;
    }
    if (
      !attempt.current &&
      (!minor ||
        !quote ||
        quote.amount !== minor ||
        quote.donorCoversPlatformFee !== cover ||
        quoteLoading)
    ) {
      setError('Wait for the current fee breakdown before continuing.');
      return;
    }
    if (!attempt.current && !isAnonymous && !donorName.trim()) {
      setError('Add a name to appear publicly, or keep your name anonymous.');
      nameInput.current?.closest('details')?.setAttribute('open', '');
      nameInput.current?.focus();
      return;
    }
    const payload = attempt.current ?? {
      key: crypto.randomUUID(),
      amount: minor!,
      currency: campaign.currency,
      donorCoversPlatformFee: cover,
      email: email.trim().toLowerCase(),
      donorName: donorName.trim() || null,
      donorMessage: donorMessage.trim() || null,
      isAnonymous,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      setError(
        'This browser cannot save the payment request. Allow session storage or try another browser to continue safely.',
      );
      return;
    }
    attempt.current = payload;
    setSaved(true);
    setBusy(true);
    try {
      const { key, ...body } = payload;
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaign.slug)}/donations/checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        await checkStatus(false);
        setError(
          response.status === 409
            ? 'This request is still being prepared. Wait a moment, then retry this same request.'
            : (data.message ??
                'The checkout response is uncertain. Retry the same saved request.'),
        );
        return;
      }
      setSession(data);
      if (quote && quote.totalCharged === data.totalCharged) handoff(data);
      else {
        setUpdatedFees(true);
        setError(
          'Your final fee breakdown is ready. Review the total below before continuing.',
        );
      }
    } catch {
      setError(
        'The checkout response could not be confirmed. Check your connection, then retry this same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  const confirmed = session?.status === 'SUCCEEDED';
  const failed = session && ['FAILED', 'EXPIRED'].includes(session.status);
  const pending = session?.status === 'PENDING';
  const breakdown = session ?? quote;
  const locked = saved || !!session;
  return (
    <>
      <aside
        className="donation-sidebar"
        id="donate"
        aria-label="Support this campaign"
      >
        <div className="donation-card">
          <div className="funding-caption">
            <span className="live-dot" />
            Together, we’re making it happen
          </div>
          <div className="raised-amount">
            {money(campaign.raisedAmount, campaign.currency)}
          </div>
          <div className="goal-label">
            raised of{' '}
            <strong>{money(campaign.goalAmount, campaign.currency)}</strong>{' '}
            goal
          </div>
          <progress
            max="100"
            value={Math.min(percent, 100)}
            aria-label={`${percent}% of fundraising goal`}
          >
            {percent}%
          </progress>
          <div className="funding-meta">
            <span>
              <Heart size={14} aria-hidden="true" />
              {new Intl.NumberFormat('en-NG').format(campaign.donorCount)}{' '}
              supporters
            </span>
            <strong>
              {new Intl.NumberFormat('en-NG', {
                maximumFractionDigits: 0,
              }).format(percent)}
              % funded
            </strong>
          </div>
          <div className="donation-divider" />
          <h2>Be part of the story.</h2>
          <p className="donation-subtitle">
            A little from you. A lot of possibility.
          </p>
          {active ? (
            <>
              <label className="field-label" id={`${id}-amount-label`}>
                Choose your donation
              </label>
              <div
                className="amount-presets"
                role="group"
                aria-labelledby={`${id}-amount-label`}
              >
                {suggestedAmounts[campaign.currency].map((value) => (
                  <button
                    type="button"
                    key={value.toString()}
                    className={
                      minor === value.toString()
                        ? 'amount-preset selected'
                        : 'amount-preset'
                    }
                    aria-pressed={minor === value.toString()}
                    disabled={locked}
                    onClick={() => {
                      setAmount(decimalInput(value));
                      setError('');
                    }}
                  >
                    {formatMoney(value, campaign.currency)}
                    {minor === value.toString() && (
                      <Check size={13} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              <label className="amount-field" htmlFor={`${id}-amount`}>
                <span>{campaign.currency}</span>
                <input
                  ref={amountInput}
                  id={`${id}-amount`}
                  name="donationAmount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  disabled={locked}
                  aria-label="Donation amount"
                  aria-describedby={`${id}-amount-help`}
                  aria-invalid={!!error && !minor}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setError('');
                  }}
                />
                <span className="amount-field-suffix">
                  {campaign.currency === 'NGN'
                    ? '₦'
                    : campaign.currency === 'USD'
                      ? '$'
                      : campaign.currency === 'GHS'
                        ? '₵'
                        : 'KSh'}
                </span>
              </label>
              <span id={`${id}-amount-help`} className="sr-only">
                Enter a positive amount with up to two decimal places.
              </span>
              <label className="cover-fee">
                <input
                  type="checkbox"
                  checked={cover}
                  disabled={locked}
                  onChange={(event) => setCover(event.target.checked)}
                />
                <span>
                  Cover the platform fee <Heart size={13} aria-hidden="true" />
                  <small>Help more of your gift reach the campaign.</small>
                </span>
              </label>
              <div className="sidebar-total">
                <span>
                  Your total <Info size={13} aria-hidden="true" />
                </span>
                <strong>
                  {quoteLoading
                    ? 'Updating…'
                    : breakdown
                      ? money(breakdown.totalCharged, campaign.currency)
                      : '—'}
                </strong>
              </div>
              <button
                className="primary-button donate-button"
                type="button"
                disabled={!restored || quoteLoading || busy}
                onClick={open}
              >
                <Heart size={18} aria-hidden="true" />
                {confirmed
                  ? 'View your donation'
                  : locked
                    ? 'View your donation'
                    : 'Continue to donate'}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <div className="quote-feedback" role="status">
                {quoteError && (
                  <>
                    <p>{quoteError}</p>
                    <button
                      className="text-button"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Try loading fees again
                    </button>
                  </>
                )}
                {error && !dialog.current?.open && (
                  <p className="field-error">{error}</p>
                )}
              </div>
              <p className="secure-caption">
                <LockKeyhole size={12} aria-hidden="true" />
                Secure checkout · No account needed
              </p>
            </>
          ) : (
            <div className="campaign-closed">
              <p>
                {campaign.status === 'PAUSED'
                  ? 'Giving is paused for this campaign.'
                  : 'This campaign is no longer accepting donations.'}
              </p>
              <p>You can still share its story.</p>
            </div>
          )}
          <ShareButton title={campaign.title} />
        </div>
        <div className="giving-note">
          <ShieldCheck size={21} strokeWidth={1.5} aria-hidden="true" />
          <p>
            <strong>Your generosity, clearly accounted for.</strong>
            <span>
              Every confirmed donation is recorded. Every fee is shown before
              you give.
            </span>
          </p>
        </div>
      </aside>
      {active && (
        <div className="mobile-donate-bar">
          <div>
            <small>
              {money(campaign.raisedAmount, campaign.currency)} raised
            </small>
            <strong>
              {new Intl.NumberFormat('en-NG', {
                maximumFractionDigits: 0,
              }).format(percent)}
              % to goal
            </strong>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={!restored || quoteLoading}
            onClick={open}
          >
            {locked ? 'View donation' : 'Donate now'}
            <Heart size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="donation-dialog"
        aria-labelledby={`${id}-dialog-title`}
        onCancel={() => setError('')}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close donation dialog"
          onClick={() => dialog.current?.close()}
        >
          <X size={21} />
        </button>
        {confirmed ? (
          <div className="payment-outcome">
            <div className="outcome-icon">
              <CheckCircle2 size={35} />
            </div>
            <div className="eyebrow">Payment confirmed</div>
            <h2 id={`${id}-dialog-title`}>
              You showed up.
              <br />
              Thank you.
            </h2>
            <p>
              Your {money(session.amount, campaign.currency)} donation to{' '}
              <strong>{campaign.title}</strong> has been confirmed.
            </p>
            <div className="receipt-summary">
              <span>Total paid</span>
              <strong>{money(session.totalCharged, campaign.currency)}</strong>
            </div>
            <p className="muted-copy">
              <Mail size={15} aria-hidden="true" />
              Your receipt will be sent by email.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => dialog.current?.close()}
            >
              Back to the story <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <form onSubmit={checkout} noValidate>
            <div className="dialog-eyebrow">
              <Heart size={15} aria-hidden="true" />A little kindness goes a
              long way
            </div>
            <h2 id={`${id}-dialog-title`}>
              {failed
                ? 'This payment didn’t complete.'
                : pending && !updatedFees
                  ? 'Your donation is in progress.'
                  : 'Make someone’s future a little brighter.'}
            </h2>
            <p className="dialog-campaign">
              Supporting <strong>{campaign.title}</strong>
            </p>
            {!locked && (
              <>
                <div className="email-field dialog-amount">
                  <label htmlFor={`${id}-dialog-amount`}>
                    Donation amount ({campaign.currency})
                  </label>
                  <input
                    id={`${id}-dialog-amount`}
                    name="amount"
                    inputMode="decimal"
                    type="text"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <label className="cover-fee">
                  <input
                    type="checkbox"
                    checked={cover}
                    onChange={(event) => setCover(event.target.checked)}
                  />
                  <span>
                    Cover the platform fee
                    <small>
                      Optional. More of your gift reaches the campaign.
                    </small>
                  </span>
                </label>
              </>
            )}
            {!locked && (
              <div className="email-field">
                <label htmlFor={`${id}-email`}>Email for your receipt</label>
                <input
                  ref={emailInput}
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  aria-invalid={!!error && !emailInput.current?.validity.valid}
                  aria-describedby={`${id}-email-help ${id}-error`}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <small id={`${id}-email-help`}>
                  No account needed. Just a receipt for your kindness.
                </small>
              </div>
            )}
            {!locked && (
              <details className="donor-details">
                <summary>
                  Add a name or a message <span>Optional</span>
                </summary>
                <fieldset className="donor-preferences">
                  <legend className="sr-only">
                    Public name and message preferences
                  </legend>
                  <label htmlFor={`${id}-donor-name`}>
                    Your name{!isAnonymous ? ' (required)' : ''}
                  </label>
                  <input
                    ref={nameInput}
                    id={`${id}-donor-name`}
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    maxLength={100}
                    autoComplete="name"
                    required={!isAnonymous}
                    aria-describedby={`${id}-privacy-help`}
                  />
                  <label className="cover-fee">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setAnonymous(e.target.checked)}
                    />
                    <span>
                      Keep my name anonymous
                      <small>
                        The organiser can see a name you provide. Other visitors
                        won’t.
                      </small>
                    </span>
                  </label>
                  <label htmlFor={`${id}-donor-message`}>
                    Message of support
                  </label>
                  <textarea
                    id={`${id}-donor-message`}
                    value={donorMessage}
                    onChange={(e) => setDonorMessage(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="A few kind words can go a long way."
                    aria-describedby={`${id}-privacy-help`}
                  />
                  <small id={`${id}-privacy-help`}>
                    Your message will be public after payment confirmation.
                    Anonymous hides your name, not personal details you write
                    here.
                  </small>
                </fieldset>
              </details>
            )}
            {breakdown && (
              <div className="fee-breakdown">
                <div>
                  <span>Your donation</span>
                  <strong>{money(breakdown.amount, campaign.currency)}</strong>
                </div>
                <div>
                  <span>
                    Platform fee{' '}
                    <small>
                      {breakdown.donorCoversPlatformFee
                        ? 'added to your gift'
                        : 'included in your gift'}
                    </small>
                  </span>
                  <span>{money(breakdown.platformFee, campaign.currency)}</span>
                </div>
                <div>
                  <span>Processing fee</span>
                  <span>{money(breakdown.donorFee, campaign.currency)}</span>
                </div>
                <div className="fee-total">
                  <strong>Total you’ll pay</strong>
                  <strong>
                    {money(breakdown.totalCharged, campaign.currency)}
                  </strong>
                </div>
                <div className="net-amount">
                  <span>To the campaign wallet</span>
                  <strong>
                    {money(breakdown.netToCampaign, campaign.currency)}
                  </strong>
                </div>
              </div>
            )}
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
            {pending && !updatedFees && (
              <div className="payment-pending">
                <Info size={18} aria-hidden="true" />
                <p>
                  {session.checkoutState === 'UNCERTAIN' ||
                  session.checkoutState === 'INITIALIZING'
                    ? 'Your checkout is still being confirmed. Check its status before starting another donation.'
                    : 'If you’ve already paid, check the status below. A redirect alone does not confirm payment.'}
                </p>
              </div>
            )}
            {failed ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void startNew()}
              >
                Start a new donation <ArrowRight size={17} />
              </button>
            ) : pending &&
              ['UNCERTAIN', 'INITIALIZING'].includes(
                session.checkoutState,
              ) ? null : (
              <button
                type="submit"
                className="primary-button"
                disabled={busy || checking}
              >
                {busy
                  ? 'Preparing your checkout…'
                  : pending
                    ? 'Continue to payment'
                    : saved
                      ? 'Retry saved checkout request'
                      : `Continue with ${quote ? money(quote.totalCharged, campaign.currency) : 'your donation'}`}
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            )}
            {(locked || pending) && (
              <button
                type="button"
                className="secondary-button"
                disabled={checking || busy}
                onClick={() => void checkStatus()}
              >
                {checking ? 'Checking payment…' : 'Check payment status'}
              </button>
            )}
            <p className="checkout-provider">
              <LockKeyhole size={13} aria-hidden="true" />
              {breakdown?.provider
                ? `Payment is completed on ${breakdown.provider === 'paystack' ? 'Paystack' : 'Bachs'}.`
                : 'Payment is completed on the provider’s secure page.'}
            </p>
            {withdrawal && (
              <details className="withdrawal-disclosure">
                <summary>
                  About campaign withdrawals <ChevronDown size={13} />
                </summary>
                <p>
                  A {money(withdrawal.amount, withdrawal.currency)} fee applies
                  per withdrawal. This is not an additional charge to your
                  donation.
                </p>
              </details>
            )}
          </form>
        )}
      </dialog>
    </>
  );
}
