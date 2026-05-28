import { NextRequest, NextResponse } from 'next/server';
import { getTeams } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }
  if (authCheck.user?.role !== 'admin') {
    return NextResponse.json(
      { error: 'Operazione non autorizzata' },
      { status: 403 }
    );
  }

  try {
    const teams = await getTeams();
    return NextResponse.json({ teams });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}
