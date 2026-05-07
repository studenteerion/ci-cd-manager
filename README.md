# Multi-Tenant Deployment Dashboard

A Next.js App Router application that provides a unified control panel for onboarding new teams on an Ubuntu server with Caddy reverse proxy and GitHub webhook-based CI/CD automation.

## Features

✅ **Simple Authentication**
- Login via username/password (admin/admin123)
- Session-based authentication with cookies
- Prepared for NextAuth/Google integration

✅ **Team Management**
- Create new teams with custom settings
- View all existing teams
- Automatic directory structure creation

✅ **Automated Configuration**
- Git repository cloning (HTTPS)
- Environment variable management
- Caddy reverse proxy configuration generation
- Webhook secret generation
- GitHub webhook hook setup
- Deployment script creation

✅ **System Operations**
- Reload Caddy reverse proxy
- Restart webhook server
- Real-time system status

## Architecture

```
/app
  /login              # Login page
  /dashboard          # Main dashboard
  /api
    /auth/login       # Login API endpoint
    /teams
      /create         # Team creation API
      route.ts        # Teams list API
    /system
      /reload-caddy   # Caddy reload endpoint
      /restart-webhook # Webhook restart endpoint

/lib
  /auth               # Authentication utilities
  /server             # Server-side utilities (file I/O, system commands)
  /templates          # Template generation and loading

/actions
  teams.ts            # Server actions for team operations

/components
  CreateTeamForm.tsx  # Team creation form UI
  TeamList.tsx        # Teams list UI
```

## Installation & Setup

### Local Development

```bash
cd dashboard
npm install
npm run dev
```

Visit `http://localhost:3000` → redirects to `/dashboard` → redirects to `/login`

### For Ubuntu Server Deployment

```bash
cd dashboard
npm install
npm run build
npm start
```

The application expects to run on the Ubuntu server with access to:
- `/opt/apps/` directory structure
- `systemctl` command for Caddy/Docker operations
- `git` command for repository operations
- `openssl` for webhook secret generation

## Authentication

### Current Implementation
- Simple users.json format: `{ username: string, password: string }[]`
- Hardcoded admin user: `admin/admin123`
- Session stored in httpOnly cookies

### Future: NextAuth Integration
The code is structured to easily integrate NextAuth.js with Google OAuth:
1. Install: `npm install next-auth @auth/nextjs`
2. Create `auth.ts` using NextAuth provider
3. Update API route `/api/auth/[...nextauth]`
4. Replace cookie logic with NextAuth session

## Team Creation Flow

When creating a new team, the application executes these steps in sequence:

1. **Validate Input**: Ensure team name, repository URL, and domain are provided
2. **Create Directory**: `/opt/apps/team-{name}`
3. **Clone Repository**: Git clone from provided HTTPS URL
4. **Create .env File**: Write custom environment variables
5. **Generate Caddy Config**: Create `/opt/apps/caddy/conf.d/{name}.conf`
6. **Generate Webhook Secret**: Use `openssl rand -hex 32`
7. **Update hooks.json**: Add webhook configuration to `/opt/apps/webhook/hooks.json`
8. **Create Deploy Script**: Generate `/opt/apps/webhook/scripts/deploy-{name}.sh`
9. **Reload Caddy**: `systemctl reload caddy`
10. **Restart Webhook**: Restart webhook server container

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password

### Teams
- `GET /api/teams` - List all teams
- `POST /api/teams/create` - Create a new team

### System
- `POST /api/system/reload-caddy` - Reload Caddy configuration
- `POST /api/system/restart-webhook` - Restart webhook server

## Server Actions

### `actions/teams.ts`
- `getTeams()` - Fetch list of teams from `/opt/apps/`
- `createTeam(input)` - Create a new team with all configurations
- `systemReloadCaddy()` - Reload Caddy reverse proxy
- `systemRestartWebhook()` - Restart webhook server container

## Server Utilities

### `lib/server/index.ts`
Core utilities for system integration:
- `executeCommand()` - Run shell commands
- `generateWebhookSecret()` - Generate random webhook secret
- `gitClone()` - Clone a Git repository
- `reloadCaddy()` - Trigger Caddy reload
- `restartWebhookServer()` - Restart webhook container
- `readFile()`, `writeFile()` - File I/O operations
- `readJSON()`, `writeJSON()` - JSON file handling
- `listDirectories()` - List directories

### `lib/templates/index.ts`
Template generation functions:
- `generateCaddyConfig()` - Create Caddy reverse proxy config
- `generateDeployScript()` - Create deployment bash script
- `generateWebhookHookEntry()` - Create webhook hook configuration

## Environment Variables

None required for local development. For production:

```bash
NODE_ENV=production
```

## Middleware Configuration

The `middleware.ts` file protects all routes except:
- `/login`
- `/api/auth/login`

All other requests require a valid session cookie.

## Troubleshooting

### "Command failed" errors
Ensure the application is running on Ubuntu with:
- `git` installed
- `openssl` installed
- `systemctl` available
- Docker/docker-compose installed
- Access to `/opt/apps/` directory

### Build errors
```bash
# Clean build
rm -rf .next node_modules
npm install
npm run build
```

### Dev server issues
```bash
# Check for port conflicts
lsof -i :3000

# Clear Next.js cache
rm -rf .next
npm run dev
```

## Security Notes

⚠️ **This is a demonstration application.**

For production use:
1. **Never store passwords in plaintext** - Use proper password hashing (bcrypt)
2. **Never hardcode credentials** - Use environment variables
3. **Validate all inputs** - Especially git URLs and domain names
4. **Implement HTTPS** - Use proper TLS certificates
5. **Add rate limiting** - Protect against brute force attacks
6. **Implement CSRF protection** - Validate request origins
7. **Use strong secrets** - For webhook signatures
8. **Audit logging** - Log all team creation and system operations
9. **Access control** - Implement role-based permissions
10. **Network isolation** - Run on a protected network segment

## Performance

- Next.js Turbopack for fast builds
- Tailwind CSS for styling
- Server Actions for efficient server communication
- Docker integration for team isolation

## Future Enhancements

- [ ] NextAuth integration with Google OAuth
- [ ] Team member management and permissions
- [ ] Deployment history and logs viewer
- [ ] Git webhook configuration automation
- [ ] SSL certificate management
- [ ] Database integration for persistent state
- [ ] Multi-user support with role-based access
- [ ] Audit logging dashboard
- [ ] Team resource monitoring

## License

MIT
