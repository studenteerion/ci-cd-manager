# Application Flow Documentation

This document explains in detail how the multi-tenant deployment orchestrator works, showing the flow of data, the interaction between files, and the complete lifecycle of key operations.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [Team Creation Flow](#team-creation-flow)
4. [File Interactions & Dependencies](#file-interactions--dependencies)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [API Route Architecture](#api-route-architecture)
7. [Server-Side Utilities Stack](#server-side-utilities-stack)
8. [State Management & File System](#state-management--file-system)
9. [Error Handling Patterns](#error-handling-patterns)

---

## System Architecture Overview

This application manages a multi-tenant deployment infrastructure. Unlike a typical Next.js app, this one directly orchestrates server resources and manages infrastructure through the file system.

**Core Components:**
- **Presentation Layer**: Next.js pages and React components
- **API Layer**: Next.js Route Handlers (`/api/*`)
- **Business Logic Layer**: Server Actions (`'use server'` functions)
- **Infrastructure Layer**: System utilities for file I/O, command execution, git operations
- **State Source**: File system (no database)

**Technology Stack:**
- Frontend: React + TypeScript
- Backend: Next.js Server Actions + Route Handlers
- Infrastructure Management: Caddy (reverse proxy), Docker Compose, Git, Webhooks
- Security: httpOnly cookies, middleware-based access control

---

## Authentication Flow

### Flow Diagram
```
User (Browser)
    ↓
/login page (LoginPage component)
    ↓
POST /api/auth/login (login route handler)
    ↓
Verify credentials (lib/auth/index.ts)
    ↓
Set httpOnly cookie
    ↓
Redirect to /dashboard
    ↓
middleware.ts checks cookie
    ↓
Dashboard (protected)
```

### Detailed Steps

#### 1. **Login Page** (`app/login/page.tsx`)
- User visits `/login`
- Server-side page renders login form
- HTML form with email and password inputs

#### 2. **Login Request** (`app/api/auth/login/route.ts`)
```typescript
// POST /api/auth/login
// Receives: { email: string, password: string }
// Flow:
1. Parse request body
2. Call verifyCredentials(email, password) from lib/auth
3. If valid: set httpOnly cookie with session token
4. Return JSON: { success: true, redirectUrl: '/dashboard' }
// If invalid: return { success: false, message: 'Invalid credentials' }
```

#### 3. **Credentials Verification** (`lib/auth/index.ts`)
```typescript
// Current implementation: DEMO ONLY
// Hardcoded: username='admin', password='admin123'
// Plain text comparison (NOT production-ready)
// 
// Returns: { valid: boolean, user?: { id, name } }
//
// TODO: Replace with NextAuth + OAuth in production
```

#### 4. **Cookie Storage**
- httpOnly cookie prevents JavaScript access (XSS protection)
- Cookie name: `session`
- Cookie value: Simple token (in demo: just 'authenticated')
- Browser sends this cookie with every subsequent request

#### 5. **Middleware Protection** (`middleware.ts`)
```typescript
// Runs on EVERY request
// Flow:
1. Check if request path is public (/login, /api/auth/login)
2. If public: allow request
3. If protected: check for session cookie
4. If no session: redirect to /login
5. If session exists: allow request
```

#### 6. **Dashboard Access** (`app/dashboard/page.tsx`)
- User is now authenticated
- Page displays:
  - "Create Team" form
  - List of existing teams
  - System control buttons (reload Caddy, restart webhook server)

---

## Team Creation Flow

### 9-Step Orchestration Flow

```
User (Browser)
    ↓
CreateTeamForm.tsx
    ↓
POST /api/teams/create
    ↓
app/api/teams/create/route.ts
    ↓
createTeam() server action
    ↓
[9-Step Orchestration] ← see below
    ↓
Team created
    ↓
Return webhook secret
    ↓
UI displays success + secret
```

### The 9-Step Orchestration (`actions/teams.ts`)

This is the **core business logic** of the application. Each step builds infrastructure for a new tenant.

#### Step 1: Validate Inputs
```typescript
function validateInputs(teamName, repositoryUrl, domain):
  - Check teamName: alphanumeric, 3-30 chars, no spaces
  - Check repositoryUrl: valid Git URL format
  - Check domain: valid domain format
  - Return: { valid: boolean, errors?: string[] }
```

#### Step 2: Create Team Directory
```typescript
createDirectory('/opt/apps/team-' + teamName)
// File system path: /opt/apps/team-{teamName}/
// This becomes the root directory for all team resources
```

#### Step 3: Clone Git Repository
```typescript
gitClone(repositoryUrl, '/opt/apps/team-' + teamName)
// Git command: git clone <url> /opt/apps/team-{teamName}
// Result: Application code available in team directory
// This allows the team's app to be deployed via webhooks
```

#### Step 4: Write Environment Variables
```typescript
writeFile('/opt/apps/team-' + teamName + '/.env', envVariables)
// Creates .env file with user-provided variables
// Example variables might include:
//   - API keys
//   - Database URLs
//   - Feature flags
//   - Authentication secrets
// Docker Compose reads this file when starting containers
```

#### Step 5: Generate Caddy Configuration
```typescript
caddyConfig = generateCaddyConfig(domain, teamName)
// Result example:
//   example.com {
//     reverse_proxy localhost:3000
//   }
//
// Written to: /opt/apps/caddy/conf.d/{teamName}.conf
// Caddy automatically reloads and proxies this domain to team's container
```

#### Step 6: Generate Webhook Secret
```typescript
webhookSecret = executeCommand('openssl rand -hex 32')
// Generates 32 random hex characters
// Used to validate GitHub/GitLab webhook signatures
// HMAC-SHA256 validation ensures webhooks come from trusted source
```

#### Step 7: Add Webhook Hook Entry
```typescript
hookEntry = generateWebhookHookEntry(teamName, webhookSecret, branch)
// Result example:
//   {
//     "id": "team-name-main",
//     "match-branch": "main",
//     "command-working-directory": "/opt/apps/team-name",
//     "execute-command": "/opt/apps/team-name/deploy.sh",
//     "secret": "2f1a3b5c..."
//   }
//
// Added to: /opt/apps/webhook/hooks.json
// Webhook server uses this to trigger deployments on push
```

#### Step 8: Create Deploy Script
```typescript
deployScript = generateDeployScript(teamName)
// Result example (bash script):
//   #!/bin/bash
//   cd /opt/apps/team-name
//   git pull origin main
//   docker compose up -d
//   docker image prune -f
//
// Written to: /opt/apps/team-name/deploy.sh
// Made executable (chmod +x)
// Triggered by webhook on each push to branch
```

#### Step 9: Reload Infrastructure
```typescript
executeCommand('caddy reload --config /opt/apps/caddy/Caddyfile')
executeCommand('systemctl restart webhook-server')
// OR
executeCommand('kill -HUP <webhook-pid>')
//
// Caddy reloads configs: domain now points to team's container
// Webhook server loads new hooks.json: webhook secret is now active
```

### Result
- Team directory structure created
- Application code available for deployment
- Domain proxied to container via Caddy
- Webhook listening for git push events with validation
- Deploy script ready to pull code and restart containers

---

## File Interactions & Dependencies

### File Dependency Graph

```
app/dashboard/page.tsx (Server Component)
  ├─→ components/CreateTeamForm.tsx (Client Component)
  │     └─→ POST /api/teams/create
  │
  ├─→ components/TeamList.tsx (Client Component)
  │     └─→ GET /api/teams
  │
  └─→ components/SystemControls.tsx (Client Component)
        └─→ POST /api/system/reload-caddy
        └─→ POST /api/system/restart-webhook
```

### API Routes & Server Actions

```
/api/teams/create (Route Handler)
  └─→ POST body: { teamName, repositoryUrl, domain, branch, envVariables }
      └─→ createTeam() from actions/teams.ts (Server Action)
          ├─→ lib/server/createDirectory()
          ├─→ lib/server/gitClone()
          ├─→ lib/server/writeFile()
          ├─→ lib/templates/generateCaddyConfig()
          ├─→ lib/server/executeCommand() [openssl]
          ├─→ lib/templates/generateWebhookHookEntry()
          ├─→ lib/server/readJSON() [hooks.json]
          ├─→ lib/server/writeJSON() [hooks.json]
          ├─→ lib/templates/generateDeployScript()
          ├─→ lib/server/executeCommand() [caddy reload]
          └─→ lib/server/executeCommand() [webhook restart]

/api/teams (Route Handler)
  └─→ GET
      └─→ getTeams() from actions/teams.ts (Server Action)
          └─→ lib/server/listDirectories() [/opt/apps/]
              └─→ Returns teams[] with details

/api/system/reload-caddy (Route Handler)
  └─→ POST
      └─→ systemReloadCaddy() from actions/teams.ts
          └─→ lib/server/executeCommand() [caddy reload]

/api/system/restart-webhook (Route Handler)
  └─→ POST
      └─→ systemRestartWebhook() from actions/teams.ts
          └─→ lib/server/executeCommand() [webhook restart]
```

### Component → Action → File System

```
CreateTeamForm (Client)
  │
  ├─ onSubmit event
  │  └─ fetch('/api/teams/create', POST)
  │
  └─ Response
     ├─ Success: Display webhook secret
     └─ Error: Display error message

TeamList (Client)
  │
  ├─ useEffect() on mount
  │  └─ fetch('/api/teams', GET)
  │
  ├─ Response: teams[]
  │  └─ Render list of teams with delete buttons
  │
  └─ Delete button: fetch('/api/teams/{id}', DELETE)
     └─ Server action removes directory
```

---

## Data Flow Diagrams

### Authentication Sequence

```
┌─ Browser ──────────────────────────────────────────────────┐
│                                                              │
│  1. User types credentials on /login page                   │
│     {email: 'admin', password: 'admin123'}                  │
│                                                              │
│  2. Click "Sign In" button                                  │
│     POST /api/auth/login                                    │
│     │                                                        │
│     ├─────────────────────────────────────────────────────►│
│     │          app/api/auth/login/route.ts                 │
│     │          1. Parse body                                │
│     │          2. Call verifyCredentials()                 │
│     │             ↓ lib/auth/index.ts                      │
│     │             - Compare email/password                 │
│     │             - Return {valid: true}                   │
│     │          3. Set httpOnly cookie 'session'            │
│     │          4. Return {success: true}                   │
│     │                                                        │
│     ◄─ JSON {success: true, redirectUrl} ◄─────────────────┤
│                                                              │
│  3. Browser redirect to /dashboard                          │
│     GET /dashboard                                          │
│     (session cookie sent automatically)                     │
│                                                              │
│     ├─────────────────────────────────────────────────────►│
│     │          middleware.ts                               │
│     │          1. Extract session cookie                   │
│     │          2. Cookie exists? Yes                       │
│     │          3. Allow request                            │
│     │                                                        │
│     │          app/dashboard/page.tsx                      │
│     │          (Render dashboard)                          │
│     │                                                        │
│     ◄─────────────────────────────────────────────────────┤
│                                                              │
│  4. Dashboard displayed                                     │
│     - CreateTeamForm component                             │
│     - TeamList component                                   │
│     - SystemControls component                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Team Creation Sequence (9 Steps)

```
┌─ Browser ─────────────────────────────────────────────────────────┐
│                                                                     │
│  User fills CreateTeamForm with:                                   │
│    - teamName: "acme"                                              │
│    - repositoryUrl: "https://github.com/acme/app.git"             │
│    - domain: "acme.example.com"                                    │
│    - branch: "main"                                                │
│    - envVariables: "API_KEY=xxx..."                                │
│                                                                     │
│  POST /api/teams/create                                            │
│  ───────────────────────►                                          │
│                       app/api/teams/create/route.ts               │
│                       └─► await createTeam(...)                   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                │
                 ╔══════════════╩═══════════════╗
                 │   actions/teams.ts           │
                 │   createTeam() Server Action  │
                 └══════════════╦═══════════════╝
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
    │Step 1-2     │      │Step 3-5     │      │Step 6-9     │
    │Validate &   │      │Clone & Env  │      │Config & Sys │
    │Create Dir   │      │             │      │             │
    └─────────────┘      └─────────────┘      └─────────────┘
        │                     │                       │
        ├─ Validate          ├─ gitClone()          ├─ openssl
        │  inputs            │  repo to             │  rand -hex 32
        │                    │  /opt/apps/          │  (webhook secret)
        └─ mkdir             │  team-acme/          │
           /opt/apps/        │                      ├─ generateWebhookEntry()
           team-acme/        └─ writeFile()         │
                               .env                 ├─ Update hooks.json
                                                    │
                            ├─ generateCaddyConfig() ├─ Deploy script
                            │                       │
                            └─ Write to             └─ caddy reload
                              /opt/apps/caddy/      └─ restart webhook
                              conf.d/acme.conf
                                                        ▼
                                        ┌────────────────────────┐
                                        │  Infrastructure Ready  │
                                        │                        │
                                        │  /opt/apps/team-acme/  │
                                        │  ├─ .git/ (cloned)     │
                                        │  ├─ .env               │
                                        │  └─ deploy.sh          │
                                        │                        │
                                        │  /opt/apps/caddy/      │
                                        │  └─ conf.d/            │
                                        │     └─ acme.conf       │
                                        │                        │
                                        │  Webhook server        │
                                        │  └─ listening on       │
                                        │     acme.example.com   │
                                        │     with secret        │
                                        └────────────────────────┘
                                                    │
                                                    ▼
                                        ┌────────────────────────┐
                                        │ Return to Browser      │
                                        │                        │
                                        │ {                      │
                                        │   success: true,       │
                                        │   webhookSecret: "..." │
                                        │ }                      │
                                        └────────────────────────┘
```

---

## API Route Architecture

### Route Handler Pattern

All API routes follow this pattern:

```typescript
// /api/[resource]/[action]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { serverActionFunction } from '@/actions/[resource]'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const result = await serverActionFunction(data)
    
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 400 })
  }
}
```

### Available Routes

| Method | Path | Handler | Server Action | Purpose |
|--------|------|---------|-----------------|---------|
| POST | `/api/auth/login` | auth/login/route.ts | verifyCredentials() | User authentication |
| POST | `/api/teams/create` | teams/create/route.ts | createTeam() | Create new team |
| GET | `/api/teams` | teams/route.ts | getTeams() | List all teams |
| DELETE | `/api/teams/[id]` | teams/[id]/route.ts | deleteTeam() | Remove team |
| POST | `/api/system/reload-caddy` | system/reload-caddy/route.ts | systemReloadCaddy() | Reload proxy |
| POST | `/api/system/restart-webhook` | system/restart-webhook/route.ts | systemRestartWebhook() | Restart webhook server |

---

## Server-Side Utilities Stack

### `lib/server/index.ts` - Core Infrastructure Functions

#### File Operations
```typescript
readFile(path: string) → Promise<string>
  - Reads text file from file system
  - Used for: config files, logs, environment files
  - Example: readFile('/opt/apps/team-acme/.env')

writeFile(path: string, content: string) → Promise<void>
  - Writes text to file system
  - Used for: creating configs, env files, scripts
  - Example: writeFile('/opt/apps/team-acme/.env', envContent)

readJSON(path: string) → Promise<object>
  - Reads JSON file and parses it
  - Used for: hooks.json, team metadata
  - Example: readJSON('/opt/apps/webhook/hooks.json')

writeJSON(path: string, data: object) → Promise<void>
  - Stringifies object and writes to file
  - Used for: updating hooks.json after adding team
  - Example: writeJSON('/opt/apps/webhook/hooks.json', hooksList)
```

#### Directory Operations
```typescript
createDirectory(path: string) → Promise<void>
  - Creates directory if it doesn't exist
  - Used for: team directory creation (step 2)
  - Example: createDirectory('/opt/apps/team-acme')

listDirectories(path: string, pattern: string) → Promise<string[]>
  - Lists directories matching pattern in path
  - Used for: finding teams (pattern: 'team-*')
  - Example: listDirectories('/opt/apps/', 'team-')
```

#### Git Operations
```typescript
gitClone(url: string, targetPath: string) → Promise<void>
  - Runs: git clone <url> <targetPath>
  - Used for: cloning application repo (step 3)
  - Example: gitClone('https://github.com/acme/app.git', '/opt/apps/team-acme')

gitPull(path: string) → Promise<void>
  - Runs: git pull in directory
  - Used for: deployment script to get latest code
```

#### System Commands
```typescript
executeCommand(command: string, options?: {cwd?: string}) → Promise<string>
  - Executes shell command and returns output
  - Used for: openssl, caddy reload, service restarts
  - Examples:
    - executeCommand('openssl rand -hex 32')
    - executeCommand('caddy reload --config /opt/apps/caddy/Caddyfile')
    - executeCommand('systemctl restart webhook-server')

reloadCaddy() → Promise<void>
  - Shortcut: executeCommand('caddy reload ...')
  - Used for: applying new domain routing (step 9)

restartWebhookServer() → Promise<void>
  - Shortcut: executeCommand('systemctl restart webhook-server')
  - Used for: loading new webhook hooks (step 9)
```

### `lib/templates/index.ts` - Configuration Generators

#### Caddy Configuration Generator
```typescript
generateCaddyConfig(domain: string, teamName: string) → string

Result example:
  acme.example.com {
    reverse_proxy localhost:3000 {
      header_uri /admin /admin
      header_uri /api /api
    }
  }

Purpose:
  - Proxies domain traffic to Docker container on localhost:3000
  - Used in step 5
  - Written to: /opt/apps/caddy/conf.d/{teamName}.conf
```

#### Deploy Script Generator
```typescript
generateDeployScript(teamName: string) → string

Result example (bash script):
  #!/bin/bash
  set -e
  
  TEAM_DIR="/opt/apps/team-acme"
  cd "$TEAM_DIR"
  
  # Pull latest code
  git pull origin main
  
  # Start containers
  docker compose up -d
  
  # Clean up old images
  docker image prune -f
  
  echo "Deployment complete"

Purpose:
  - Executable script triggered by webhook
  - Pulls latest code and restarts containers
  - Used in step 8
  - Written to: /opt/apps/team-{name}/deploy.sh
  - Made executable: chmod +x
```

#### Webhook Hook Entry Generator
```typescript
generateWebhookHookEntry(
  teamName: string,
  webhookSecret: string,
  branch: string
) → object

Result example:
  {
    "id": "team-acme-main",
    "match-branch": "main",
    "command-working-directory": "/opt/apps/team-acme",
    "execute-command": "/opt/apps/team-acme/deploy.sh",
    "response-message": "Deployment triggered",
    "response-code": 200,
    "secret": "2f1a3b5c7e9d...",
    "secret-source": "header",
    "secret-header-name": "X-Webhook-Token",
    "hmac-sha256": true
  }

Purpose:
  - Tells webhook server how to handle GitHub/GitLab push events
  - Validates webhook signature with secret
  - Matches branch to prevent deployments on wrong branches
  - Used in step 7
  - Added to: /opt/apps/webhook/hooks.json
```

---

## State Management & File System

### Why No Database?

This app uses **the file system as its database**. Why?

1. **Simplicity**: File-based state matches file-based infrastructure
2. **Visibility**: Configuration is directly readable
3. **Safety**: Version control can track infrastructure changes
4. **Alignment**: Operating on files is the core operation anyway

### State Storage

#### Teams List
```
/opt/apps/
  ├─ team-acme/         (if team "acme" exists)
  ├─ team-beta/         (if team "beta" exists)
  ├─ caddy/
  │  └─ conf.d/
  │     ├─ acme.conf    (Caddy config for team-acme)
  │     └─ beta.conf    (Caddy config for team-beta)
  └─ webhook/
     └─ hooks.json      (All webhook configurations)
```

#### How getTeams() Works
```typescript
function getTeams():
  1. listDirectories('/opt/apps/', pattern='team-')
  2. For each directory matching 'team-*':
     - Extract team name from directory name
     - Read .env file if exists
     - Read deploy.sh if exists
     - Build team object with metadata
  3. Return teams[]

Example result:
  [
    {
      name: 'acme',
      path: '/opt/apps/team-acme',
      domain: 'acme.example.com',
      repository: 'https://github.com/acme/app.git',
      createdAt: '2024-01-15T10:30:00Z'
    },
    {
      name: 'beta',
      path: '/opt/apps/team-beta',
      domain: 'beta.example.com',
      repository: 'https://github.com/beta/app.git',
      createdAt: '2024-01-15T11:00:00Z'
    }
  ]
```

#### How Teams Are Persisted
```
Step 2: mkdir /opt/apps/team-{name}
  ↓ Persistence: Team exists in file system

Step 3: git clone
  ↓ Persistence: .git/ folder and code exists

Step 4: writeFile .env
  ↓ Persistence: .env file saved

Step 5: writeFile Caddy config
  ↓ Persistence: /opt/apps/caddy/conf.d/{name}.conf saved

Step 7: Append to hooks.json
  ↓ Persistence: Webhook entry added to hooks.json

Step 8: writeFile deploy.sh
  ↓ Persistence: deploy.sh script saved
```

---

## Error Handling Patterns

### Try-Catch in Server Actions

```typescript
export async function createTeam(
  teamName: string,
  repositoryUrl: string,
  domain: string,
  branch: string,
  envVariables: string
) {
  try {
    // Step 1: Validate
    validateInputs(teamName, repositoryUrl, domain)
    
    // Step 2-9: Execute
    // ... orchestration steps ...
    
    return { success: true, webhookSecret }
  } catch (error) {
    // Error handling
    console.error('Team creation failed:', error)
    
    // Optionally cleanup on failure
    // await executeCommand(`rm -rf /opt/apps/team-${teamName}`)
    
    throw new Error(`Failed to create team: ${error.message}`)
  }
}
```

### Error Propagation

```
CreateTeamForm.tsx
  ├─ fetch('/api/teams/create', POST)
  │
  ├─ Response.ok → Display success + secret
  │
  └─ Response.error
     ├─ Parse error.json()
     ├─ Display error.message in UI
     └─ User sees: "Failed to create team: Repository URL is invalid"
```

### Common Errors

| Error | Cause | Location | Recovery |
|-------|-------|----------|----------|
| Validation failed | Invalid input | Step 1 | User corrects input |
| Directory exists | Team name taken | Step 2 | User tries different name |
| Git clone failed | Invalid repo URL | Step 3 | User checks repository URL |
| Domain already proxied | Domain conflict | Step 5 | User chooses different domain |
| Caddy reload failed | Invalid config | Step 9 | Manual intervention required |
| Webhook restart failed | Process issue | Step 9 | System administrator intervention |

---

## Component Interaction Summary

### CreateTeamForm Component
- **Purpose**: Captures user input for new team
- **Inputs**: teamName, repositoryUrl, domain, branch, envVariables
- **Action on Submit**: 
  ```typescript
  POST /api/teams/create → Server action → 9-step orchestration
  ```
- **Output**: Success message with webhook secret OR error message

### TeamList Component
- **Purpose**: Displays existing teams
- **Data Source**: `GET /api/teams` → `getTeams()` server action
- **Display**: List of teams with name, domain, repository
- **Actions**: 
  - Delete team: `DELETE /api/teams/{id}`
  - View details: Click team name

### SystemControls Component
- **Purpose**: Infrastructure management
- **Actions**:
  - Reload Caddy: `POST /api/system/reload-caddy`
  - Restart Webhook: `POST /api/system/restart-webhook`
- **Use Case**: Applied after manual configuration changes

---

## Key Takeaways

1. **Flow**: User Authentication → Dashboard → Team Creation → 9-Step Orchestration → Infrastructure Ready

2. **File System as Database**: Teams are directories. Their existence and state are persisted in the file system.

3. **Server Actions as Core Logic**: All business logic uses `'use server'`. API routes delegate to server actions.

4. **Middleware Security**: Single point of access control for all protected routes.

5. **Template-Driven Configuration**: Caddy config, deploy script, and webhook entries are generated dynamically based on team data.

6. **State is Distributed**: Team data is stored across multiple locations:
   - Team directory: `/opt/apps/team-{name}/` (code + env)
   - Caddy config: `/opt/apps/caddy/conf.d/{name}.conf`
   - Webhook entry: `/opt/apps/webhook/hooks.json`

7. **Multi-Step Atomicity**: All 9 steps must succeed for a valid team. Partial failures leave orphaned directories/configs.

