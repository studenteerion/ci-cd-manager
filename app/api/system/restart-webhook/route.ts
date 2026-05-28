import { NextRequest, NextResponse } from 'next/server';
import { systemRestartWebhook } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }
  if (authCheck.user?.role !== 'admin') {
    return NextResponse.json(
      { success: false, message: 'Operazione non autorizzata' },
      { status: 403 }
    );
  }

  try {
    const result = await systemRestartWebhook();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error restarting webhook:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to restart webhook server' },
      { status: 500 }
    );
  }
}
