'use server';

import {
  generateWebhookSecret,
  gitClone,
  createDirectory,
  writeFile,
  readJSON,
  writeJSON,
  readFile,
  chmod,
  reloadCaddy,
  restartWebhookServer,
  listDirectories,
  restartContainers,
  deployTeam,
  updateWebhookBranch,
  findAvailableHostPort,
  executeCommand,
  resolveGitBranch,
} from '@/lib/server';
import {
  generateCaddyConfig,
  generateDeployScript,
  generateWebhookHookEntry,
  generateDockerComposeOverride,
  detectComposeServiceName,
  detectComposeTargetPort,
  extractPortFromDockerCompose,
} from '@/lib/templates';
import * as path from 'path';
import { fileExists } from '@/lib/server';
import {
  EnvEntry,
  entriesToRecord,
  parseEnvContent,
  recordToEnvEntries,
  serializeEnvEntries,
  validateEnvEntries,
} from '@/lib/env-file';

const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
const CADDY_CONF_DIR = process.env.CADDY_CONF_DIR || path.join(APPS_DIR, 'caddy', 'conf.d');
const WEBHOOK_SCRIPTS_DIR = process.env.WEBHOOK_SCRIPTS_DIR || path.join(APPS_DIR, 'webhook', 'scripts');
const HOOKS_JSON_PATH = process.env.WEBHOOK_HOOKS_FILE || path.join(APPS_DIR, 'webhook', 'hooks.json');

export interface CreateTeamInput {
  teamName: string;
  repositoryUrl: string;
  domain: string;
  hostPort?: number;
  envVariables?: Record<string, string>;
  envEntries?: EnvEntry[];
  branch?: string;
}

export interface TeamConfigFile {
  hostPort: number;
  domain: string;
  createdAt: string;
  branch?: string;
  repositoryUrl?: string;
}

export interface TeamInfo {
  name: string;
}

const MIN_RANDOM_PORT = 10000;
const MAX_RANDOM_PORT = 60000;

function generateRandomHostPort(): number {
  return Math.floor(Math.random() * (MAX_RANDOM_PORT - MIN_RANDOM_PORT + 1)) + MIN_RANDOM_PORT;
}

export async function getTeams(): Promise<TeamInfo[]> {
  try {
    const dirs = await listDirectories(APPS_DIR);
    // Filter out system directories
    const teamDirs = dirs.filter(
      dir => !['caddy', 'webhook', 'users.json'].includes(dir)
    );
    return teamDirs.map(name => ({ name }));
  } catch (error) {
    console.error('Failed to get teams:', error);
    return [];
  }
}

