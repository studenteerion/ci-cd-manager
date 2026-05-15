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

export async function detectComposeServiceName(teamDir: string): Promise<string> {
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
  for (const file of composeFiles) {
    const composePath = path.join(teamDir, file);
    try {
      const composeContent = await readFile(composePath);
      const compose = YAML.load(composeContent) as any;
      if (compose && compose.services && typeof compose.services === 'object') {
        const firstService = Object.keys(compose.services)[0];
        if (firstService) {
          return firstService;
        }
      }
    } catch {
      continue;
    }
  }
  return 'app';
}

export async function detectComposeTargetPort(teamDir: string): Promise<number> {
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
  for (const file of composeFiles) {
    const composePath = path.join(teamDir, file);
    try {
      const composeContent = await readFile(composePath);
      const compose = YAML.load(composeContent) as any;
      if (compose && compose.services && typeof compose.services === 'object') {
        for (const service of Object.values(compose.services)) {
          const ports = (service as any).ports || [];
          for (const port of ports) {
            if (typeof port === 'string') {
              const parts = port.split(':');
              if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
                return parseInt(parts[1], 10);
              }
            } else if (typeof port === 'object' && port !== null && port.target) {
              return parseInt(port.target, 10);
            }
          }
        }
      }
    } catch {
      continue;
    }
  }
  throw new Error('No target port found in docker-compose');
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
        output file /opt/apps/caddy/logs/${teamName}.log
        format json
    }
}
`;
  return config;
}

export function generateDockerComposeOverride(hostPort: number, serviceName: string, containerPort: number = hostPort): string {
  const config = `# Override file - do NOT edit, auto-generated
# This sets the host port from team.config.json
services:
  ${serviceName}:
    ports:
      - "${hostPort}:${containerPort}"
`;
  return config;
}

export function generateDeployScript(
  teamName: string,
  branchName: string = 'main',
  teamDir: string = `/opt/apps/team-${teamName}`,
  logFile: string = `/var/log/deploy-${teamName}.log`,
  serviceName: string = 'app',
  containerPort: number = 0
): string {
  // Build script with proper shell variable syntax
  const script = [
  '#!/bin/sh',
  'set -eu',
    '',
    `APP_DIR="${teamDir}"`,
    `LOG_FILE="${logFile}"`,
    'CONFIG_FILE="$APP_DIR/team.config.json"',
    'OVERRIDE_FILE="$APP_DIR/docker-compose.override.yml"',
    `SERVICE_NAME="${serviceName}"`,
    `CONTAINER_PORT=${containerPort}`,
    '',
    'echo "[$(date -Iseconds)] === Deploy avviato ===" >> "$LOG_FILE"',
    '',
    '# Extract host port from team.config.json',
    'HOST_PORT=$(grep -o \'"hostPort":[[:space:]]*[0-9]*\' "$CONFIG_FILE" | grep -o \'[0-9]*\' || true)',
    'if [ -z "$HOST_PORT" ]; then HOST_PORT=0; fi',
    'if [ "$CONTAINER_PORT" -le 0 ]; then',
    '  echo "[$(date -Iseconds)] Container port not set; using 80 as default" >> "$LOG_FILE"',
    '  CONTAINER_PORT=80',
    'fi',
    '',
    '# Helper to check if a port is free',
    'is_port_free() {',
    '  local p=$1',
    '  if command -v ss >/dev/null 2>&1; then',
    '    ss -tln 2>/dev/null | awk \'NR>1 {print $4}\' | grep -q -E "[:.]$p$" && return 1 || return 0',
    '  elif command -v netstat >/dev/null 2>&1; then',
    '    netstat -tln 2>/dev/null | awk \'NR>2 {print $4}\' | grep -q -E "[:.]$p$" && return 1 || return 0',
    '  else',
    '    # fallback: try /dev/tcp (may not be available on all shells)',
    '    (echo > /dev/tcp/127.0.0.1/$p) >/dev/null 2>&1 && return 1 || return 0',
    '  fi',
    '}',
    '',
    'SELECTED_PORT=""',
    'if [ "$HOST_PORT" -gt 0 ] && is_port_free "$HOST_PORT"; then',
    '  SELECTED_PORT="$HOST_PORT"',
    'else',
    '  START_PORT=$((HOST_PORT > 0 ? HOST_PORT + 1 : 8000))',
    '  for p in $(seq "$START_PORT" 65535); do',
    '    if is_port_free "$p"; then',
    '      SELECTED_PORT="$p"',
    '      break',
    '    fi',
    '  done',
    '  if [ -z "$SELECTED_PORT" ]; then',
    '    for p in $(seq 1000 $((START_PORT - 1))); do',
    '      if is_port_free "$p"; then',
    '        SELECTED_PORT="$p"',
    '        break',
    '      fi',
    '    done',
    '  fi',
    'fi',
    '',
    'if [ -z "$SELECTED_PORT" ]; then',
    '  echo "[$(date -Iseconds)] No available host port found" >> "$LOG_FILE"',
    'else',
    '  if [ "$SELECTED_PORT" != "$HOST_PORT" ]; then',
    '    echo "[$(date -Iseconds)] Requested port $HOST_PORT unavailable; assigning $SELECTED_PORT" >> "$LOG_FILE"',
    '    # Update team.config.json with the new hostPort (best-effort)',
    '    if command -v node >/dev/null 2>&1; then',
    '      node -e "const fs=require(\'fs\');const p=process.argv[1];const port=Number(process.argv[2]);try{const j=JSON.parse(fs.readFileSync(p,\'utf8\')||\'{}\');j.hostPort=port;fs.writeFileSync(p,JSON.stringify(j,null,2));}catch(e){process.exit(0);} " "$CONFIG_FILE" "$SELECTED_PORT" || true',
    '    else',
    '      # Fallback: sed in-place replacement (may not be perfect)',
    '      sed -i -E \'s/("hostPort":[[:space:]]*)[0-9]+/\\1$SELECTED_PORT/g\' "$CONFIG_FILE" || true',
    '    fi',
    '  fi',
    '',
    '  # Generate docker-compose.override.yml with selected host port',
    '  cat > "$OVERRIDE_FILE" <<YAML',
    '# Override file - do NOT edit, auto-generated',
    '# This sets the host port from team.config.json (or reassigned if original was busy)',
    'services:',
    `  ${serviceName}:`,
    '    ports:',
    '      - "$SELECTED_PORT:' + `${containerPort}` + '"',
    'YAML',
    '',
    'fi',
    '',
    'cd "$APP_DIR"',
    `git pull origin ${branchName} >> "$LOG_FILE" 2>&1`,
    '',
    'docker compose pull >> "$LOG_FILE" 2>&1 || true',
    'docker compose up --build -d --force-recreate >> "$LOG_FILE" 2>&1',
    '',
    'docker image prune -f >> "$LOG_FILE" 2>&1',
    '',
    'echo "[$(date -Iseconds)] === Deploy completato ===" >> "$LOG_FILE"',
  ].join('\n');
  
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
