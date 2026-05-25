import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, updateTeamEnv } from '@/actions/teams';
import {
  EnvEntry,
  parseEnvContent,
  recordToEnvEntries,
  validateEnvEntries,
} from '@/lib/env-file';
import { requireAuth } from '@/lib/auth/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  try {
    const config = await getTeamConfig(id);
    
    if (!config) {
      return NextResponse.json(
        { success: false, message: 'Team not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      env: config.env,
      domain: config.domain,
      repository: config.repository,
      envEntries: config.envEntries,
      envParseErrors: config.envParseErrors,
      envParseWarnings: config.envParseWarnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get team config';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const envEntriesPayload = body?.envEntries as EnvEntry[] | undefined;
    const envContent = body?.envContent as string | undefined;
    const envRecord = body?.env as Record<string, string> | undefined;

    let envEntries: EnvEntry[] = [];

    if (Array.isArray(envEntriesPayload)) {
      envEntries = envEntriesPayload;
    } else if (typeof envContent === 'string') {
      const parsed = parseEnvContent(envContent);
      if (parsed.errors.length > 0) {
        return NextResponse.json(
          { success: false, message: `Malformed .env: ${parsed.errors.join(' | ')}` },
          { status: 400 }
        );
      }
      envEntries = parsed.entries;
    } else if (envRecord && typeof envRecord === 'object') {
      envEntries = recordToEnvEntries(envRecord);
    } else {
      return NextResponse.json(
        { success: false, message: 'Invalid env payload' },
        { status: 400 }
      );
    }

    const validation = validateEnvEntries(envEntries);
    if (validation.errors.length > 0) {
      return NextResponse.json(
        { success: false, message: `Invalid environment variables: ${validation.errors.join(' | ')}` },
        { status: 400 }
      );
    }

    const result = await updateTeamEnv(id, validation.entries);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update environment';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const envEntries = Array.isArray(body?.envEntries)
      ? (body.envEntries as EnvEntry[])
      : body?.env && typeof body.env === 'object'
        ? recordToEnvEntries(body.env as Record<string, string>)
        : [];

    if (envEntries.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid env variables' },
        { status: 400 }
      );
    }

    const validation = validateEnvEntries(envEntries);
    if (validation.errors.length > 0) {
      return NextResponse.json(
        { success: false, message: `Invalid environment variables: ${validation.errors.join(' | ')}` },
        { status: 400 }
      );
    }

    const result = await updateTeamEnv(id, validation.entries);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update environment';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
