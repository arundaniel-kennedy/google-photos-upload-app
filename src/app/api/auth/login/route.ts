import { NextResponse } from 'next/server';
import { buildConsentUrl, setOAuthState } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { url, state } = buildConsentUrl();
    setOAuthState(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'OAuth is not configured' },
      { status: 500 },
    );
  }
}
