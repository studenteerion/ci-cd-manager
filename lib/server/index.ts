import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import * as net from 'net';
import * as path from 'path';
import * as YAML from 'js-yaml';
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

const formatGitAccessError = (error: Error) => {
  const message = error.message.toLowerCase();
  if (message.includes('authentication failed') || message.includes('access denied')) {
    return 'Repository not accessible. Please check credentials or access permissions.';
  }
  if (message.includes('repository not found')) {
    return 'Repository not found or you do not have access to it.';
  }
  if (message.includes('could not read from remote repository')) {
    return 'Unable to read from remote repository. Verify the URL and access rights.';
  }
  return `Git error: ${error.message}`;
};

async function remoteBranchExists(repoUrl: string, branch: string): Promise<boolean> {
  try {
    const { stdout } = await executeCommand(
      `git ls-remote --heads "${repoUrl}" "${branch}"`
    );
    return stdout.trim().length > 0;
  } catch (error) {
    throw new Error(formatGitAccessError(error as Error));
  }
}

async function getRemoteDefaultBranch(repoUrl: string): Promise<string | null> {
  try {
    const { stdout } = await executeCommand(
      `git ls-remote --symref "${repoUrl}" HEAD`
    );
    const match = stdout.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    return match?.[1] || null;
  } catch (error) {
    throw new Error(formatGitAccessError(error as Error));
  }
}

async function getFirstRemoteBranch(repoUrl: string): Promise<string | null> {
  try {
    const { stdout } = await executeCommand(`git ls-remote --heads "${repoUrl}"`);
    const first = stdout.split('\n').map(line => line.trim()).find(Boolean);
    if (!first) return null;
    const match = first.match(/refs\/heads\/([^\s]+)/);
    return match?.[1] || null;
  } catch (error) {
    throw new Error(formatGitAccessError(error as Error));
  }
}

export async function resolveGitBranch(
  repoUrl: string,
  requestedBranch?: string
): Promise<{ branch: string; defaultBranch?: string }> {
  const defaultBranch = await getRemoteDefaultBranch(repoUrl);

  if (requestedBranch) {
    const exists = await remoteBranchExists(repoUrl, requestedBranch);
    if (!exists) {
      const fallbackHint = defaultBranch
        ? `Default branch is '${defaultBranch}'.`
        : 'Please verify the branch name.';
      throw new Error(`Branch '${requestedBranch}' not found. ${fallbackHint}`);
    }
    return { branch: requestedBranch, defaultBranch: defaultBranch || undefined };
  }

  if (defaultBranch) {
    return { branch: defaultBranch, defaultBranch };
  }

  if (await remoteBranchExists(repoUrl, 'main')) {
    return { branch: 'main', defaultBranch: 'main' };
  }

  if (await remoteBranchExists(repoUrl, 'master')) {
    return { branch: 'master', defaultBranch: 'master' };
  }

  const firstBranch = await getFirstRemoteBranch(repoUrl);
  if (firstBranch) {
    return { branch: firstBranch, defaultBranch: firstBranch };
  }

  throw new Error('Unable to detect any branches in the repository.');
}

