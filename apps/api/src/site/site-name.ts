/**
 * The deployment's name for email copy. Read at send time from the same
 * variable `GET /config/site` publishes, so self-hosters rename everything
 * with one setting. Falls back to OpenRaise.
 */
export function siteName(): string {
  return process.env.SITE_NAME?.trim() || 'OpenRaise';
}
