import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = getCurrentUser();
  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    name: user?.name ?? null,
    isAdmin: user?.isAdmin ?? false,
  });
}
