import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { rebuildTeamContainer, recreateTeamContainer, removeTeamContainer } from '@/actions/teams';

type MaintenanceAction = 'remove' | 'remove-volumes' | 'rebuild' | 'recreate';
const allowedActions = new Set<MaintenanceAction>(['remove', 'remove-volumes', 'rebuild', 'recreate']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (!allowedActions.has(action as MaintenanceAction)) {
      return NextResponse.json(
        { success: false, message: 'Azione non valida.' },
        { status: 400 }
      );
    }

    if (action === 'remove') {
      const result = await removeTeamContainer(id, false);
      return NextResponse.json(result);
    }

    if (action === 'remove-volumes') {
      const result = await removeTeamContainer(id, true);
      return NextResponse.json(result);
    }

    if (action === 'rebuild') {
      const result = await rebuildTeamContainer(id);
      return NextResponse.json(result);
    }

    const result = await recreateTeamContainer(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update container state';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
