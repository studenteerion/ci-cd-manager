'use server';

import {
  executeCommand,
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
} from '@/lib/server';
import {
  generateCaddyConfig,
  generateDeployScript,
  generateWebhookHookEntry,
  extractPortFromDockerCompose,
  generateDockerComposeOverride,
} from '@/lib/templates';
import { getTeamsDirectory, getLogsDirectory, isTesting } from '@/lib/env';
import * as path from 'path';

const APPS_DIR = process.env.APPS_BASE_DIR || getTeamsDirectory();
const CADDY_CONF_DIR = process.env.CADDY_CONF_DIR || path.join(APPS_DIR, 'caddy', 'conf.d');
const WEBHOOK_SCRIPTS_DIR = process.env.WEBHOOK_SCRIPTS_DIR || path.join(APPS_DIR, 'webhook', 'scripts');
const HOOKS_JSON_PATH = process.env.WEBHOOK_HOOKS_FILE || path.join(APPS_DIR, 'webhook', 'hooks.json');

export interface CreateTeamInput {
  teamName: string;
  repositoryUrl: string;
  domain: string;
  hostPort: number;
  envVariables: Record<string, string>;
  branch?: string;
}

export interface TeamConfigFile {
  hostPort: number;
  domain: string;
  createdAt: string;
}

export interface TeamInfo {
  name: string;
}

export async function getTeams(): Promise<TeamInfo[]> {
  try {
    const dirs = await listDirectories(APPS_DIR);
    // Filter out system directories
    const teamDirs = dirs.filter(
      dir => !['caddy', 'webhook', 'users.json'].includes(dir) && dir.startsWith('team-')
    );
    return teamDirs.map(name => ({ name: name.replace('team-', '') }));
  } catch (error) {
    console.error('Failed to get teams:', error);
    return [];
  }
}

export async function createTeam(input: CreateTeamInput): Promise<{ success: boolean; message: string }> {
  try {
    const { teamName, repositoryUrl, domain, hostPort, envVariables, branch = 'main' } = input;

    // Validate inputs
    if (!teamName || !repositoryUrl || !domain || !hostPort) {
      return { success: false, message: 'Missing required fields' };
    }

    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);

    console.log(`Creating team: ${sanitizedTeamName} in ${teamDir}`);

    // Step 1: Create team directory
    console.log('Step 1: Creating directory...');
    await createDirectory(teamDir);

    // Step 2: Git clone
    console.log('Step 2: Cloning repository...');
    await gitClone(repositoryUrl, teamDir);

    // Step 3: Create .env file
    console.log('Step 3: Creating .env file...');
    const envContent = Object.entries(envVariables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const envPath = path.join(teamDir, '.env');
    await writeFile(envPath, envContent);

    // Step 4: Save team configuration, create docker-compose override, and generate Caddy config
    console.log('Step 4: Creating team config, docker-compose override, and Caddy config...');
    const teamConfig: TeamConfigFile = {
      hostPort,
      domain,
      createdAt: new Date().toISOString(),
    };
    const teamConfigPath = path.join(teamDir, 'team.config.json');
    await writeJSON(teamConfigPath, teamConfig);

    // Create docker-compose.override.yml with the admin-specified port
    const overrideContent = generateDockerComposeOverride(hostPort);
    const overridePath = path.join(teamDir, 'docker-compose.override.yml');
    await writeFile(overridePath, overrideContent);

    const caddyConfig = generateCaddyConfig(sanitizedTeamName, domain, hostPort);
    const caddyPath = path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`);
    await writeFile(caddyPath, caddyConfig);

    // Step 5: Generate webhook secret
    console.log('Step 5: Generating webhook secret...');
    const webhookSecret = await generateWebhookSecret();

    // Step 6: Add entry to hooks.json
    console.log('Step 6: Adding webhook hook...');
    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH);
    const newHook = generateWebhookHookEntry(sanitizedTeamName, webhookSecret, branch);
    hooks.push(newHook);
    await writeJSON(HOOKS_JSON_PATH, hooks);

    // Step 7: Create deploy script
    console.log('Step 7: Creating deploy script...');
    const logsDir = getLogsDirectory();
    const logFile = path.join(logsDir, `deploy-${sanitizedTeamName}.log`);
    const deployScript = generateDeployScript(sanitizedTeamName, branch, teamDir, logFile);
    const scriptPath = path.join(WEBHOOK_SCRIPTS_DIR, `deploy-${sanitizedTeamName}.sh`);
    await writeFile(scriptPath, deployScript);
    await chmod(scriptPath, 0o755);

    // Step 8: Reload Caddy
    console.log('Step 8: Reloading Caddy...');
    await reloadCaddy();

    // Step 9: Restart webhook server
    console.log('Step 9: Restarting webhook server...');
    await restartWebhookServer();

    return {
      success: true,
      message: `Team '${sanitizedTeamName}' created successfully. Webhook secret: ${webhookSecret}`,
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
}

export async function getTeamConfig(teamName: string): Promise<TeamConfig | null> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);

    const envPath = path.join(teamDir, '.env');
    const envContent = await readFile(envPath);
    const env: Record<string, string> = {};
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        env[key.trim()] = value.trim();
      }
    });

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH);
    const teamHook = hooks.find(h => h.id.startsWith(`team-${sanitizedTeamName}-`));
    const branch = teamHook?.['match-branch'] || 'main';

    return {
      name: sanitizedTeamName,
      domain: 'unknown',
      repository: 'unknown',
      branch,
      env,
    };
  } catch (error) {
    console.error('Failed to get team config:', error);
    return null;
  }
}

export async function updateTeamEnv(
  teamName: string,
  envVariables: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);

    const envContent = Object.entries(envVariables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
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
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);

    await deployTeam(teamDir);

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

    await updateWebhookBranch(HOOKS_JSON_PATH, sanitizedTeamName, newBranch);
    await restartWebhookServer();

    return {
      success: true,
      message: `Branch updated to '${newBranch}' for team '${sanitizedTeamName}'. Webhook restarted.`,
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
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);
    const configPath = path.join(teamDir, 'team.config.json');
    
    const config = await readJSON<TeamConfigFile>(configPath);
    config.hostPort = hostPort;
    await writeJSON(configPath, config);
    
    // Update docker-compose.override.yml with new port
    const overrideContent = generateDockerComposeOverride(hostPort);
    const overridePath = path.join(teamDir, 'docker-compose.override.yml');
    await writeFile(overridePath, overrideContent);
    
    // Regenerate Caddy config with new port
    const caddyConfig = generateCaddyConfig(sanitizedTeamName, config.domain, hostPort);
    const caddyPath = path.join(CADDY_CONF_DIR, `${sanitizedTeamName}.conf`);
    await writeFile(caddyPath, caddyConfig);
    
    // Reload Caddy
    await reloadCaddy();
    
    return { success: true, message: `Host port updated to ${hostPort}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update host port';
    return { success: false, message };
  }
}

export async function getTeamHostPort(teamName: string): Promise<{ success: boolean; hostPort?: number; domain?: string; message?: string }> {
  try {
    const sanitizedTeamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const teamDir = path.join(APPS_DIR, `team-${sanitizedTeamName}`);
    const configPath = path.join(teamDir, 'team.config.json');
    
    const config = await readJSON<TeamConfigFile>(configPath);
    return { success: true, hostPort: config.hostPort, domain: config.domain };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read team host port';
    return { success: false, message };
  }
}
