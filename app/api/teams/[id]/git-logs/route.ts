import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { executeCommand } from '@/lib/server';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params: paramPromise }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { id: teamName } = await paramPromise;
    if (authCheck.user?.role === 'team' && authCheck.user.username !== teamName) {
      return NextResponse.json(
        { success: false, message: 'Operazione non autorizzata' },
        { status: 403 }
      );
    }

    const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
    const teamDir = path.join(APPS_DIR, teamName);

    const tail = Number(request.nextUrl.searchParams.get('tail') || '50');
    const safeTail = Number.isFinite(tail) && tail > 0 ? Math.min(Math.floor(tail), 500) : 50;

    // Try to get git log from the team directory
    try {
      const { stdout: gitLog } = await executeCommand(
        `cd "${teamDir}" && git log --oneline -${safeTail} 2>/dev/null || echo "No git repository found"`
      );

      return NextResponse.json({
        success: true,
        logs: gitLog || 'No git logs available',
      });
    } catch (error) {
      return NextResponse.json({
        success: true,
        logs: 'No git repository found in this team directory',
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
