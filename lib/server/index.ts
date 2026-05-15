import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import * as net from 'net';
import * as path from 'path';
import { isTesting, logTestingMode, adjustPathForTesting } from '../env';

const execAsync = promisify(exec);

export async function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  if (isTesting) {
    logTestingMode(`Would execute: ${command}`);
    return { stdout: '', stderr: '' };
  }
  
  try {
    const timeoutMs = parseInt(process.env.EXEC_TIMEOUT_MS || '60000', 10);
    const { stdout, stderr } = await execAsync(command, {
      timeout: isNaN(timeoutMs) ? 60000 : timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error: any) {
    // Some child process errors include stdout/stderr properties — include them for easier debugging
    const out = error && (error.stdout ?? error.stdout === '' ? String(error.stdout) : '');
    const err = error && (error.stderr ?? error.stderr === '' ? String(error.stderr) : '');
    const parts = [`Command failed: ${error?.message ?? String(error)}`];
    if (out) parts.push(`stdout: ${out.trim()}`);
    if (err) parts.push(`stderr: ${err.trim()}`);
    parts.push(`command: ${command}`);
    throw new Error(parts.join(' | '));
  }
}

export async function generateWebhookSecret(): Promise<string> {
  if (isTesting) {
    logTestingMode('Generating mock webhook secret');
    return 'test-webhook-secret-' + Math.random().toString(36).substring(2, 15);
  }
  
  const { stdout } = await executeCommand('openssl rand -hex 32');
  return stdout.trim();
}

export async function gitClone(repoUrl: string, targetDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would clone ${repoUrl} to ${targetDir}`);
    return;
  }
  
  await executeCommand(`git clone "${repoUrl}" "${targetDir}"`);
}

export async function reloadCaddy(): Promise<void> {
  if (isTesting) {
    logTestingMode('Would reload Caddy');
    return;
  }
  
  const cmd = process.env.CADDY_RELOAD_CMD || 'sudo systemctl reload caddy';
  await executeCommand(cmd);
}

export async function restartWebhookServer(): Promise<void> {
  if (isTesting) {
    logTestingMode('Would restart webhook server');
    return;
  }
  
  const cmd = process.env.WEBHOOK_RESTART_CMD || 'docker compose -f /opt/apps/webhook/docker-compose.yml restart';
  await executeCommand(cmd);
}

export async function getExistingTeamHostPorts(appsDir: string): Promise<number[]> {
  const adjustedDir = adjustPathForTesting(appsDir);
  try {
    const entries = await fs.readdir(adjustedDir, { withFileTypes: true });
    const ports: number[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (['caddy', 'webhook'].includes(entry.name)) continue;

      const configPath = path.join(adjustedDir, entry.name, 'team.config.json');
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { hostPort?: number };
        if (config?.hostPort && Number.isInteger(config.hostPort)) {
          ports.push(config.hostPort);
        }
      } catch {
        continue;
      }
    }
    return ports;
  } catch {
    return [];
  }
}

export async function getListeningHostPorts(): Promise<Set<number>> {
  if (isTesting) {
    return new Set();
  }

  const commands = [
    `ss -tln | awk 'NR>1 {print $4}'`,
    `netstat -tln | awk 'NR>2 {print $4}'`,
  ];

  for (const cmd of commands) {
    try {
      const { stdout } = await executeCommand(cmd);
      const ports = new Set<number>();
      stdout.split('\n').forEach(line => {
        const match = line.trim().match(/(?:\.|:)(\d+)$/);
        if (match) {
          const port = parseInt(match[1], 10);
          if (!Number.isNaN(port)) {
            ports.add(port);
          }
        }
      });
      return ports;
    } catch {
      continue;
    }
  }

  return new Set();
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

export async function findAvailableHostPort(
  requestedPort: number | undefined,
  appsDir: string,
  allowPort?: number
): Promise<number> {
  const usedPorts = new Set(await getExistingTeamHostPorts(appsDir));
  if (allowPort !== undefined) {
    usedPorts.delete(allowPort);
  }

  const listeningPorts = await getListeningHostPorts();
  
  console.log(`[PORT DETECTION] requestedPort=${requestedPort}, usedPorts=[${Array.from(usedPorts).join(',')}], listeningPorts=[${Array.from(listeningPorts).join(',')}]`);
  
  const isPortFree = async (port: number): Promise<boolean> => {
    if (port < 1000 || port > 65535) {
      return false;
    }

    if (requestedPort === port && allowPort !== undefined && port === allowPort) {
      return true;
    }

    if (usedPorts.has(port)) {
      console.log(`[PORT DETECTION] Port ${port} is in usedPorts`);
      return false;
    }

    if (listeningPorts.size > 0) {
      const isFree = !listeningPorts.has(port);
      if (!isFree) {
        console.log(`[PORT DETECTION] Port ${port} is in listeningPorts`);
      }
      return isFree;
    }

    return await isPortAvailable(port);
  };

  if (requestedPort !== undefined) {
    if (await isPortFree(requestedPort)) {
      console.log(`[PORT DETECTION] Requested port ${requestedPort} is available, using it`);
      return requestedPort;
    } else {
      console.log(`[PORT DETECTION] Requested port ${requestedPort} is NOT available, finding alternative`);
    }
  }

  const startPort = requestedPort && requestedPort > 0 ? requestedPort + 1 : 8000;
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortFree(port)) {
      console.log(`[PORT DETECTION] Found available port ${port}`);
      return port;
    }
  }

  for (let port = 1000; port < startPort; port += 1) {
    if (await isPortFree(port)) {
      console.log(`[PORT DETECTION] Found available port ${port} (below requested)`);
      return port;
    }
  }

  throw new Error('No available host port found on this machine');
}

export async function fileExists(filePath: string): Promise<boolean> {
  const adjustedPath = adjustPathForTesting(filePath);
  try {
    await fs.access(adjustedPath);
    return true;
  } catch {
    return false;
  }
}

export async function createDirectory(dirPath: string): Promise<void> {
  const adjustedPath = adjustPathForTesting(dirPath);
  await fs.mkdir(adjustedPath, { recursive: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const adjustedPath = adjustPathForTesting(filePath);
  const dir = path.dirname(adjustedPath);
  await createDirectory(dir);
  await fs.writeFile(adjustedPath, content, 'utf-8');
}

export async function readFile(filePath: string): Promise<string> {
  const adjustedPath = adjustPathForTesting(filePath);
  return fs.readFile(adjustedPath, 'utf-8');
}

export async function readJSON<T>(filePath: string, defaultValue?: T): Promise<T> {
  try {
    const content = await readFile(filePath);
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === 'ENOENT' && defaultValue !== undefined) {
      return defaultValue;
    }
    throw error;
  }
}

export async function writeJSON<T>(filePath: string, data: T): Promise<void> {
  const adjustedPath = adjustPathForTesting(filePath);
  const dir = path.dirname(adjustedPath);
  await createDirectory(dir);
  await fs.writeFile(adjustedPath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  const adjustedPath = adjustPathForTesting(dirPath);
  try {
    const entries = await fs.readdir(adjustedPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function chmod(filePath: string, mode: number): Promise<void> {
  const adjustedPath = adjustPathForTesting(filePath);
  await fs.chmod(adjustedPath, mode);
}

export async function restartContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would run docker compose up in ${teamDir}`);
    return;
  }
  
  await executeCommand(`cd "${teamDir}" && docker compose up -d --force-recreate`);
}

