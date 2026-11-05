import { randomInt } from 'node:crypto';

// No 0/o, 1/l/i: suffixes get read out loud and typed from posters.
const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** "Help Adé get to school!" → "help-ade-get-to-school" (max 40 chars). */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'campaign';
}

export function randomSuffix(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return out;
}

/** A readable, unguessable URL segment, e.g. "help-ade-get-to-school-k7m2q". */
export function campaignSlug(title: string, suffix = randomSuffix()): string {
  return `${slugify(title)}-${suffix}`;
}
