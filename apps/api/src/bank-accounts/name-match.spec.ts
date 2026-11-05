import { namesMatch } from './name-match.js';

describe('namesMatch', () => {
  it('matches names in any order, with extra middle names', () => {
    expect(namesMatch('Ada Obi', 'OBI ADA CHIOMA')).toBe(true);
    expect(namesMatch('Chiamaka Nnabuenyi', 'NNABUENYI, CHIAMAKA J.')).toBe(true);
  });

  it('ignores case, accents and punctuation', () => {
    expect(namesMatch('Adébáyọ̀ Ọlá', 'ADEBAYO OLA')).toBe(true);
  });

  it('needs two shared parts, or the only part of a one-word name', () => {
    expect(namesMatch('Ada Obi', 'ADA NWOSU')).toBe(false);
    expect(namesMatch('Tunde', 'TUNDE BAKARE')).toBe(true);
  });

  it('does not count initials', () => {
    expect(namesMatch('A Obi', 'A. OBI')).toBe(false);
  });

  it('rejects someone else entirely', () => {
    expect(namesMatch('Ada Obi', 'MUSA BELLO')).toBe(false);
    expect(namesMatch('', 'MUSA BELLO')).toBe(false);
  });
});
