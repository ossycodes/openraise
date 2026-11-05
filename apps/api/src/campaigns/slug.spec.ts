import { campaignSlug, randomSuffix, slugify } from './slug.js';

describe('campaign slugs', () => {
  it('slugifies titles, dropping accents and punctuation', () => {
    expect(slugify('Help Adé get to school!')).toBe('help-ade-get-to-school');
    expect(slugify('  ₦5m for   Mama’s surgery  ')).toBe('5m-for-mama-s-surgery');
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(39) + ' b c d e f');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('campaign');
    expect(slugify('こんにちは')).toBe('campaign');
  });

  it('adds an unambiguous random suffix', () => {
    expect(randomSuffix()).toMatch(/^[a-hjkmnp-z2-9]{5}$/);
    expect(campaignSlug('Fix the borehole', 'k7m2q')).toBe('fix-the-borehole-k7m2q');
    expect(campaignSlug('Same title')).not.toBe(campaignSlug('Same title'));
  });
});