export async function createTeam(input: CreateTeamInput): Promise<{ success: boolean; message: string; hostPort?: number; webhookSecret?: string }> {
  try {
    const { teamName, repositoryUrl, domain, hostPort, envVariables, envEntries, branch } = input;

    // Validate inputs
    if (!teamName || !repositoryUrl || !domain) {
      return { success: false, message: 'Missing required fields' };
    }

    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    const normalizedEntries = envEntries && envEntries.length > 0
      ? envEntries
      : recordToEnvEntries(envVariables || {});
    const envValidation = validateEnvEntries(normalizedEntries);
    if (envValidation.errors.length > 0) {
      return {
        success: false,
        message: `Invalid environment variables: ${envValidation.errors.join(' | ')}`,
      };
    }

    console.log(`Creating team: ${sanitizedTeamName} in ${teamDir}`);

    const requestedPort = hostPort && hostPort > 0 ? hostPort : generateRandomHostPort();
    const assignedPort = await findAvailableHostPort(requestedPort, APPS_DIR);
    const portMessage = hostPort && assignedPort !== hostPort
      ? ` Requested port ${hostPort} was unavailable and assigned ${assignedPort}.`
      : '';

    // Step 1: Create team directory
    console.log('Step 1: Creating directory...');
    await createDirectory(teamDir);

    // Step 2: Git clone
    console.log('Step 2: Cloning repository...');
  const { branch: resolvedBranch } = await gitClone(repositoryUrl, teamDir, { branch });

    // Step 3: Create .env file
    console.log('Step 3: Creating .env file...');
    const envContent = serializeEnvEntries(envValidation.entries);
    const envPath = path.join(teamDir, '.env');
    await writeFile(envPath, envContent);

    // Step 4: Save team configuration, create docker-compose override, and generate Caddy config
    console.log('Step 4: Creating team config, docker-compose override, and Caddy config...');
    const teamConfig: TeamConfigFile = {
      hostPort: assignedPort,
      domain,
      createdAt: new Date().toISOString(),
      branch: resolvedBranch,
      repositoryUrl,
    };
    const teamConfigPath = path.join(teamDir, 'team.config.json');
    await writeJSON(teamConfigPath, teamConfig);

    const serviceName = await detectComposeServiceName(teamDir).catch(() => 'app');
    const containerPort = await detectComposeTargetPort(teamDir).catch(() => assignedPort);
    const overrideContent = generateDockerComposeOverride(assignedPort, serviceName, containerPort);
    const overridePath = path.join(teamDir, 'docker-compose.override.yml');
    await writeFile(overridePath, overrideContent);

    await createDirectory(CADDY_CONF_DIR);
    const caddyConfig = generateCaddyConfig(sanitizedTeamName, domain, assignedPort);
    const caddyPath = path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`);
    await writeFile(caddyPath, caddyConfig);

    console.log("TEAM CONFIGURATION SAVED IN:", caddyPath, caddyConfig);

    // Step 5: Generate webhook secret
    console.log('Step 5: Generating webhook secret...');
    const webhookSecret = await generateWebhookSecret();

    // Step 6: Add entry to hooks.json
    console.log('Step 6: Adding webhook hook...');
    const webhookDir = path.dirname(HOOKS_JSON_PATH);
    await createDirectory(webhookDir);
    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH, []);
  const newHook = generateWebhookHookEntry(sanitizedTeamName, webhookSecret, resolvedBranch);
    const existingHookIndex = hooks.findIndex(hook => hook.id === sanitizedTeamName);
    if (existingHookIndex !== -1) {
      hooks.splice(existingHookIndex, 1);
    }
    hooks.push(newHook);
    await writeJSON(HOOKS_JSON_PATH, hooks);

    // Step 7: Create deploy script
    console.log('Step 7: Creating deploy script...');
    await createDirectory(WEBHOOK_SCRIPTS_DIR);
  const logFile = path.join(APPS_DIR, 'webhook', 'logs', `deploy-${sanitizedTeamName}.log`);
  const deployScript = generateDeployScript(sanitizedTeamName, resolvedBranch, teamDir, logFile, serviceName, containerPort);
    const scriptPath = path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`);
    await writeFile(scriptPath, deployScript);
    await chmod(scriptPath, 0o755);

  // Step 8: Start team containers
  console.log('Step 8: Starting team containers...');
  await restartContainers(teamDir);

  // Step 9: Reload Caddy
  console.log('Step 9: Reloading Caddy...');
  await reloadCaddy();

  // Step 10: Restart webhook server
  console.log('Step 10: Restarting webhook server...');
  await restartWebhookServer();

    return {
      success: true,
      message: `Team '${sanitizedTeamName}' created successfully.${portMessage} Webhook secret: ${webhookSecret}`,
      hostPort: assignedPort,
      webhookSecret,
    };
  } catch (error) {
    console.error('Team creation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return { success: false, message };
  }
}

