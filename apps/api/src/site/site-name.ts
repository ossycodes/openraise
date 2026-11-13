/**
 * Environment fallback for pure email templates. Application services pass
 * the saved deployment name explicitly; already-queued emails keep their copy.
 */
export function siteName(): string {
  return process.env.SITE_NAME?.trim() || 'OpenRaise';
}
