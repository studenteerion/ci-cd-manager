import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { readJSON, fileExists } from '@/lib/server';
import path from 'path';

const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
const TEAM_CREATE_STATUS_DIR = process.env.TEAM_CREATE_STATUS_DIR || path.join(APPS_DIR, '.team-create-status');

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const teamName = searchParams.get('team');
  if (!teamName) {
    return NextResponse.json(
      { success: false, message: 'Parametro team mancante' },
      { status: 400 }
    );
  }

  const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const statusPath = path.join(TEAM_CREATE_STATUS_DIR, `${sanitizedTeamName}.json`);

  if (!(await fileExists(statusPath))) {
    return NextResponse.json(
      { success: false, message: 'Nessuna creazione in corso' },
      { status: 404 }
    );
  }

  try {
    const status = await readJSON(statusPath);
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Impossibile leggere lo stato di creazione' },
      { status: 500 }
    );
  }
}
