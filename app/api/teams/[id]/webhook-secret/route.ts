import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { readJSON, writeJSON, generateWebhookSecret } from '@/lib/server';
import * as path from 'path';

const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
const HOOKS_JSON_PATH = process.env.WEBHOOK_HOOKS_FILE || path.join(APPS_DIR, 'webhook', 'hooks.json');

export async function GET(
  request: NextRequest,
  { params: paramPromise }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { id } = await paramPromise;
    const teamName = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH, []);
    // Support both id formats (legacy 'deploy-<team>' and current '<team>')
    const teamHook = hooks.find(hook => hook.id === teamName || hook.id === `deploy-${teamName}`);

    if (!teamHook) {
      return NextResponse.json(
        { success: false, message: 'Webhook configuration not found' },
        { status: 404 }
      );
    }

    // Try to extract the secret from common locations inside the hook entry
    let secret: string | undefined;
    const triggerAnd = teamHook['trigger-rule']?.and;
    if (Array.isArray(triggerAnd)) {
      for (const item of triggerAnd) {
        const match = item?.match;
        if (match && match.type === 'payload-hmac-sha256' && match.secret) {
          secret = match.secret;
          break;
        }
      }
    }

    // Fallbacks for alternate structures
    if (!secret) {
      secret = teamHook.key || teamHook.secret || teamHook['trigger-rule']?.match?.secret;
    }

    if (!secret) {
      return NextResponse.json(
        { success: false, message: 'Webhook secret not found in configuration' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      webhookSecret: secret,
    });
  } catch (error) {
    console.error('Failed to get webhook secret:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get webhook secret' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params: paramPromise }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { id } = await paramPromise;
    const teamName = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const hooks = await readJSON<any[]>(HOOKS_JSON_PATH, []);
    const hookIndex = hooks.findIndex(hook => hook.id === teamName || hook.id === `deploy-${teamName}`);

    if (hookIndex === -1) {
      return NextResponse.json(
        { success: false, message: 'Webhook configuration not found' },
        { status: 404 }
      );
    }

    const newSecret = await generateWebhookSecret();

    // Try to place the secret into the trigger-rule.and[].match.secret if present
    const triggerAnd = hooks[hookIndex]['trigger-rule']?.and;
    let written = false;
    if (Array.isArray(triggerAnd)) {
      for (const item of triggerAnd) {
        const match = item?.match;
        if (match && match.type === 'payload-hmac-sha256') {
          match.secret = newSecret;
          written = true;
          break;
        }
      }
    }

    // Fallbacks: set common keys
    if (!written) {
      hooks[hookIndex].key = newSecret;
      hooks[hookIndex].secret = newSecret;
    }

    await writeJSON(HOOKS_JSON_PATH, hooks);

    return NextResponse.json({
      success: true,
      message: 'Webhook secret regenerated successfully',
      webhookSecret: newSecret,
    });
  } catch (error) {
    console.error('Failed to regenerate webhook secret:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to regenerate webhook secret' },
      { status: 500 }
    );
  }
}
