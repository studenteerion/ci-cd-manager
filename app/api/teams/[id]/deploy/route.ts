import { NextRequest, NextResponse } from 'next/server';
import { manualDeployTeam } from '@/actions/teams';
import { requireAuth } from '@/lib/auth/middleware';

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
    const result = await manualDeployTeam(id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deploy team';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
