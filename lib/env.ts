import * as path from 'path';

export const APP_MODE = process.env.APP_MODE || 'production';
export const isTesting = APP_MODE === 'testing';
export const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Adjust path for testing mode
 * In testing mode: /opt/apps/x → temp/opt/apps/x, /var/log/x → temp/var/log/x
 * In production mode: return path unchanged
 */
export function adjustPathForTesting(filePath: string): string {
  if (!isTesting) {
    return filePath;
  }

  // Handle absolute paths
  if (filePath.startsWith('/')) {
    return path.join(process.cwd(), 'temp', filePath.substring(1));
  }

  return filePath;
}

export function logTestingMode(message: string): void {
  if (isTesting) {
    console.log(`[TESTING MODE] ${message}`);
  }
}
