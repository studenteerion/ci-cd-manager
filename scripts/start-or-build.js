#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status);
}

const projectRoot = path.join(__dirname, '..');
const nextBuildDir = path.join(projectRoot, '.next');

if (!fs.existsSync(nextBuildDir)) {
  console.log('.next not found — running `npm run build` before starting');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: projectRoot });
}

// Determine port using existing script
const getPort = spawnSync(process.platform === 'win32' ? 'node.exe' : 'node', [path.join(__dirname, 'get-port.js')], { encoding: 'utf8' });
const port = (getPort.stdout || '').trim() || '3000';

// Locate the Next.js binary
const nextBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next'
);
const nextCli = fs.existsSync(nextBin)
  ? nextBin
  : path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

// Start production server
console.log(`Starting next start on port ${port}`);
run(nextCli, ['start', '-p', port], { cwd: projectRoot });
