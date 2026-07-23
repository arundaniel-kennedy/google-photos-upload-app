import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  logout();
  return NextResponse.redirect(new URL('/admin', new URL(request.url).origin), {
    status: 303,
  });
}
