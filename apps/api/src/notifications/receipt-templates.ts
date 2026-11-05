import { formatMoney, type Currency } from '@openraise/shared';
import { escapeHtml, layout } from '../mail/templates.js';
import type { MailMessage } from '../mail/mail.service.js';

interface CampaignMail {
  to: string;
  campaignTitle: string;
  campaignUrl: string;
  currency: Currency;
}
export interface ReceiptMail extends CampaignMail {
  reference: string;
  amount: bigint;
  platformFee: bigint;
  donorFee: bigint;
  totalCharged: bigint;
  netToCampaign: bigint;
  donorCoversPlatformFee: boolean;
  confirmedAt: Date;
}
export function donationReceiptEmail(data: ReceiptMail): MailMessage {
  const money = (amount: bigint) =>
    `${formatMoney(amount, data.currency)} (${data.currency})`;
  const lines = [
    `Campaign: ${data.campaignTitle}`,
    `Donation: ${money(data.amount)}`,
    `Platform fee: ${money(data.platformFee)} (${data.donorCoversPlatformFee ? 'added to your payment' : 'included in your donation'})`,
    `Processing fee: ${money(data.donorFee)}`,
    `Total paid: ${money(data.totalCharged)}`,
    `Net to campaign: ${money(data.netToCampaign)}`,
    `Reference: ${data.reference}`,
    `Confirmed: ${data.confirmedAt.toISOString()}`,
  ];
  return {
    to: data.to,
    subject: 'Your OpenRaise donation receipt',
    text: `Thank you for your donation. Your payment has been confirmed.\n\n${lines.join('\n')}\n\nView the campaign: ${data.campaignUrl}`,
    html: layout(
      'Thank you for your donation',
      ['Your payment has been confirmed.', ...lines.map(escapeHtml)],
      { label: 'View campaign', href: data.campaignUrl },
    ),
  };
}
export function creatorDonationsEmail(
  data: CampaignMail & { count: number; amount: bigint },
): MailMessage {
  const summary = `${data.campaignTitle} received ${data.count} new donation${data.count === 1 ? '' : 's'}, totalling ${formatMoney(data.amount, data.currency)} (${data.currency}).`;
  return {
    to: data.to,
    subject:
      data.count === 1
        ? 'A new donation for your campaign'
        : 'New donations for your campaign',
    text: `${summary}\n\nView the campaign: ${data.campaignUrl}`,
    html: layout('Your campaign has new support', [escapeHtml(summary)], {
      label: 'View campaign',
      href: data.campaignUrl,
    }),
  };
}
