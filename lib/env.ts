import * as path from 'path';

export const APP_MODE = process.env.APP_MODE || 'production';

export function getTeamsDirectory(): string {
  if (APP_MODE === 'testing') {
    return path.join(process.cwd(), 'temp', 'apps');
  }
  return '/opt/apps';
}

export function getLogsDirectory(): string {
  if (APP_MODE === 'testing') {
    return path.join(process.cwd(), 'temp', 'logs');
  }
  return '/var/log';
}

export const isDevelopment = process.env.NODE_ENV === 'development';
export const isTesting = APP_MODE === 'testing';

export function logTestingMode(message: string): void {
  if (isTesting) {
    console.log(`[TESTING MODE] ${message}`);
  }
}
