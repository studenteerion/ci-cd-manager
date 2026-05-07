import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, updateTeamBranch } from '@/actions/teams';
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
      branch: config.branch,
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
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  const { id } = await params;
  try {
    const { branch } = await request.json();

    if (!branch || typeof branch !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid branch' },
        { status: 400 }
      );
    }

    const result = await updateTeamBranch(id, branch);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update branch';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
