import { KycProviderError } from './kyc-provider.js';
import { namesMatch } from '../bank-accounts/name-match.js';

/** Split a submitted legal name into first / last for vendor request bodies. */
export function splitName(legalName: string): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  const parts = legalName.trim().replace(/\s+/g, ' ').split(' ');
  return {
    firstName: parts[0] ?? '',
    lastName: parts[parts.length - 1] ?? '',
    fullName: parts.join(' '),
  };
}

/** Join an authority record's name parts, skipping blanks. */
export function joinName(
  ...parts: (string | null | undefined)[]
): string | null {
  const name = parts
    .map((p) => p?.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
  return name || null;
}

/**
 * Normalise an authority date of birth to YYYY-MM-DD. Vendors return
 * YYYY-MM-DD, DD-MM-YYYY and ISO timestamps; anything else returns null
 * and is treated as "no date supplied", never as a match.
 */
export function normalizeDob(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  let result: string | undefined;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const dmy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const named = text.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (iso) result = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (dmy) result = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  else if (named) {
    const month =
      [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ].indexOf(named[2]!.toLowerCase()) + 1;
    if (month)
      result = `${named[3]}-${String(month).padStart(2, '0')}-${named[1]}`;
  }
  if (result) {
    const date = new Date(`${result}T00:00:00Z`);
    if (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === result
    )
      return result;
  }
  return null;
}

export type AuthorityRecord = {
  /** The name exactly as the authority holds it. */
  name: string | null;
  /** YYYY-MM-DD when the authority supplied a parseable date. */
  dateOfBirth: string | null;
};

/**
 * Decide a synchronous vendor check. Verified only when the authority
 * found the person, its name matches what was submitted (the existing
 * payout name rule), and its date of birth is present and agrees.
 * The verified name is the authority's, since that is what payout
 * accounts must later match.
 */
export function decideFromAuthority(
  submitted: { legalName: string; dateOfBirth: string },
  authority: AuthorityRecord,
  reference: string | null,
):
  | { status: 'VERIFIED'; reference: string | null; verifiedName: string }
  | { status: 'REJECTED'; reference: string | null; reason: string } {
  if (!authority.name || !authority.dateOfBirth)
    throw new KycProviderError('invalid-response');
  if (!namesMatch(authority.name, submitted.legalName))
    return {
      status: 'REJECTED',
      reference,
      reason:
        'The name on that ID does not match the name you entered. Check it and try again.',
    };
  if (authority.dateOfBirth && authority.dateOfBirth !== submitted.dateOfBirth)
    return {
      status: 'REJECTED',
      reference,
      reason:
        'The date of birth on that ID does not match. Check it and try again.',
    };
  return { status: 'VERIFIED', reference, verifiedName: authority.name };
}
