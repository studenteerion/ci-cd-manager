import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { executeCommand } from '@/lib/server';

async function findWebhookContainerId(): Promise<string | null> {
  const candidateProjects = ['webhook'];
  for (const project of candidateProjects) {
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
      .find(line => line.toLowerCase().includes('webhook'))
      ?.split('\t')[0];
    return id || null;
  } catch {
    return null;
  }
}

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

  try {
  const tail = Number(request.nextUrl.searchParams.get('tail') || '100');
  const safeTail = Number.isFinite(tail) && tail > 0 ? Math.min(Math.floor(tail), 1000) : 100;
    const containerName = process.env.WEBHOOK_CONTAINER_NAME || 'webhook-server';
    const defaultLogCmd = `docker logs --tail ${safeTail} -t ${containerName} 2>&1`;
    const customLogCmd = process.env.WEBHOOK_LOG_CMD;

    try {
      const { stdout } = await executeCommand(customLogCmd || defaultLogCmd);
      if (stdout && stdout.trim()) {
        return NextResponse.json({ success: true, logs: stdout });
      }
    } catch {
      // fallback to detected container id below
    }

    const containerId = await findWebhookContainerId();
    if (!containerId) {
      return NextResponse.json(
        { success: false, message: 'Webhook container not found' },
        { status: 404 }
      );
    }

  const { stdout } = await executeCommand(`docker logs --tail ${safeTail} -t ${containerId} 2>&1`);

    return NextResponse.json({ success: true, logs: stdout || '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read webhook logs';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
