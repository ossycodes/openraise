import { escapeHtml, verifyEmailEmail } from './templates.js';

describe('mail templates', () => {
  it('escapes HTML in names', () => {
    expect(escapeHtml(`<b>"Ade" & 'Bisi'</b>`)).toBe(
      '&lt;b&gt;&quot;Ade&quot; &amp; &#39;Bisi&#39;&lt;/b&gt;',
    );
    const mail = verifyEmailEmail('<script>x</script>', 'a@b.co', 'https://x.test/v?token=t');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('includes the link in both parts', () => {
    const mail = verifyEmailEmail('Ada', 'a@b.co', 'https://x.test/verify-email?token=abc');
    expect(mail.text).toContain('https://x.test/verify-email?token=abc');
    expect(mail.html).toContain('https://x.test/verify-email?token=abc');
    expect(mail.to).toBe('a@b.co');
  });
});
