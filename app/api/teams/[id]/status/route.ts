import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { executeCommand } from '@/lib/server';
import { isTesting } from '@/lib/env';
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

function normalizeStatus(rawStatus: string): string {
  const status = rawStatus.toLowerCase();
  if (status === 'running') return 'running';
  if (status === 'restarting') return 'restarting';
  if (status === 'exited') return 'exited';
  if (status === 'paused') return 'stopped';
  if (status === 'dead') return 'stopped';
  if (status === 'created') return 'stopped';
  return status || 'unknown';
}

export async function GET(
  request: NextRequest,
  { params: paramPromise }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requireAuth(request);
    if (!authCheck.authenticated) {
      return authCheck.response!;
    }

    const { id: teamName } = await paramPromise;
    if (authCheck.user?.role === 'team' && authCheck.user.username !== teamName) {
      return NextResponse.json(
        { success: false, message: 'Operazione non autorizzata' },
        { status: 403 }
      );
    }

    if (isTesting) {
      // In testing mode, return mock status
      const statuses = ['running', 'running', 'stopped', 'exited'];
      const mockStatus = statuses[Math.floor(Math.random() * statuses.length)];
      return NextResponse.json({
        success: true,
        status: mockStatus,
        containerName: `${teamName}-app`,
      });
    }

    // In production, get actual container status
    const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
    const teamDir = path.join(APPS_DIR, teamName);

    const containerId = await findContainerId(teamName, teamDir);
    if (!containerId) {
      return NextResponse.json({
        success: true,
        status: 'unknown',
        containerName: `${teamName}-app`,
      });
    }

    const [{ stdout: statusStdout }, { stdout: nameStdout }] = await Promise.all([
      executeCommand(`docker inspect -f '{{.State.Status}}' ${containerId}`),
      executeCommand(`docker inspect -f '{{.Name}}' ${containerId}`),
    ]);

    const status = normalizeStatus(statusStdout.trim());
    const containerName = nameStdout.trim().replace(/^\//, '') || `${teamName}-app`;

    return NextResponse.json({
      success: true,
      status,
      containerName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
