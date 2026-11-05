import { verifyEmailEmail } from '../mail/templates.js';
import { donationReceiptEmail } from '../notifications/receipt-templates.js';
import { siteName } from './site-name.js';

describe('site name in emails', () => {
  const original = process.env.SITE_NAME;
  afterEach(() => {
    if (original === undefined) delete process.env.SITE_NAME;
    else process.env.SITE_NAME = original;
  });

  it('defaults to OpenRaise', () => {
    delete process.env.SITE_NAME;
    expect(siteName()).toBe('OpenRaise');
    expect(verifyEmailEmail('Ada', 'a@b.co', 'https://x.test').text).toContain('OpenRaise account');
  });

  it('uses the deployment name everywhere, escaped in HTML', () => {
    process.env.SITE_NAME = 'Kano <Gives>';
    const mail = verifyEmailEmail('Ada', 'a@b.co', 'https://x.test');
    expect(mail.text).toContain('Kano <Gives> account');
    expect(mail.html).toContain('Kano &lt;Gives&gt; account');
    expect(mail.text).not.toContain('OpenRaise');

    const receipt = donationReceiptEmail({
      to: 'd@b.co',
      campaignTitle: 'Clinic',
      campaignUrl: 'https://x.test/c',
      currency: 'NGN',
      reference: 'ref',
      amount: 100_000n,
      platformFee: 3_500n,
      donorFee: 1_500n,
      totalCharged: 101_500n,
      netToCampaign: 96_500n,
      donorCoversPlatformFee: false,
      confirmedAt: new Date('2026-11-05T10:00:00Z'),
    });
    expect(receipt.subject).toBe('Your Kano <Gives> donation receipt');
  });
});
