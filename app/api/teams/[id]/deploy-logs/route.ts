import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { fileExists, readFile } from '@/lib/server';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  try {
    const sanitizedTeamName = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const appsDir = process.env.APPS_BASE_DIR || '/opt/apps';
    const logPath = path.join(appsDir, 'webhook', 'logs', `deploy-${sanitizedTeamName}.log`);

    if (!(await fileExists(logPath))) {
      return NextResponse.json({ success: false, message: 'Deploy log not found.' }, { status: 404 });
    }

    const url = new URL(request.url);
    const tailParam = url.searchParams.get('tail');
    const tail = tailParam ? Number(tailParam) : 200;
    const raw = await readFile(logPath);
    const lines = raw.split('\n');
    const output = Number.isFinite(tail) && tail > 0 ? lines.slice(-tail).join('\n') : raw;

    return NextResponse.json({ success: true, logs: output });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read deploy logs';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}