export async function deployTeam(teamDir: string, teamName?: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would deploy team from ${teamDir}`);
    return;
  }

  const deployScriptPath = `${teamDir}/deploy.sh`;
  if (await fileExists(deployScriptPath)) {
    await executeCommand(`sh "${deployScriptPath}"`);
    return;
  }

  if (teamName) {
    const webhookDeployPath = path.join('/opt/apps/webhook/scripts', `deploy-${teamName}.sh`);
    if (await fileExists(webhookDeployPath)) {
      await executeCommand(`sh "${webhookDeployPath}"`);
      return;
    }
  }

  throw new Error(`Deploy script not found for team ${teamName ?? teamDir}`);
}

export async function updateWebhookBranch(
  hooksJsonPath: string,
  teamName: string,
  newBranch: string
): Promise<void> {
  const hooks = JSON.parse(await readFile(hooksJsonPath)) as any[];
  const hookIndex = hooks.findIndex(
    (hook: any) => hook.id === teamName || String(hook.id).startsWith(`${teamName}`)
  );

  if (hookIndex === -1) {
    throw new Error(`Hook not found for team ${teamName}`);
  }

  const hook = hooks[hookIndex];
  const triggerRule = hook['trigger-rule'];

  if (!triggerRule || !Array.isArray(triggerRule.and)) {
    throw new Error(`Invalid hook format for team ${teamName}`);
  }

  const branchMatch = triggerRule.and.find(
    (item: any) => item?.match?.type === 'value' && item?.match?.parameter?.name === 'ref'
  );

  if (!branchMatch) {
    throw new Error(`Branch match rule not found for team ${teamName}`);
  }

  branchMatch.match.value = `refs/heads/${newBranch}`;
  hooks[hookIndex] = {
    ...hook,
    'trigger-rule': triggerRule,
  };

  await writeJSON(hooksJsonPath, hooks);
}
