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
  startContainers,
  stopContainers,
  removeContainers,
  rebuildContainers,
  getComposeState,
  deployTeam,
  updateWebhookBranch,
  findAvailableHostPort,
  executeCommand,
  resolveGitBranch,
} from '@/lib/server';
import { adjustPathForTesting } from '@/lib/env';
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
import { promises as fs } from 'fs';
import { fileExists } from '@/lib/server';
import {
  EnvEntry,
  entriesToRecord,
  parseEnvContent,
  recordToEnvEntries,
  serializeEnvEntries,
  validateEnvEntries,
} from '@/lib/env-file';
import { createOrResetTeamUser } from '@/lib/auth';

const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
const CADDY_CONF_DIR = process.env.CADDY_CONF_DIR || path.join(APPS_DIR, 'caddy', 'conf.d');
const CADDY_LOGS_DIR = process.env.CADDY_LOGS_DIR || path.join(APPS_DIR, 'caddy', 'logs');
const WEBHOOK_SCRIPTS_DIR = process.env.WEBHOOK_SCRIPTS_DIR || path.join(APPS_DIR, 'webhook', 'scripts');
const WEBHOOK_LOGS_DIR = process.env.WEBHOOK_LOGS_DIR || path.join(APPS_DIR, 'webhook', 'logs');
const HOOKS_JSON_PATH = process.env.WEBHOOK_HOOKS_FILE || path.join(APPS_DIR, 'webhook', 'hooks.json');
const TEAM_CREATE_STATUS_DIR = process.env.TEAM_CREATE_STATUS_DIR || path.join(APPS_DIR, '.team-create-status');

type TeamCreateStepStatus = 'pending' | 'in-progress' | 'done' | 'error';

interface TeamCreateStep {
  id: string;
  label: string;
  status: TeamCreateStepStatus;
}

interface TeamCreateStatusFile {
  teamName: string;
  status: 'pending' | 'success' | 'error';
  steps: TeamCreateStep[];
  currentStep?: string;
  message?: string;
  startedAt: string;
  updatedAt: string;
}

async function writeTeamCreateStatus(teamName: string, status: TeamCreateStatusFile): Promise<void> {
  await createDirectory(TEAM_CREATE_STATUS_DIR);
  const filePath = path.join(TEAM_CREATE_STATUS_DIR, `${teamName}.json`);
  await writeJSON(filePath, status);
}

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

