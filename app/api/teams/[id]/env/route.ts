import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, updateTeamEnv } from '@/actions/teams';
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
    const { envContent } = await request.json();

    if (!envContent || typeof envContent !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid env content' },
        { status: 400 }
      );
    }

    // Parse envContent string into object
    const env: Record<string, string> = {};
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    const result = await updateTeamEnv(id, env);

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
    const { env } = await request.json();

    if (!env || typeof env !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid env variables' },
        { status: 400 }
      );
    }

    const result = await updateTeamEnv(id, env);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update environment';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
