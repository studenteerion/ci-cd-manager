import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, updateTeamEnv } from '@/actions/teams';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get team config';
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