async function removePath(targetPath: string): Promise<void> {
  const adjustedPath = adjustPathForTesting(targetPath);
  try {
    await fs.rm(adjustedPath, { recursive: true, force: true });
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function getTeams(): Promise<TeamInfo[]> {
  try {
    const dirs = await listDirectories(APPS_DIR);
    // Filter out system directories
    const teamDirs = dirs.filter(
      dir => !dir.startsWith('.') && !['caddy', 'webhook', 'users.json', 'team-create-status', '.team-create-status'].includes(dir)
    );
    return teamDirs.map(name => ({ name }));
  } catch (error) {
    console.error('Failed to get teams:', error);
    return [];
  }
}

export async function createTeam(input: CreateTeamInput): Promise<{ success: boolean; message: string; hostPort?: number; webhookSecret?: string; teamPassword?: string }> {
  let statusFile: TeamCreateStatusFile | null = null;
  try {
    const { teamName, repositoryUrl, domain, hostPort, envVariables, envEntries, branch } = input;

    // Validate inputs
    if (!teamName || !repositoryUrl || !domain) {
      return { success: false, message: 'Missing required fields' };
    }

    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    const now = new Date().toISOString();
    statusFile = {
      teamName: sanitizedTeamName,
      status: 'pending',
      steps: [
        { id: 'create_directory', label: 'Creazione directory', status: 'pending' },
        { id: 'git_clone', label: 'Clonazione repository', status: 'pending' },
        { id: 'env_file', label: 'Creazione file .env', status: 'pending' },
        { id: 'config_files', label: 'Configurazione servizi', status: 'pending' },
        { id: 'webhook_secret', label: 'Generazione webhook secret', status: 'pending' },
        { id: 'hooks_entry', label: 'Aggiornamento webhook hooks', status: 'pending' },
        { id: 'deploy_script', label: 'Creazione script deploy', status: 'pending' },
        { id: 'containers', label: 'Avvio container', status: 'pending' },
        { id: 'caddy_reload', label: 'Reload Caddy', status: 'pending' },
        { id: 'webhook_restart', label: 'Restart webhook server', status: 'pending' },
        { id: 'team_credentials', label: 'Creazione credenziali team', status: 'pending' },
      ],
      currentStep: 'create_directory',
      startedAt: now,
      updatedAt: now,
    };
    await writeTeamCreateStatus(sanitizedTeamName, statusFile);

    const updateStep = async (stepId: string, status: TeamCreateStepStatus) => {
      if (!statusFile) return;
      statusFile = {
        ...statusFile,
        currentStep: stepId,
        steps: statusFile.steps.map((step) =>
          step.id === stepId ? { ...step, status } : step
        ),
        updatedAt: new Date().toISOString(),
      };
      await writeTeamCreateStatus(sanitizedTeamName, statusFile);
    };

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
  await updateStep('create_directory', 'in-progress');
  await createDirectory(teamDir);
  await updateStep('create_directory', 'done');

    // Step 2: Git clone
    console.log('Step 2: Cloning repository...');
    await updateStep('git_clone', 'in-progress');
    const { branch: resolvedBranch } = await gitClone(repositoryUrl, teamDir, { branch });
    await updateStep('git_clone', 'done');

    // Step 3: Create .env file
  console.log('Step 3: Creating .env file...');
  await updateStep('env_file', 'in-progress');
  const envContent = serializeEnvEntries(envValidation.entries);
  const envPath = path.join(teamDir, '.env');
  await writeFile(envPath, envContent);
  await updateStep('env_file', 'done');

    // Step 4: Save team configuration, create docker-compose override, and generate Caddy config
    console.log('Step 4: Creating team config, docker-compose override, and Caddy config...');
    await updateStep('config_files', 'in-progress');
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

  await updateStep('config_files', 'done');

    console.log("TEAM CONFIGURATION SAVED IN:", caddyPath, caddyConfig);

    // Step 5: Generate webhook secret
  console.log('Step 5: Generating webhook secret...');
  await updateStep('webhook_secret', 'in-progress');
  const webhookSecret = await generateWebhookSecret();
  await updateStep('webhook_secret', 'done');

    // Step 6: Add entry to hooks.json
    console.log('Step 6: Adding webhook hook...');
    await updateStep('hooks_entry', 'in-progress');
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
    await updateStep('hooks_entry', 'done');

    // Step 7: Create deploy script
    console.log('Step 7: Creating deploy script...');
    await updateStep('deploy_script', 'in-progress');
    await createDirectory(WEBHOOK_SCRIPTS_DIR);
    const logFile = path.join(APPS_DIR, 'webhook', 'logs', `deploy-${sanitizedTeamName}.log`);
    const deployScript = generateDeployScript(sanitizedTeamName, resolvedBranch, teamDir, logFile, serviceName, containerPort);
    const scriptPath = path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`);
    await writeFile(scriptPath, deployScript);
    await chmod(scriptPath, 0o755);
    await updateStep('deploy_script', 'done');

  // Step 8: Start team containers
    console.log('Step 8: Starting team containers...');
    await updateStep('containers', 'in-progress');
    await restartContainers(teamDir);
    await updateStep('containers', 'done');

  // Step 9: Reload Caddy
    console.log('Step 9: Reloading Caddy...');
    await updateStep('caddy_reload', 'in-progress');
    await reloadCaddy();
    await updateStep('caddy_reload', 'done');

    // Step 10: Restart webhook server
  console.log('Step 10: Restarting webhook server...');
  await updateStep('webhook_restart', 'in-progress');
  await restartWebhookServer();
  await updateStep('webhook_restart', 'done');

    // Step 11: Create team credentials
    await updateStep('team_credentials', 'in-progress');
    const credentials = await createOrResetTeamUser(sanitizedTeamName);
    await updateStep('team_credentials', 'done');

    if (statusFile) {
      statusFile = {
        ...statusFile,
        status: 'success',
        currentStep: undefined,
        updatedAt: new Date().toISOString(),
        steps: statusFile.steps.map((step) => ({ ...step, status: 'done' })),
      };
      await writeTeamCreateStatus(sanitizedTeamName, statusFile);
    }

    return {
      success: true,
      message: `Team '${sanitizedTeamName}' created successfully.${portMessage} Webhook secret: ${webhookSecret}`,
      hostPort: assignedPort,
      webhookSecret,
      teamPassword: credentials.password,
    };
  } catch (error) {
    console.error('Team creation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    const sanitizedTeamName = input?.teamName
      ? input.teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : '';
    if (sanitizedTeamName) {
      const fallback: TeamCreateStatusFile = statusFile
        ? (() => {
            const currentStep = statusFile.currentStep;
            return {
              ...statusFile,
              status: 'error',
              message,
              updatedAt: new Date().toISOString(),
              steps: statusFile.steps.map((step) =>
                step.id === currentStep
                  ? { ...step, status: 'error' }
                  : step
              ),
            };
          })()
        : {
            teamName: sanitizedTeamName,
            status: 'error',
            steps: [],
            message,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
      try {
        await writeTeamCreateStatus(sanitizedTeamName, fallback);
      } catch {
        // ignore status write errors
      }
    }
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

async function findRepositoryUrl(teamDir: string): Promise<string> {
  try {
    const { stdout } = await executeCommand(`cd "${teamDir}" && git remote get-url origin`);
    const repo = stdout.trim();
    if (repo) return repo;
  } catch {
    // ignore
  }

  try {
    const configPath = path.join(teamDir, '.git', 'config');
    if (!(await fileExists(configPath))) return '';
    const configContent = await readFile(configPath);
    const lines = configContent.split('\n');
    let inOrigin = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[')) {
        inOrigin = trimmed.toLowerCase() === '[remote "origin"]';
        continue;
      }
      if (inOrigin && trimmed.toLowerCase().startsWith('url =')) {
        const value = trimmed.split('=')[1]?.trim();
        if (value) return value;
      }
    }
  } catch {
    // ignore
  }

  return '';
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
    const teamConfigPath = path.join(teamDir, 'team.config.json');
    const teamConfig = await ensureTeamConfig(sanitizedTeamName, teamDir);

    const envPath = path.join(teamDir, '.env');
    let envContent = '';
    if (await fileExists(envPath)) {
      envContent = await readFile(envPath);
    }

    const parsed = parseEnvContent(envContent);
    const env = entriesToRecord(parsed.entries);

    let repositoryUrl = teamConfig.repositoryUrl || '';
    if (!repositoryUrl) {
      repositoryUrl = await findRepositoryUrl(teamDir);
      if (repositoryUrl) {
        teamConfig.repositoryUrl = repositoryUrl;
        await writeJSON(teamConfigPath, teamConfig);
      }
    }

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH);
    const teamHook = hooks.find(h => h.id === sanitizedTeamName);
    const branch = teamHook?.['match-branch'] || teamConfig.branch || 'main';

    return {
      name: sanitizedTeamName,
      domain: teamConfig.domain,
  repository: repositoryUrl,
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

export async function stopTeamContainer(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await stopContainers(teamDir);
    return {
      success: true,
      message: `Container fermato per team '${sanitizedTeamName}'.`,
    };
  } catch (error) {
    console.error('Failed to stop container:', error);
    const message = error instanceof Error ? error.message : 'Failed to stop container';
    return { success: false, message };
  }
}

export async function startTeamContainer(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await startContainers(teamDir);
    return {
      success: true,
      message: `Container avviato per team '${sanitizedTeamName}'.`,
    };
  } catch (error) {
    console.error('Failed to start container:', error);
    const message = error instanceof Error ? error.message : 'Failed to start container';
    return { success: false, message };
  }
}

export async function removeTeamContainer(
  teamName: string,
  removeVolumes: boolean
): Promise<{ success: boolean; message: string; requiresRebuild?: boolean; requiresRecreate?: boolean }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await removeContainers(teamDir, removeVolumes);

    if (!removeVolumes) {
      return {
        success: true,
        message: `Container rimosso per team '${sanitizedTeamName}'.`,
      };
    }

    const state = await getComposeState(teamDir);
    return {
      success: true,
      message: `Container e volumi rimossi per team '${sanitizedTeamName}'.`,
      requiresRebuild: !state.hasImages,
      requiresRecreate: !state.hasContainers,
    };
  } catch (error) {
    console.error('Failed to remove container:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove container';
    return { success: false, message };
  }
}

export async function rebuildTeamContainer(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await rebuildContainers(teamDir);
    return {
      success: true,
      message: `Container ricreato per team '${sanitizedTeamName}'.`,
    };
  } catch (error) {
    console.error('Failed to rebuild container:', error);
    const message = error instanceof Error ? error.message : 'Failed to rebuild container';
    return { success: false, message };
  }
}

export async function recreateTeamContainer(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await startContainers(teamDir);
    return {
      success: true,
      message: `Container ricreato per team '${sanitizedTeamName}'.`,
    };
  } catch (error) {
    console.error('Failed to recreate container:', error);
    const message = error instanceof Error ? error.message : 'Failed to recreate container';
    return { success: false, message };
  }
}

export async function restartTeamContainer(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);
    await restartContainers(teamDir);
    return {
      success: true,
      message: `Container riavviato per team '${sanitizedTeamName}'.`,
    };
  } catch (error) {
    console.error('Failed to restart container:', error);
    const message = error instanceof Error ? error.message : 'Failed to restart container';
    return { success: false, message };
  }
}

export async function manualDeployTeam(
  teamName: string,
  commitSha?: string,
  branchOverride?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    const teamConfig = await getTeamConfig(sanitizedTeamName);
    const branch = branchOverride?.trim() || teamConfig?.branch || 'main';
    const serviceName = await detectComposeServiceName(teamDir).catch(() => 'app');
    const containerPort = await detectComposeTargetPort(teamDir).catch(() => 0);
    const logFile = path.join(APPS_DIR, 'webhook', 'logs', `deploy-${sanitizedTeamName}.log`);
    await createDirectory(WEBHOOK_SCRIPTS_DIR);
    await createDirectory(path.dirname(logFile));
    const deployScript = generateDeployScript(
      sanitizedTeamName,
      branch,
      teamDir,
      logFile,
      serviceName,
      containerPort,
      commitSha
    );
    const scriptPath = path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`);
    await writeFile(scriptPath, deployScript);
    await chmod(scriptPath, 0o755);

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
      repositoryUrl = await findRepositoryUrl(teamDir);
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

export async function deleteTeam(
  teamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, sanitizedTeamName);

    if (!(await fileExists(teamDir))) {
      return { success: false, message: `Team '${sanitizedTeamName}' not found.` };
    }

    const composeCandidates = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'docker-compose.runtime.yml',
    ];
    let composeFile: string | null = null;
    for (const candidate of composeCandidates) {
      const fullPath = path.join(teamDir, candidate);
      if (await fileExists(fullPath)) {
        composeFile = fullPath;
        break;
      }
    }

    if (composeFile) {
      const overridePath = path.join(teamDir, 'docker-compose.override.yml');
      const composeFlags = [
        `-f "${composeFile}"`,
        (await fileExists(overridePath)) ? `-f "${overridePath}"` : null,
      ].filter(Boolean).join(' ');
      await executeCommand(
        `cd "${teamDir}" && docker compose ${composeFlags} down --remove-orphans`
      );
    }

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH, []);
    const updatedHooks = hooks.filter((hook) => hook.id !== sanitizedTeamName);
    if (updatedHooks.length !== hooks.length) {
      await writeJSON(HOOKS_JSON_PATH, updatedHooks);
    }

    await removePath(path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`));
    await removePath(path.join(WEBHOOK_LOGS_DIR, `deploy-${sanitizedTeamName}.log`));
    await removePath(path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`));
    await removePath(path.join(CADDY_LOGS_DIR, `${sanitizedTeamName}.log`));
    await removePath(teamDir);

    await restartWebhookServer();
    await reloadCaddy();

    return {
      success: true,
      message: `Team '${sanitizedTeamName}' removed successfully.`,
    };
  } catch (error) {
    console.error('Failed to delete team:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete team';
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
