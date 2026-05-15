import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { executeCommand } from '@/lib/server';

export async function GET(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const tail = Number(request.nextUrl.searchParams.get('tail') || '200');
    const safeTail = Number.isFinite(tail) && tail > 0 ? Math.min(Math.floor(tail), 1000) : 200;
    const logCmd =
      process.env.CADDY_LOG_CMD ||
      `journalctl -u caddy --no-pager -n ${safeTail}`;
    const { stdout } = await executeCommand(logCmd);

    return NextResponse.json({ success: true, logs: stdout || '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read Caddy logs';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
