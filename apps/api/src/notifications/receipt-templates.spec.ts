import {
  creatorDonationsEmail,
  donationReceiptEmail,
  type ReceiptMail,
} from './receipt-templates.js';
const receipt: ReceiptMail = {
  to: 'donor@example.com',
  campaignTitle: '<script>Help & hope</script>',
  campaignUrl: 'https://example.com/campaign?one=1&two=2',
  currency: 'NGN',
  reference: 'don_test',
  amount: 100000n,
  platformFee: 3500n,
  donorFee: 1500n,
  totalCharged: 101500n,
  netToCampaign: 96500n,
  donorCoversPlatformFee: false,
  confirmedAt: new Date('2026-11-05T12:00:00Z'),
};

describe('donation receipt templates', () => {
  it('shows the frozen breakdown and reference in both text and escaped HTML', () => {
    const mail = donationReceiptEmail(receipt);
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('1,000.00');
      expect(part).toContain('35.00');
      expect(part).toContain('15.00');
      expect(part).toContain('1,015.00');
      expect(part).toContain('965.00');
      expect(part).toContain('don_test');
      expect(part).toContain('NGN');
    }
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('one=1&amp;two=2');
    expect(mail.text).toContain('included in your donation');
  });
  it('explains covered platform fees and preserves large amounts exactly', () => {
    const mail = donationReceiptEmail({
      ...receipt,
      donorCoversPlatformFee: true,
      amount: 900719925474099301n,
      currency: 'USD',
    });
    expect(mail.text).toContain('added to your payment');
    expect(mail.text).toContain('9,007,199,254,740,993.01');
  });
  it('renders creator summaries without exposing donor identity', () => {
    const mail = creatorDonationsEmail({
      ...receipt,
      count: 3,
      amount: 300000n,
    });
    expect(mail.text).toContain('3 new donations');
    expect(mail.text).toContain('3,000.00');
    expect(mail.text).not.toContain(receipt.to);
    expect(mail.html).not.toContain('<script>');
  });
});
