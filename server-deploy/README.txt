Questi file sono template locali da copiare sul server Ubuntu.

Mappatura suggerita:
- server-deploy/caddy/Caddyfile -> /opt/apps/caddy/Caddyfile
- server-deploy/caddy/conf.d/*.conf -> /opt/apps/caddy/conf.d/
- server-deploy/webhook/docker-compose.yml -> /opt/apps/webhook/docker-compose.yml
- server-deploy/webhook/hooks.json -> /opt/apps/webhook/hooks.json
- server-deploy/webhook/.env.example -> /opt/apps/webhook/.env (modificando i valori)
- server-deploy/webhook/scripts/deploy-anh-here.sh -> /opt/apps/webhook/scripts/deploy-anh-here.sh
