#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '..', '.env');
let port = 3000; // default

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^PORT=(\d+)$/m);
  if (match) {
    port = match[1];
  }
}

console.log(port);
