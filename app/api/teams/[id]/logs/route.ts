import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { executeCommand } from '@/lib/server';
import * as path from 'path';

async function findContainerId(teamName: string, teamDir: string): Promise<string | null> {
  const composeCmds = [
    `cd "${teamDir}" && docker compose ps -q`,
    `cd "${teamDir}" && docker-compose ps -q`,
  ];

  for (const cmd of composeCmds) {
    try {
      const { stdout } = await executeCommand(cmd);
      const ids = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        return ids[0];
      }
    } catch {
      continue;
    }
  }

  const projectNames = Array.from(new Set([teamName, `${teamName}s`].filter(Boolean)));
  for (const project of projectNames) {
    try {
      const { stdout } = await executeCommand(
        `docker ps -a --filter "label=com.docker.compose.project=${project}" --format "{{.ID}}"`
      );
      const id = stdout
        .split('\n')
        .map(line => line.trim())
        .find(Boolean);
      if (id) {
        return id;
      }
    } catch {
      continue;
    }
  }

  try {
    const { stdout } = await executeCommand(`docker ps -a --format "{{.ID}}\t{{.Names}}"`);
    const id = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .find(line => line.toLowerCase().includes(teamName))
      ?.split('\t')[0];
    return id || null;
  } catch {
    return null;
  }
}

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

    const containerId = await findContainerId(teamName, teamDir);
    if (!containerId) {
      return NextResponse.json(
        { success: false, message: 'Container not found' },
        { status: 404 }
      );
    }

    const tail = Number(request.nextUrl.searchParams.get('tail') || '200');
    const safeTail = Number.isFinite(tail) && tail > 0 ? Math.min(Math.floor(tail), 1000) : 200;

    const [{ stdout: logsStdout }, { stdout: nameStdout }] = await Promise.all([
      executeCommand(`docker logs --tail ${safeTail} ${containerId}`),
      executeCommand(`docker inspect -f '{{.Name}}' ${containerId}`),
    ]);

    return NextResponse.json({
      success: true,
      logs: logsStdout || '',
      containerName: nameStdout.trim().replace(/^\//, '') || teamName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch logs';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
