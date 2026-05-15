import * as path from 'path';
import { fileURLToPath } from 'url';

const requestedAppMode = process.env.APP_MODE || 'production';
const isNodeProduction = process.env.NODE_ENV === 'production';
const forcingProductionMode = isNodeProduction && requestedAppMode === 'testing';

if (forcingProductionMode) {
  console.warn('APP_MODE=testing ignored because NODE_ENV=production');
}

export const APP_MODE = forcingProductionMode ? 'production' : requestedAppMode;
export const isTesting = APP_MODE === 'testing';
export const isDevelopment = process.env.NODE_ENV === 'development';

// Get the project root using ES module approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

/**
 * Adjust path for testing mode
 * In testing mode: /opt/apps/x → {projectRoot}/temp/opt/apps/x
 * In production mode: return path unchanged
 */
export function adjustPathForTesting(filePath: string): string {
  if (!isTesting) {
    return filePath;
  }

  // Handle absolute paths
  if (filePath.startsWith('/')) {
    // Remove leading slash and join with temp folder
    const relativePath = filePath.substring(1);
    return path.join(projectRoot, 'temp', relativePath);
  }

  return filePath;
}

export function logTestingMode(message: string): void {
  if (isTesting) {
    console.log(`[TESTING MODE] ${message}`);
  }
}
