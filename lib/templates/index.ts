import { readFile } from '../server';
import * as path from 'path';
import * as YAML from 'js-yaml';

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

export async function extractPortFromDockerCompose(teamDir: string): Promise<number> {
  try {
    // Try docker-compose.yml first, then docker-compose.yaml
    let composeContent: string | null = null;
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
    
    for (const file of composeFiles) {
      const composePath = path.join(teamDir, file);
      try {
        composeContent = await readFile(composePath);
        break;
      } catch {
        // Try next file
      }
    }

    if (!composeContent) {
      throw new Error('No docker-compose file found');
    }

    const compose = YAML.load(composeContent) as any;
    
    // Extract port from services
    const services = compose.services || {};
    for (const [serviceName, service] of Object.entries(services)) {
      const ports = (service as any).ports || [];
      for (const port of ports) {
        if (typeof port === 'string') {
          // Format: "8000:8000" or "3000:3000" -> extract first port
          const mapped = port.split(':')[0];
          if (mapped && !isNaN(parseInt(mapped))) {
            return parseInt(mapped);
          }
        } else if (typeof port === 'object' && port !== null) {
          // Format: { published: 8000, target: 8000 }
          if ((port as any).published) {
            return (port as any).published;
          }
        }
      }
    }

    throw new Error('No port mapping found in docker-compose');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract port from docker-compose: ${errorMsg}`);
  }
}

export function generateCaddyConfig(teamName: string, domain: string, port: number): string {
  const config = `${domain} {
    reverse_proxy localhost:${port} {
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

export function generateDockerComposeOverride(hostPort: number): string {
  const config = `# Override file - do NOT edit, auto-generated
# This sets the host port from team.config.json
services:
  app:
    ports:
      - "${hostPort}:${hostPort}"
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
CONFIG_FILE="\${APP_DIR}/team.config.json"
OVERRIDE_FILE="\${APP_DIR}/docker-compose.override.yml"

echo "[$(date -Iseconds)] === Deploy avviato ===" >> "$LOG_FILE"

# Extract host port from team.config.json and create override file
if [ -f "\$CONFIG_FILE" ]; then
  HOST_PORT=$(grep -o '"hostPort":[0-9]*' "\$CONFIG_FILE" | grep -o '[0-9]*')
  if [ ! -z "\$HOST_PORT" ]; then
    echo "[$(date -Iseconds)] Using host port: \$HOST_PORT" >> "$LOG_FILE"
    # Generate docker-compose.override.yml with the admin-specified port
    cat > "\$OVERRIDE_FILE" << 'YAML'
# Override file - do NOT edit, auto-generated
# This sets the host port from team.config.json
services:
  app:
    ports:
      - "\$HOST_PORT:\$HOST_PORT"
YAML
  fi
fi

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
