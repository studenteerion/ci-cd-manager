import { NextRequest, NextResponse } from 'next/server';
import { systemReloadCaddy } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const result = await systemReloadCaddy();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error reloading Caddy:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to reload Caddy' },
      { status: 500 }
    );
  }
}
