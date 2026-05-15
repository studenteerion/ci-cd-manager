# Architettura di CI-CD Pipeline Manager

## 📋 Panoramica

Questa è un'applicazione Next.js molto **non convenzionale** rispetto a una app Next.js standard. Non è un semplice client-side dashboard, ma un **orchestratore di sistema** che gestisce infrastruttura server, configurazione di reverse proxy, e CI/CD automation direttamente dal browser.

---

## 🔴 Differenze Principali da Next.js Convenzionale

### 1. **Accesso Diretto al File System**

#### Cosa fa una app Next.js normal:
- Accede a file solo tramite `/public` o API esterne
- I file sono immutabili e statici

#### Cosa fa questa app:
```typescript
// lib/server/index.ts
export async function readFile(filePath: string): Promise<string> {
  return await fs.promises.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}
```

**Perché?** L'app **crea e modifica file** nel file system del server:
- Genera configurazioni Caddy dinamicamente
- Scrive file `.env` per ogni team
- Crea script di deployment bash

---

### 2. **Esecuzione di Comandi di Sistema**

#### Cosa fa una app Next.js normal:
- Non esegue comandi di sistema
- Comunica solo tramite HTTP/API

#### Cosa fa questa app:
```typescript
// lib/server/index.ts
export async function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execAsync(command, {
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

// Esempi di uso:
await executeCommand('git clone "https://github.com/user/repo.git" "/opt/apps/team-x"');
await executeCommand('systemctl reload caddy');
await executeCommand('docker compose restart');
await executeCommand('openssl rand -hex 32');
```

**Perché?** L'app **gestisce l'intera infrastruttura**:
- Clona repository Git
- Ricarica il reverse proxy Caddy
- Riavvia servizi Docker
- Genera secret di sicurezza

---

### 3. **Server Actions Critiche per il Business Logic**

#### Cosa fa una app Next.js normal:
- Server Actions sono helper opzionali
- La logica principale è in componenti client

#### Cosa fa questa app:
```typescript
// actions/teams.ts - 'use server' al top level
export async function createTeam(input: CreateTeamInput): Promise<{ success: boolean; message: string }> {
  // 1. Crea directory
  await createDirectory(\`/opt/apps/team-\${teamName}\`);
  
  // 2. Clona repository
  await gitClone(input.repositoryUrl, targetDir);
  
  // 3. Scrive .env
  await writeFile(envPath, envContent);
  
  // 4. Genera config Caddy
  await writeFile(caddyConfigPath, generateCaddyConfig(...));
  
  // 5. Genera webhook secret
  const secret = await generateWebhookSecret();
  
  // 6. Aggiorna hooks.json
  await updateWebhookConfig(secret);
  
  // 7. Crea script di deployment
  await writeFile(deployScriptPath, generateDeployScript(...));
  
  // 8. Ricarica Caddy
  await reloadCaddy();
  
  // 9. Riavvia webhook server
  await restartWebhookServer();
}
```

**Perché?** Tutto il flusso di creazione di un team è **business-critical**:
- Deve eseguire in sequenza precisa
- Ogni step dipende dal precedente
- Errori in uno step annullano tutto
- Non può essere distribuito a client

---

### 4. **Middleware per Protezione di Sistema**

#### Cosa fa una app Next.js normal:
- Middleware per rewriting URL, internazionalizzazione
- Non tocca l'autenticazione sensibile

