import { NextRequest, NextResponse } from 'next/server';
import { getTeamHostPort, updateTeamHostPort } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

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
    const result = await getTeamHostPort(id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      hostPort: result.hostPort,
      domain: result.domain,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to get team host port' },
      { status: 500 }
    );
  }
}

async function handlePortUpdate(
  request: NextRequest,
  { params: paramPromise }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { id } = await paramPromise;
    const { hostPort } = await request.json();

    if (!hostPort || hostPort < 1000 || hostPort > 65535) {
      return NextResponse.json(
        { success: false, message: 'Invalid port number (must be 1000-65535)' },
        { status: 400 }
      );
    }

    const result = await updateTeamHostPort(id, hostPort);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to update host port' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlePortUpdate(request, ctx);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handlePortUpdate(request, ctx);
}
