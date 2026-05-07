import { readFile } from '../server';
import * as path from 'path';

// Path to the templates in server-deploy
const TEMPLATES_BASE = path.join(process.cwd(), '..', 'server-deploy');

export async function loadCaddyTemplate(): Promise<string> {
  const templatePath = path.join(TEMPLATES_BASE, 'caddy', 'conf.d', 'anh-here.conf');
  return readFile(templatePath);
}

export async function loadDeployScriptTemplate(): Promise<string> {
  const templatePath = path.join(TEMPLATES_BASE, 'webhook', 'scripts', 'deploy-anh-here.sh');
  return readFile(templatePath);
}

export async function loadHooksJsonTemplate(): Promise<any> {
  const templatePath = path.join(TEMPLATES_BASE, 'webhook', 'hooks.json');
  const content = await readFile(templatePath);
  return JSON.parse(content);
}

export function generateCaddyConfig(teamName: string, domain: string): string {
  const containerName = `${teamName}-container`;
  const config = `${domain} {
    reverse_proxy ${containerName}:8000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    log {
        output file /var/log/caddy/${teamName}.log
        format json
    }
}
`;
  return config;
}

export function generateDeployScript(
  teamName: string,
  branchName: string = 'main'
): string {
  const teamDir = `/opt/apps/${teamName}`;
  const logFile = `/var/log/deploy-${teamName}.log`;
  
  const script = `#!/bin/bash
set -euo pipefail

APP_DIR="${teamDir}"
LOG_FILE="${logFile}"

echo "[$(date -Iseconds)] === Deploy avviato ===" >> "$LOG_FILE"

cd "$APP_DIR"
git pull origin ${branchName} >> "$LOG_FILE" 2>&1

docker compose pull >> "$LOG_FILE" 2>&1 || true
docker compose up --build -d --force-recreate >> "$LOG_FILE" 2>&1

docker image prune -f >> "$LOG_FILE" 2>&1

echo "[$(date -Iseconds)] === Deploy completato ===" >> "$LOG_FILE"
`;
  return script;
}

export function generateWebhookHookEntry(
  teamName: string,
  secret: string,
  branchName: string = 'main'
): any {
  return {
    id: teamName,
    'execute-command': `/scripts/deploy-${teamName}.sh`,
    'command-working-directory': `/opt/apps/${teamName}`,
    'response-message': `Deploy ${teamName} avviato`,
    'trigger-rule': {
      and: [
        {
          match: {
            type: 'payload-hmac-sha256',
            secret: secret,
            parameter: {
              source: 'header',
              name: 'X-Hub-Signature-256',
            },
          },
        },
        {
          match: {
            type: 'value',
            value: `refs/heads/${branchName}`,
            parameter: {
              source: 'payload',
              name: 'ref',
            },
          },
        },
      ],
    },
  };
}
