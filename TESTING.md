# Testing Guide - Multi-Tenant Deployment Dashboard

## Quick Start: Testing on Mac with Testing Mode

### 1. Configure Testing Mode
Testing mode is already enabled in `.env.local`:
```bash
cat .env.local
# Output: APP_MODE=testing
```

### 2. Start Dev Server on Port 61555
```bash
npm run dev
# Server runs on http://localhost:61555
```

### 3. Login
- Username: `admin`
- Password: `admin123`

### 4. Test Team Creation
All files are created in `temp/` directory (not `/opt/apps`):
```bash
# Create a team via the UI
# Then verify files were created:
ls -la temp/apps/
# You'll see: caddy/, webhook/, team-*/

# View a team's files:
ls -la temp/apps/team-my-team/
# Contains: .env, team.config.json, docker-compose.override.yml

# Clean up after testing:
rm -rf temp/
```

### 5. What Works in Testing Mode
✅ Full GUI experience (create, view, edit teams)
✅ Dashboard with sidebar and user info
✅ All forms and buttons
✅ Port management interface
✅ Environment variable editing
✅ Branch editing

### 6. Limitations
⚠️ Git clone won't actually clone (but team directory is created)
⚠️ Docker compose and deployment won't run (no Docker on Mac)
⚠️ Caddy reload and webhook restart won't work
⚠️ Some errors are silently skipped (operations return success)

### 7. Production Mode (Ubuntu Server)
To test on a real Ubuntu server with `/opt/apps` directory:
```bash
# Edit .env.local
APP_MODE=production

# Then follow the instructions below ⬇️
```

---

## Pre-requisites for Testing

Before testing on Ubuntu server, ensure:
```bash
# Check required commands
which git
which openssl
which systemctl
which docker
which docker-compose

# Verify /opt/apps directory exists
ls -la /opt/apps/

# Verify users.json exists (or will be created)
ls -la /opt/apps/users.json
```

## Local Development Testing

### 1. Start Dev Server
```bash
cd dashboard
npm run dev
```

Server runs on `http://localhost:3000`

### 2. Test Login Page
```bash
# Redirect test
curl -L http://localhost:3000/
# Expected: Redirects to /login

# Visit login page
# Username: admin
# Password: admin123
```

### 3. Test Dashboard
After login:
- Should see "Teams" section
- Should see "Create New Team" form
- Should see system action buttons

### 4. Test Team Creation Form
Fill in:
- **Team Name**: test-team
- **Repository URL**: https://github.com/user/repo.git
- **Domain**: test-team.example.com
- **Git Branch**: main (default)
- **Environment Variables**: 
  - KEY1=value1
  - KEY2=value2

## Ubuntu Server Testing

### 1. Deploy Application
```bash
cd dashboard

# Build
npm run build

# Start in production
npm start
# or with systemd service for auto-restart
```

### 2. Prepare Test Environment
```bash
# Create required directories
sudo mkdir -p /opt/apps/caddy/conf.d
sudo mkdir -p /opt/apps/webhook/scripts
sudo chmod -R 755 /opt/apps

# Create minimal hooks.json if it doesn't exist
sudo cat > /opt/apps/webhook/hooks.json << 'EOF'
[]
EOF

# Create test users.json
sudo cat > /opt/apps/users.json << 'EOF'
[
  {
    "username": "admin",
    "password": "admin123"
  }
]
EOF

# Set permissions
sudo chmod 644 /opt/apps/webhook/hooks.json
sudo chmod 644 /opt/apps/users.json
```

### 3. Test Team Creation on Ubuntu

**Via UI:**
1. Login with admin/admin123
2. Fill team creation form with:
   - Team Name: `test-alpha`
   - Repository: `https://github.com/user/repo.git` (accessible via HTTPS)
   - Domain: `test-alpha.example.com`
   - Variables: `NODE_ENV=production`

**Verify created files:**
```bash
# Check team directory
ls -la /opt/apps/team-test-alpha/
# Should contain: .git/, .env, docker-compose.yml, etc.

# Check .env file
cat /opt/apps/team-test-alpha/.env
# Should contain: NODE_ENV=production

# Check Caddy config
cat /opt/apps/caddy/conf.d/test-alpha.conf
# Should have reverse_proxy configuration

# Check hooks.json
cat /opt/apps/webhook/hooks.json
# Should have new entry for test-alpha

# Check deploy script
cat /opt/apps/webhook/scripts/deploy-test-alpha.sh
# Should be executable and contain deployment logic

# Verify executable
ls -la /opt/apps/webhook/scripts/deploy-test-alpha.sh
# Should have -rwxr-xr-x permissions
```

