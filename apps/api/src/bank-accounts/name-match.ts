/** Name parts, upper-cased, with accents and punctuation dropped. */
function nameParts(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Full name parts only; initials can't identify anyone. */
function nameTokens(name: string): Set<string> {
  return new Set(nameParts(name).filter((t) => t.length > 1));
}

/**
 * Does a bank's account name plausibly belong to this person? Nigerian banks
 * return names in any order ("OBI ADA CHIOMA" for "Ada Obi"), often with a
 * middle name, so this asks for at least two shared full name parts. Only a
 * genuinely one-word name ("Tunde") can match on one part: "A Obi" needs two
 * full parts, or any relative's "OBI" account would pass. Advisory until
 * identity verification ships; then it's checked against the verified name.
 */
export function namesMatch(personName: string, accountName: string): boolean {
  const person = nameTokens(personName);
  const account = nameTokens(accountName);
  if (person.size === 0) return false;
  const required = nameParts(personName).length >= 2 ? 2 : 1;
  let shared = 0;
  for (const t of person) if (account.has(t)) shared++;
  return shared >= required;
}
