import { siteName } from '../site/site-name.js';
import type { MailMessage } from './mail.service.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function layout(
  heading: string,
  paragraphs: string[],
  button: { label: string; href: string },
): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;background:#fbfaf7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1b1d1c">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<h1 style="font-size:22px;margin:0 0 16px">${heading}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#0f7a5a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${button.label}</a></p>
<p style="margin:0;color:#5d625f;font-size:13px;line-height:1.5">If the button doesn't work, paste this link into your browser:<br>${escapeHtml(button.href)}</p>
</div></body></html>`;
}

export function verifyEmailEmail(
  name: string,
  to: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: 'Confirm your email',
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your ${siteName()} account:\n\n${link}\n\nThe link works for 24 hours. If you didn't sign up, ignore this email.`,
    html: layout(
      'Confirm your email',
      [
        `Hi ${escapeHtml(name)},`,
        `Confirm your email address to finish setting up your ${escapeHtml(siteName())} account. The link works for 24 hours.`,
        "If you didn't sign up, ignore this email.",
      ],
      { label: 'Confirm email', href: link },
    ),
  };
}

export function resetPasswordEmail(
  name: string,
  to: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: `Hi ${name},\n\nUse this link to choose a new password:\n\n${link}\n\nThe link works for 1 hour and signs you out everywhere else. If you didn't ask for this, ignore this email; your password hasn't changed.`,
    html: layout(
      'Reset your password',
      [
        `Hi ${escapeHtml(name)},`,
        'Use the button below to choose a new password. The link works for 1 hour, and saving a new password signs you out on every other device.',
        "If you didn't ask for this, ignore this email; your password hasn't changed.",
      ],
      { label: 'Choose a new password', href: link },
    ),
  };
}

/** The outcome of an identity review. `reason` is null when verified. */
export function identityDecisionEmail(
  name: string,
  to: string,
  reason: string | null,
  link: string,
): MailMessage {
  if (reason === null)
    return {
      to,
      subject: 'Your identity is verified',
      text: `Hi ${name},\n\nYour identity is verified on ${siteName()}. You can now submit campaigns for review and withdraw to a payout account in your name.\n\n${link}`,
      html: layout(
        'Your identity is verified',
        [
          `Hi ${escapeHtml(name)},`,
          `Your identity is verified on ${escapeHtml(siteName())}. You can now submit campaigns for review and withdraw to a payout account in your name.`,
        ],
        { label: 'Open your dashboard', href: link },
      ),
    };
  return {
    to,
    subject: 'We couldn’t verify your identity',
    text: `Hi ${name},\n\nWe couldn't verify your identity from what you sent:\n\n${reason}\n\nYou can send your details again:\n\n${link}`,
    html: layout(
      'We couldn’t verify your identity',
      [
        `Hi ${escapeHtml(name)},`,
        "We couldn't verify your identity from what you sent:",
        `<em>${escapeHtml(reason)}</em>`,
        'You can send your details again from your dashboard.',
      ],
      { label: 'Try again', href: link },
    ),
  };
}

const ROLE_PHRASE: Record<string, string> = {
  OWNER: 'an owner',
  ADMIN: 'an admin',
  EDITOR: 'an editor',
  FINANCE: 'a finance member',
};

/** An invitation to join an organisation's team. */
export function organisationInviteEmail(
  inviterName: string,
  organisationName: string,
  role: string,
  to: string,
  link: string,
): MailMessage {
  const as = ROLE_PHRASE[role] ?? 'a member';
  return {
    to,
    subject: `Join ${organisationName} on ${siteName()}`,
    text: `Hi,\n\n${inviterName} invited you to join ${organisationName} on ${siteName()} as ${as}.\n\nAccept the invitation (it works for 7 days, with an account using this email address):\n\n${link}\n\nIf you weren't expecting this, ignore this email.`,
    html: layout(
      `Join ${escapeHtml(organisationName)}`,
      [
        `${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(organisationName)}</strong> on ${escapeHtml(siteName())} as ${as}.`,
        'The invitation works for 7 days, with an account using this email address. If you weren’t expecting it, ignore this email.',
      ],
      { label: 'Accept invitation', href: link },
    ),
  };
}

/** The outcome of a request to withdraw to an account in a different name. */
export function payoutNameReviewEmail(
  name: string,
  to: string,
  account: string,
  reason: string | null,
  link: string,
): MailMessage {
  if (reason === null)
    return {
      to,
      subject: 'Your payout account was approved',
      text: `Hi ${name},\n\nAn administrator approved ${account} for withdrawals, even though its name differs from your verified name.\n\n${link}`,
      html: layout(
        'Your payout account was approved',
        [
          `Hi ${escapeHtml(name)},`,
          `An administrator approved <strong>${escapeHtml(account)}</strong> for withdrawals, even though its name differs from your verified name.`,
        ],
        { label: 'View payout accounts', href: link },
      ),
    };
  return {
    to,
    subject: 'We couldn’t approve your payout account',
    text: `Hi ${name},\n\nWe couldn't approve ${account} for withdrawals:\n\n${reason}\n\nYou can ask again with more detail, or add an account in your verified name:\n\n${link}`,
    html: layout(
      'We couldn’t approve your payout account',
      [
        `Hi ${escapeHtml(name)},`,
        `We couldn't approve <strong>${escapeHtml(account)}</strong> for withdrawals:`,
        `<em>${escapeHtml(reason)}</em>`,
        'You can ask again with more detail, or add an account in your verified name.',
      ],
      { label: 'View payout accounts', href: link },
    ),
  };
}

/** Sent whenever a payout account is added, so a hijacked login can't redirect money quietly. */
export function payoutAccountAddedEmail(
  name: string,
  to: string,
  account: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: 'A payout account was added',
    text: `Hi ${name},\n\n${account} was added as a payout account on your ${siteName()} profile. Withdrawals to it start in 24 hours.\n\nIf this wasn't you, change your password now and remove the account:\n\n${link}`,
    html: layout(
      'A payout account was added',
      [
        `Hi ${escapeHtml(name)},`,
        `<strong>${escapeHtml(account)}</strong> was added as a payout account on your ${escapeHtml(siteName())} profile. Withdrawals to it start in 24 hours.`,
        "If this wasn't you, change your password now and remove the account.",
      ],
      { label: 'Review payout accounts', href: link },
    ),
  };
}
