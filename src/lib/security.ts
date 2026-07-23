import { headers } from 'next/headers';
import { BadRequestError, ForbiddenError } from './errors';
import { MAX_NAME_LENGTH } from './config';

/**
 * Reject state-changing requests that don't originate from our own site.
 * Combined with SameSite=Lax session cookies this closes the CSRF gap without
 * a token round-trip. Same-origin requests set Origin to our host; we compare
 * against the Host header the request actually arrived on.
 */
export function assertSameOrigin() {
  const h = headers();
  const origin = h.get('origin');
  // Some same-origin navigations omit Origin; fall back to Referer.
  const referer = h.get('referer');
  const host = h.get('host');
  if (!host) throw new ForbiddenError('Missing host header');

  const source = origin ?? referer;
  // No Origin/Referer at all is treated as cross-site for mutating endpoints.
  if (!source) throw new ForbiddenError('Missing origin');

  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    throw new ForbiddenError('Invalid origin');
  }
  if (sourceHost !== host) {
    throw new ForbiddenError('Cross-origin request rejected');
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Normalize an uploader-supplied display name: strip control characters,
 * collapse whitespace, and bound the length. React escapes the value on
 * render, so this is about hygiene and storage bounds, not HTML safety.
 */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new BadRequestError('Name is required');
  }
  const cleaned = input
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (cleaned.length === 0) {
    throw new BadRequestError('Name is required');
  }
  return cleaned;
}