export async function gitClone(
  repoUrl: string,
  targetDir: string,
  options?: { branch?: string }
): Promise<{ branch: string; defaultBranch?: string }> {
  if (isTesting) {
    logTestingMode(`Would clone ${repoUrl} to ${targetDir}`);
    return { branch: options?.branch || 'main' };
  }

  const resolved = await resolveGitBranch(repoUrl, options?.branch);
  try {
    await executeCommand(
      `git clone --branch "${resolved.branch}" --single-branch "${repoUrl}" "${targetDir}"`
    );
    return resolved;
  } catch (error) {
    throw new Error(formatGitAccessError(error as Error));
  }
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

async function findComposeFilePath(teamDir: string): Promise<string | undefined> {
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
  for (const file of composeFiles) {
    const filePath = path.join(teamDir, file);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return undefined;
}

async function generateRuntimeComposeFile(teamDir: string): Promise<string | undefined> {
  const composeFilePath = await findComposeFilePath(teamDir);
  if (!composeFilePath) {
    return undefined;
  }

  const overridePath = path.join(teamDir, 'docker-compose.override.yml');
  if (!(await fileExists(overridePath))) {
    return undefined;
  }

  const composeContent = await readFile(composeFilePath);
  const overrideContent = await readFile(overridePath);
  const compose = YAML.load(composeContent) as any;
  const override = YAML.load(overrideContent) as any;

  if (!compose || typeof compose !== 'object' || !compose.services || !override || typeof override !== 'object' || !override.services) {
    return undefined;
  }

  const overrideServiceNames = Object.keys(override.services);
  for (const serviceName of overrideServiceNames) {
    if (compose.services[serviceName] && compose.services[serviceName].ports) {
      delete compose.services[serviceName].ports;
    }
  }

  const runtimeComposePath = path.join(teamDir, 'docker-compose.runtime.yml');
  const runtimeContent = YAML.dump(compose, { noRefs: true, lineWidth: 120 });
  await fs.writeFile(runtimeComposePath, runtimeContent, 'utf-8');
  return runtimeComposePath;
}

async function buildComposeBase(teamDir: string): Promise<string> {
  const runtimeComposePath = await generateRuntimeComposeFile(teamDir);
  const overridePath = path.join(teamDir, 'docker-compose.override.yml');
  const composeArgs: string[] = [];

  if (runtimeComposePath) {
    composeArgs.push('-f', `"${runtimeComposePath}"`);
  } else {
    const defaultCompose = await findComposeFilePath(teamDir);
    if (defaultCompose) {
      composeArgs.push('-f', `"${defaultCompose}"`);
    }
  }

  if (await fileExists(overridePath)) {
    composeArgs.push('-f', `"${overridePath}"`);
  }

  return composeArgs.length > 0
    ? `docker compose ${composeArgs.join(' ')}`
    : 'docker compose';
}

export async function restartContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would run docker compose up in ${teamDir}`);
    return;
  }

  const composeBase = await buildComposeBase(teamDir);

  // First, stop and remove existing containers to free up ports
  await executeCommand(`cd "${teamDir}" && ${composeBase} down --remove-orphans`);

  // Then bring up containers
  await executeCommand(`cd "${teamDir}" && ${composeBase} up -d`);
}

export async function stopContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would stop docker compose containers in ${teamDir}`);
    return;
  }

  const composeBase = await buildComposeBase(teamDir);
  await executeCommand(`cd "${teamDir}" && ${composeBase} stop`);
}

export async function startContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would start docker compose containers in ${teamDir}`);
    return;
  }

  const composeBase = await buildComposeBase(teamDir);
  await executeCommand(`cd "${teamDir}" && ${composeBase} up -d`);
}

export async function removeContainers(teamDir: string, removeVolumes: boolean = false): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would remove docker compose containers in ${teamDir} (volumes: ${removeVolumes})`);
    return;
  }

  const composeBase = await buildComposeBase(teamDir);
  const volumeFlag = removeVolumes ? ' -v' : '';
  await executeCommand(`cd "${teamDir}" && ${composeBase} down --remove-orphans${volumeFlag}`);
}

export async function rebuildContainers(teamDir: string): Promise<void> {
  if (isTesting) {
    logTestingMode(`Would rebuild docker compose containers in ${teamDir}`);
    return;
  }

  const composeBase = await buildComposeBase(teamDir);
  await executeCommand(`cd "${teamDir}" && ${composeBase} up -d --build --force-recreate`);
}

export async function getComposeState(teamDir: string): Promise<{ hasContainers: boolean; hasImages: boolean }> {
  if (isTesting) {
    logTestingMode(`Would inspect docker compose state in ${teamDir}`);
    return { hasContainers: false, hasImages: false };
  }

  const composeBase = await buildComposeBase(teamDir);
  const [{ stdout: containerStdout }, { stdout: imageStdout }] = await Promise.all([
    executeCommand(`cd "${teamDir}" && ${composeBase} ps -q`),
    executeCommand(`cd "${teamDir}" && ${composeBase} images -q`),
  ]);
  return {
    hasContainers: containerStdout.trim().length > 0,
    hasImages: imageStdout.trim().length > 0,
  };
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