#### Cosa fa questa app:
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Blocca TUTTI i route tranne login e auth
  if (pathname === '/login' || pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  const session = request.cookies.get('session')?.value;
  
  // Nessuna sessione = redirect immediato
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
```

**Perché?** Proteggere un'app che **comanda infrastruttura**:
- Accesso non autenticato = disaster totale
- Sistema admin completo = rischio altissimo
- Ogni route deve essere protetta

---

### 5. **Generazione di Configurazione Dinamica**

#### Cosa fa una app Next.js normal:
- Serve contenuto statico o query DB
- Configurazione è deployata al build time

#### Cosa fa questa app:
```typescript
// lib/templates/index.ts
export function generateCaddyConfig(domain: string, appPort: number): string {
  return \`\${domain} {
    encode gzip
    reverse_proxy localhost:\${appPort}
  }\`;
}

export function generateDeployScript(teamName: string, repoUrl: string): string {
  return \`#!/bin/bash
    set -e
    echo "Deploying \${teamName}..."
    cd /opt/apps/\${teamName}
    git pull origin main
    npm install
    npm run build
    systemctl restart app-\${teamName}
    echo "Deploy completed!"
  \`;
}

export function generateWebhookHookEntry(id: string, secret: string): HookEntry {
  return {
    id,
    "execute-command": {
      command: \`/opt/apps/webhook/scripts/deploy-\${id}.sh\`,
      source: { owner: "github", hook: "push" }
    },
    "sign-secret": secret,
  };
}
```

**Perché?** Ogni team ha **configurazione diversa**:
- Domain diverso
- Port diverso
- Repository diverso
- Secret di webhook diverso

---

### 6. **Orchestrazione Multi-Servizio**

#### Cosa fa una app Next.js normal:
- App singola e standalone
- Dipende da provider esterni per infrastruttura

#### Cosa fa questa app:
```
┌─────────────────────────────────────────┐
│ Next.js Dashboard (questa app)           │
└────────────┬────────────────────────────┘
             │
      ┌──────┼──────┬──────────┬────────────┐
      ▼      ▼      ▼          ▼            ▼
    Git   Caddy  Docker    systemctl   openssl
   Clone  Reload Compose  Services    Secrets
     │      │      │         │          │
     └──────┴──────┴─────────┴──────────┘
            ▼
    Ubuntu Server Infrastructure
    /opt/apps/
    ├── team-1/
    ├── team-2/
    ├── caddy/
    │   └── conf.d/
    └── webhook/
        ├── hooks.json
        └── scripts/
```

**Perché?** Non è solo UI - **gestisce** intera infrastruttura di deployment

---

### 7. **Stato Persistente in File System**

#### Cosa fa una app Next.js normal:
- Stato in database (PostgreSQL, MongoDB, etc)
- API ben definite per accesso

#### Cosa fa questa app:
```typescript
// Legge direttamente da file system
export async function getTeams(): Promise<TeamInfo[]> {
  const teams = await listDirectories(APPS_DIR);
  return teams
    .filter(name => name.startsWith('team-'))
    .map(name => ({ name: name.replace('team-', '') }));
}

// Non c'è database - solo cartelle e file!
// /opt/apps/team-x/
// ├── package.json
// ├── .env
// └── ...repo clonato...

// Webhook config in JSON file
const hooks = await readJSON(HOOKS_JSON_PATH);
hooks.push(generateWebhookHookEntry(...));
await writeJSON(HOOKS_JSON_PATH, hooks);
```

**Perché?** 
- Minimizza dipendenze (no database da configurare)
- File system è "source of truth"
- Team directory = snapshot completo del team

---

### 8. **API che Causano Side Effects Critici**

#### Cosa fa una app Next.js normal:
```typescript
// API endpoint "normale" - legge data
export async function GET(request: Request) {
  const users = await db.users.findAll();
  return Response.json(users);
}
```

#### Cosa fa questa app:
```typescript
// app/api/teams/create/route.ts
// POST richiesta = modifica infrastruttura completa
export async function POST(request: Request) {
  const input = await request.json();
  
  // ⚠️ Effetti collaterali reali:
  // - Crea directory
  // - Clona git repo
  // - Scrive file di config
  // - Ricarica Caddy
  // - Riavvia Docker
  
  return createTeam(input); // Server action
}

// app/api/system/reload-caddy/route.ts
// Ricarica reverse proxy - DOWNTIME POSSIBILE
export async function POST() {
  await systemReloadCaddy();
  return Response.json({ success: true });
}
```

**Perché?** Queste **non sono normali API di CRUD**:
- Hanno side effects reali e permanenti
- Modificano stato di produzione
- Richiedono elevati permessi di sistema

---

### 9. **Autenticazione "Dimostrativa"**

#### Cosa fa una app Next.js convenzionale:
- NextAuth con provider OAuth (Google, GitHub)
- Database di utenti con hash bcrypt
- Session e refresh token

#### Cosa fa questa app:
```typescript
// lib/auth/index.ts - Semplificata per demo
const VALID_USER = { username: 'admin', password: 'admin123' };

export function validateCredentials(username: string, password: string): boolean {
  return username === VALID_USER.username && password === VALID_USER.password;
}

// NO bcrypt, NO NextAuth, NO OAuth
// Solo plain text password in cookies (⚠️ NOT production!)
```

**Perché?** 
- App dimostrativa, non production
- Focus sulla orchestrazione, non sicurezza auth
- TODO: integrare NextAuth prima di deployare

---

## 📊 Comparazione: App Next.js Normal vs Questa App

| Aspetto | Next.js Standard | Questa App |
|---------|------------------|-----------|
| **Data Source** | Database (SQL/NoSQL) | File System |
| **Esecuzione Comandi** | No | Sì (git, systemctl, docker) |
| **Modifiche File** | No | Sì (config, script) |
| **Middleware** | Opzionale, leggero | **Critico** - blocca tutto |
| **Server Actions** | Helper opzionali | **Core business logic** |
| **API Side Effects** | Data CRUD | Infrastruttura management |
| **Autenticazione** | Robusta (OAuth/JWT) | Semplificata (demo) |
| **Multi-tenancy** | Per utente | Per **team** con infra isolata |
| **Deploy** | Singolo processo | Orestra **team-specific** |
| **Stato App** | In memoria + DB | File system del server |

---

## 🏗️ Perché Questa Architettura?

### Caso d'Uso Specifico
Questa app è un **deployment orchestrator** per:
1. Hosting multi-tenant su Ubuntu server
2. Reverse proxy automatico con Caddy
3. CI/CD webhook-based per ogni team
4. Automazione completa da un pannello web

### Trade-offs
✅ **Pro:**
- Minimal dependencies (no DB required)
- Configurazione riproducibile (tutto in file)
- Control completo dell'infrastruttura
- Facile da debuggare (leggi file system)

⚠️ **Contro:**
- Non scalabile a cluster di server
- Sicurezza richiede attenzione extra
- Hard-coded paths (\`/opt/apps/\`)
- No audit logging nativo

---

## 🚀 Pattern Chiave da Ricordare

1. **Server Actions sono non-optional** - Contengono intera orchestrazione
2. **File system è il database** - Niente persistenza esterna richiesta
3. **Middleware è security-critical** - Protegge accesso a infrastruttura
4. **Template generation** - Configurazione dinamica per ogni team
5. **Command execution** - Evitare injection, sempre validare input

---

## 📝 Checklist per Sviluppatori

Quando sviluppi questa app, ricorda:

- ✅ Server Actions **non possono** diventare Client Components
- ✅ File I/O **deve** essere in Server Actions/API routes
- ✅ Comando di sistema esecuzione **richiede** input validation
- ✅ Middleware **blocca** tutto tranne \`/login\` e \`/api/auth/login\`
- ✅ Template generation **supporta** multi-tenancy
- ✅ Errori in \`createTeam\` potrebbero lasciare file parziali
- ✅ \`@/lib/server\` exports sono **only for server**

---

## 🔐 Security Considerations

⚠️ **DEMO APPLICATION - NOT PRODUCTION READY**

Prima di mettere in produzione:

1. **Autenticazione**
   - [ ] Implementare NextAuth con OAuth
   - [ ] Hash password con bcrypt
   - [ ] Aggiungere 2FA

2. **Validazione Input**
   - [ ] Controllare git URLs (SSH injection)
   - [ ] Validare domain names
   - [ ] Limitare characters in team names

3. **Permessi File System**
   - [ ] Run con user dedicato (non root)
   - [ ] Limitare accesso a \`/opt/apps/\`

4. **Audit Logging**
   - [ ] Log chi ha creato ogni team
   - [ ] Log reload/restart operations
   - [ ] Conservare storico 6+ mesi

5. **Rate Limiting**
   - [ ] Limite creazione team per user/ora
   - [ ] Limite reload caddy
   - [ ] DDoS protection

6. **Isolamento Team**
   - [ ] Verificare che team non possono accedere tra loro
   - [ ] cGroups/containers per isolamento risorsa

---

## 📚 Risorse Interne

- \`lib/server/index.ts\` - Core system integration
- \`lib/templates/index.ts\` - Configuration generation
- \`actions/teams.ts\` - Multi-step orchestration
- \`middleware.ts\` - Auth protection
- \`app/api/teams/create/route.ts\` - Team creation endpoint