### 4. Test System Actions

**Reload Caddy:**
```bash
# Via Dashboard button "Reload Caddy"
# Or manual test:
sudo systemctl reload caddy
```

**Restart Webhook:**
```bash
# Via Dashboard button "Restart Webhook"
# Or manual test:
sudo docker compose -f /opt/apps/webhook/docker-compose.yml restart
```

## API Testing

### Test Login Endpoint
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt

# Check if session cookie was set
cat cookies.txt
```

### Test Teams List Endpoint
```bash
curl http://localhost:3000/api/teams \
  -b cookies.txt
# Should return: { "teams": [...] }
```

### Test Team Creation Endpoint
```bash
curl -X POST http://localhost:3000/api/teams/create \
  -H "Content-Type: application/json" \
  -d '{
    "teamName": "api-test",
    "repositoryUrl": "https://github.com/user/repo.git",
    "domain": "api-test.example.com",
    "branch": "main",
    "envVariables": {
      "NODE_ENV": "production"
    }
  }' \
  -b cookies.txt
```

### Test System Endpoints
```bash
# Reload Caddy
curl -X POST http://localhost:3000/api/system/reload-caddy \
  -b cookies.txt

# Restart Webhook
curl -X POST http://localhost:3000/api/system/restart-webhook \
  -b cookies.txt
```

## Error Scenarios

### 1. Missing Required Fields
```bash
curl -X POST http://localhost:3000/api/teams/create \
  -H "Content-Type: application/json" \
  -d '{"teamName":"test"}' \
  -b cookies.txt
# Expected: { success: false, message: "Please fill in all required fields" }
```

### 2. Invalid Credentials
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'
# Expected: { success: false, message: "Invalid credentials" }
```

### 3. Git Clone Failure
Try with a non-existent or inaccessible repository:
- Expected: Team creation fails with error message

### 4. Missing /opt/apps Directory
Run on system without /opt/apps:
- Expected: Graceful error about inaccessible directory

## Performance Testing

### Load Testing (Local)
```bash
# Simple load test with Artillery or Apache Bench
ab -n 100 -c 10 http://localhost:3000/api/teams \
  -C "session=test-token"
```

### Concurrent Team Creation
```bash
# Create multiple teams in parallel
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/teams/create \
    -H "Content-Type: application/json" \
    -d "{
      \"teamName\": \"team-$i\",
      \"repositoryUrl\": \"https://github.com/user/repo.git\",
      \"domain\": \"team-$i.example.com\",
      \"envVariables\": {}
    }" \
    -b cookies.txt &
done
wait
```

## Cleanup

After testing, remove test teams:
```bash
# Remove team directory
sudo rm -rf /opt/apps/team-test-*

# Remove Caddy config
sudo rm /opt/apps/caddy/conf.d/test-*.conf

# Remove deploy scripts
sudo rm /opt/apps/webhook/scripts/deploy-test-*.sh

# Clean hooks.json
sudo nano /opt/apps/webhook/hooks.json
# Manually remove test entries

# Reload Caddy to apply changes
sudo systemctl reload caddy

# Restart webhook server
sudo docker compose -f /opt/apps/webhook/docker-compose.yml restart
```

## Checklist

- [ ] Login page loads and authenticates
- [ ] Dashboard displays correctly after login
- [ ] Team creation form accepts input
- [ ] Team directory created at /opt/apps/team-{name}
- [ ] Repository cloned successfully
- [ ] .env file created with correct variables
- [ ] Caddy config generated correctly
- [ ] Webhook secret generated (hex format)
- [ ] hooks.json updated with new entry
- [ ] Deploy script created and executable
- [ ] Caddy reload executes without errors
- [ ] Webhook restart executes without errors
- [ ] Teams list displays newly created teams
- [ ] Session authentication works
- [ ] Logout clears session cookie
- [ ] Proxy redirects unauthenticated users to login

## Known Issues

1. **OpenSSL on macOS**: The `openssl` command behavior varies between macOS and Linux. Tests should run on Ubuntu.

2. **Git Clone Requires Network**: Repository must be accessible via HTTPS from the running environment.

## Notes for Developers

- All file operations use `fs/promises` for async handling
- All system commands use `child_process.execAsync` with timeout
- Template generation functions are composable and testable
- Server actions handle errors gracefully and return user-friendly messages
- Session cookies are httpOnly for security
