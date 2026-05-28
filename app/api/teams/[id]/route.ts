import { NextRequest, NextResponse } from 'next/server';
import { deleteTeam } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

const normalizeTeamName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9-]/g, '-');

export async function DELETE(
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
  let body: { confirmName?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const confirmName = typeof body.confirmName === 'string' ? body.confirmName.trim() : '';
  if (!confirmName || normalizeTeamName(confirmName) !== normalizeTeamName(id)) {
    return NextResponse.json(
      { success: false, message: 'Nome progetto non valido. Conferma il nome per eliminare il team.' },
      { status: 400 }
    );
  }

  const result = await deleteTeam(id);
  const status = result.success ? 200 : (result.message.includes('not found') ? 404 : 500);
  return NextResponse.json(result, { status });
}