export async function systemReloadCaddy(): Promise<{ success: boolean; message: string }> {
  try {
    await reloadCaddy();
    return { success: true, message: 'Caddy reloaded successfully' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reload Caddy';
    return { success: false, message };
  }
}

export async function systemRestartWebhook(): Promise<{ success: boolean; message: string }> {
  try {
    await restartWebhookServer();
    return { success: true, message: 'Webhook server restarted successfully' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restart webhook server';
    return { success: false, message };
  }
}

export interface TeamConfig {
  name: string;
  domain: string;
  repository: string;
  branch: string;
  env: Record<string, string>;
  envEntries?: EnvEntry[];
  envParseErrors?: string[];
  envParseWarnings?: string[];
}

async function inferDomainFromCaddy(teamName: string): Promise<string> {
  const caddyPath = path.join('/opt/apps/caddy/conf.d', `${teamName}.conf`);
  if (!(await fileExists(caddyPath))) {
    return '';
  }

  const content = await readFile(caddyPath);
  const firstLine = content
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0 && !line.startsWith('#'));

  if (!firstLine) {
    return '';
  }

  const domain = firstLine.split('{')[0]?.trim();
  return domain || '';
}

async function ensureTeamConfig(teamName: string, teamDir: string): Promise<TeamConfigFile> {
  const configPath = path.join(teamDir, 'team.config.json');
  if (await fileExists(configPath)) {
    return readJSON<TeamConfigFile>(configPath);
  }

  let hostPort = 0;
  try {
    hostPort = await extractPortFromDockerCompose(teamDir);
  } catch {
    hostPort = 0;
  }

  const domain = await inferDomainFromCaddy(teamName);
  const teamConfig: TeamConfigFile = {
    hostPort,
    domain,
    createdAt: new Date().toISOString(),
  };

  await writeJSON(configPath, teamConfig);
  return teamConfig;
}

async function getActualHostPort(teamDir: string, teamName: string): Promise<number | null> {
  try {
    const composeCmds = [
      `cd "${teamDir}" && docker compose ps -q`,
      `cd "${teamDir}" && docker-compose ps -q`,
    ];

    let containerIds: string[] = [];
    for (const cmd of composeCmds) {
      try {
        const { stdout } = await executeCommand(cmd);
        const ids = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          containerIds = ids;
          break;
        }
      } catch {
        continue;
      }
    }

    if (containerIds.length === 0) {
      const projectNames = Array.from(
        new Set([teamName, `${teamName}s`].filter(Boolean))
      );

      for (const project of projectNames) {
        try {
          const { stdout } = await executeCommand(
            `docker ps --filter "label=com.docker.compose.project=${project}" --format "{{.ID}}"`
          );
          const ids = stdout
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
          if (ids.length > 0) {
            containerIds = ids;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (containerIds.length === 0) {
      try {
        const { stdout } = await executeCommand(
          `docker ps --format "{{.ID}}\t{{.Names}}"`
        );
        const ids = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .filter(line => line.toLowerCase().includes(teamName))
          .map(line => line.split('\t')[0])
          .filter(Boolean);
        if (ids.length > 0) {
          containerIds = ids;
        }
      } catch {
        // ignore
      }
    }

    if (containerIds.length === 0) {
      return null;
    }

    for (const id of containerIds) {
      const { stdout } = await executeCommand(
        `docker inspect -f '{{json .NetworkSettings.Ports}}' ${id}`
      );

      if (!stdout.trim()) {
        continue;
      }

      const ports = JSON.parse(stdout) as Record<string, Array<{ HostPort: string }> | null>;
      for (const bindings of Object.values(ports)) {
        if (!bindings || bindings.length === 0) {
          continue;
        }

        const hostPort = parseInt(bindings[0].HostPort, 10);
        if (!Number.isNaN(hostPort)) {
          return hostPort;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to detect actual host port:', error);
    return null;
  }
}

export async function getTeamConfig(teamName: string): Promise<TeamConfig | null> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    const teamConfig = await ensureTeamConfig(sanitizedTeamName, teamDir);

    const envPath = path.join(teamDir, '.env');
    let envContent = '';
    if (await fileExists(envPath)) {
      envContent = await readFile(envPath);
    }

    const parsed = parseEnvContent(envContent);
    const env = entriesToRecord(parsed.entries);

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH);
    const teamHook = hooks.find(h => h.id === sanitizedTeamName);
    const branch = teamHook?.['match-branch'] || teamConfig.branch || 'main';

    return {
      name: sanitizedTeamName,
      domain: teamConfig.domain,
      repository: teamConfig.repositoryUrl || 'unknown',
      branch,
      env,
      envEntries: parsed.entries,
      envParseErrors: parsed.errors,
      envParseWarnings: parsed.warnings,
    };
  } catch (error) {
    console.error('Failed to get team config:', error);
    return null;
  }
}

export async function updateTeamEnv(
  teamName: string,
  envEntries: EnvEntry[]
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    const validation = validateEnvEntries(envEntries);
    if (validation.errors.length > 0) {
      return {
        success: false,
        message: `Invalid environment variables: ${validation.errors.join(' | ')}`,
      };
    }

    const envContent = serializeEnvEntries(validation.entries);
    
    const envPath = path.join(teamDir, '.env');
    await writeFile(envPath, envContent);

    await restartContainers(teamDir);

    return {
      success: true,
      message: `Environment variables updated and containers restarted for team '${sanitizedTeamName}'`,
    };
  } catch (error) {
    console.error('Failed to update team env:', error);
    const message = error instanceof Error ? error.message : 'Failed to update environment variables';
    return { success: false, message };
  }
}

export async function manualDeployTeam(teamName: string): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    await deployTeam(teamDir, sanitizedTeamName);

    return {
      success: true,
      message: `Deployment triggered successfully for team '${sanitizedTeamName}'`,
    };
  } catch (error) {
    console.error('Failed to deploy team:', error);
    const message = error instanceof Error ? error.message : 'Failed to deploy team';
    return { success: false, message };
  }
}

export async function updateTeamBranch(
  teamName: string,
  newBranch: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!newBranch || !newBranch.trim()) {
      return { success: false, message: 'Branch name cannot be empty.' };
    }
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    const configPath = path.join(teamDir, 'team.config.json');
    const config = await readJSON<TeamConfigFile>(configPath);
    let repositoryUrl = config.repositoryUrl || '';
    if (!repositoryUrl) {
      try {
        const { stdout } = await executeCommand(`cd "${teamDir}" && git remote get-url origin`);
        repositoryUrl = stdout.trim();
      } catch {
        repositoryUrl = '';
      }
    }
    if (!repositoryUrl) {
      return {
        success: false,
        message: `Repository URL not found for team '${sanitizedTeamName}'.`,
      };
    }

    const resolved = await resolveGitBranch(repositoryUrl, newBranch);

    await updateWebhookBranch(HOOKS_JSON_PATH, sanitizedTeamName, resolved.branch);

    config.branch = resolved.branch;
    if (!config.repositoryUrl) {
      config.repositoryUrl = repositoryUrl;
    }
    await writeJSON(configPath, config);

    try {
      await executeCommand(`cd "${teamDir}" && git fetch origin "${resolved.branch}"`);
      await executeCommand(
        `cd "${teamDir}" && git checkout -B "${resolved.branch}" "origin/${resolved.branch}"`
      );
    } catch (error) {
      console.warn('Failed to checkout branch locally:', error);
    }

    const serviceName = await detectComposeServiceName(teamDir).catch(() => 'app');
    const containerPort = await detectComposeTargetPort(teamDir).catch(() => 0);
    const logFile = path.join(APPS_DIR, 'webhook', 'logs', `deploy-${sanitizedTeamName}.log`);
    const deployScript = generateDeployScript(sanitizedTeamName, resolved.branch, teamDir, logFile, serviceName, containerPort);
    const scriptPath = path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`);
    await writeFile(scriptPath, deployScript);
    await chmod(scriptPath, 0o755);

    await restartWebhookServer();

    return {
      success: true,
      message: `Branch updated to '${resolved.branch}' for team '${sanitizedTeamName}'. Webhook restarted.`,
    };
  } catch (error) {
    console.error('Failed to update team branch:', error);
    const message = error instanceof Error ? error.message : 'Failed to update branch';
    return { success: false, message };
  }
}
export async function updateTeamHostPort(teamName: string, hostPort: number): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    const configPath = path.join(teamDir, 'team.config.json');

    const config = await readJSON<TeamConfigFile>(configPath);
    const currentPort = config.hostPort;
    const assignedPort = await findAvailableHostPort(hostPort, APPS_DIR, currentPort);

    config.hostPort = assignedPort;
    await writeJSON(configPath, config);

    const serviceName = await detectComposeServiceName(teamDir).catch(() => 'app');
    const containerPort = await detectComposeTargetPort(teamDir).catch(() => assignedPort);
    const overrideContent = generateDockerComposeOverride(assignedPort, serviceName, containerPort);
    const overridePath = path.join(teamDir, 'docker-compose.override.yml');
    await writeFile(overridePath, overrideContent);

    const caddyConfig = generateCaddyConfig(sanitizedTeamName, config.domain, assignedPort);
    const caddyPath = path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`);
    await writeFile(caddyPath, caddyConfig);

    await restartContainers(teamDir);
    await reloadCaddy();

    const portMessage = assignedPort !== hostPort
      ? `Requested port ${hostPort} was unavailable and assigned ${assignedPort}`
      : `Host port updated to ${assignedPort}`;

    return { success: true, message: portMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update host port';
    return { success: false, message };
  }
}

