import { NextResponse } from 'next/server';
import { completeOAuthLogin, consumeOAuthState } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const homeUrl = new URL('/', url.origin);
  const expectedState = consumeOAuthState();

  if (error) {
    homeUrl.searchParams.set('error', error);
    return NextResponse.redirect(homeUrl);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    homeUrl.searchParams.set('error', 'invalid_state');
    return NextResponse.redirect(homeUrl);
  }

  try {
    const user = await completeOAuthLogin(code);
    // Admins go to the review dashboard; everyone else stays on the portal to
    // pick photos from their own Google Photos library.
    const dest = user.isAdmin ? '/admin' : '/';
    return NextResponse.redirect(new URL(dest, url.origin));
  } catch (e) {
    console.error('OAuth callback error:', e);
    homeUrl.searchParams.set(
      'error',
      e instanceof Error ? encodeURIComponent(e.message) : 'auth_failed',
    );
    return NextResponse.redirect(homeUrl);
  }
}
