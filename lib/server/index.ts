import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import { isTesting, logTestingMode } from '../env';

const execAsync = promisify(exec);

export async function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  if (isTesting) {
    logTestingMode(`Would execute: ${command}`);
    return { stdout: '', stderr: '' };
  }
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error: any) {
    throw new Error(`Command failed: ${error.message}`);
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
  
  const cmd = process.env.CADDY_RELOAD_CMD || 'systemctl reload caddy';
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

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await createDirectory(dir);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function readJSON<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  return JSON.parse(content);
}

export async function writeJSON<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await createDirectory(dir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function chmod(filePath: string, mode: number): Promise<void> {
  await fs.chmod(filePath, mode);
}

export async function restartContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would run docker compose up in ${teamDir}`);
    return;
  }
  
  await executeCommand(`cd "${teamDir}" && docker compose up -d`);
}

export async function deployTeam(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would deploy team from ${teamDir}`);
    return;
  }
  
  const deployScriptPath = `${teamDir}/deploy.sh`;
  if (!await fileExists(deployScriptPath)) {
    throw new Error(`Deploy script not found at ${deployScriptPath}`);
  }
  await executeCommand(`bash "${deployScriptPath}"`);
}

export async function updateWebhookBranch(
  hooksJsonPath: string,
  teamName: string,
  newBranch: string
): Promise<void> {
  const hooks = JSON.parse(await readFile(hooksJsonPath));
  const hookIndex = hooks.findIndex((h: any) => h.id === `team-${teamName}-${hooks.find((h: any) => h.id.startsWith(`team-${teamName}`))?.['match-branch']}`);
  
  // Find hook by team name and update branch
  const teamHook = hooks.find((h: any) => h.id.startsWith(`team-${teamName}-`));
  if (!teamHook) {
    throw new Error(`Hook not found for team ${teamName}`);
  }
  
  // Remove old hook and create new one with updated branch
  const hookIndexToRemove = hooks.findIndex((h: any) => h.id === teamHook.id);
  hooks.splice(hookIndexToRemove, 1);
  
  // Create updated hook with new branch
  const updatedHook = {
    ...teamHook,
    id: `team-${teamName}-${newBranch}`,
    'match-branch': newBranch,
  };
  
  hooks.push(updatedHook);
  await writeJSON(hooksJsonPath, hooks);
}
