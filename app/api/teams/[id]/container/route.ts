import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { restartTeamContainer, startTeamContainer, stopTeamContainer } from '@/actions/teams';

const allowedActions = new Set(['start', 'stop', 'restart']);

type ContainerAction = 'start' | 'stop' | 'restart';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  if (authCheck.user?.role === 'team' && authCheck.user.username !== id) {
    return NextResponse.json(
      { success: false, message: 'Operazione non autorizzata' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        { success: false, message: 'Azione non valida. Usa start, stop o restart.' },
        { status: 400 }
      );
    }

    const result = action === 'start'
      ? await startTeamContainer(id)
      : action === 'restart'
      ? await restartTeamContainer(id)
      : await stopTeamContainer(id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update container state';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
