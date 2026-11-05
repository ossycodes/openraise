import type { MailMessage } from './mail.service.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, paragraphs: string[], button: { label: string; href: string }): string {
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

export function verifyEmailEmail(name: string, to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your email',
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your OpenRaise account:\n\n${link}\n\nThe link works for 24 hours. If you didn't sign up, ignore this email.`,
    html: layout(
      'Confirm your email',
      [
        `Hi ${escapeHtml(name)},`,
        'Confirm your email address to finish setting up your OpenRaise account. The link works for 24 hours.',
        "If you didn't sign up, ignore this email.",
      ],
      { label: 'Confirm email', href: link },
    ),
  };
}

export function resetPasswordEmail(name: string, to: string, link: string): MailMessage {
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
    text: `Hi ${name},\n\n${account} was added as a payout account on your OpenRaise profile. Withdrawals to it start in 24 hours.\n\nIf this wasn't you, change your password now and remove the account:\n\n${link}`,
    html: layout(
      'A payout account was added',
      [
        `Hi ${escapeHtml(name)},`,
        `<strong>${escapeHtml(account)}</strong> was added as a payout account on your OpenRaise profile. Withdrawals to it start in 24 hours.`,
        "If this wasn't you, change your password now and remove the account.",
      ],
      { label: 'Review payout accounts', href: link },
    ),
  };
}
