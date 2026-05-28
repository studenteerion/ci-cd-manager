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
    const body = (await request.json().catch(() => ({}))) as {
      commit?: string;
      branch?: string;
    };
    const commit = typeof body.commit === 'string' ? body.commit.trim() : '';
    const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
    if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) {
      return NextResponse.json(
        { success: false, message: 'Commit hash non valido.' },
        { status: 400 }
      );
    }
    if (branch && !/^[\w./-]{1,200}$/.test(branch)) {
      return NextResponse.json(
        { success: false, message: 'Branch non valido.' },
        { status: 400 }
      );
    }

    const result = await manualDeployTeam(id, commit || undefined, branch || undefined);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deploy team';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