export async function getTeamHostPort(teamName: string): Promise<{ success: boolean; hostPort?: number; domain?: string; message?: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    const config = await ensureTeamConfig(sanitizedTeamName, teamDir);

    const actualHostPort = await getActualHostPort(teamDir, sanitizedTeamName);
    if (actualHostPort && actualHostPort !== config.hostPort) {
      config.hostPort = actualHostPort;
      const configPath = path.join(teamDir, 'team.config.json');
      await writeJSON(configPath, config);

      const serviceName = await detectComposeServiceName(teamDir).catch(() => 'app');
      const containerPort = await detectComposeTargetPort(teamDir).catch(() => actualHostPort);
      const overrideContent = generateDockerComposeOverride(actualHostPort, serviceName, containerPort);
      const overridePath = path.join(teamDir, 'docker-compose.override.yml');
      await writeFile(overridePath, overrideContent);

      const domain = config.domain || (await inferDomainFromCaddy(sanitizedTeamName));
      if (domain) {
        const caddyConfig = generateCaddyConfig(sanitizedTeamName, domain, actualHostPort);
        const caddyPath = path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`);
        await writeFile(caddyPath, caddyConfig);
        await reloadCaddy();
      }
    }

    const hostPort = actualHostPort ?? config.hostPort;

    return { success: true, hostPort, domain: config.domain };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read team host port';
    return { success: false, message };
  }
}
