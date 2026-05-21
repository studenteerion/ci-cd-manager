import { NextRequest, NextResponse } from 'next/server';
import { getTeamHostPort } from '@/actions/teams';
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

export async function PATCH() {
  return NextResponse.json(
    { success: false, message: 'Host port updates are managed automatically.' },
    { status: 405 }
  );
}

export async function POST() {
  return NextResponse.json(
    { success: false, message: 'Host port updates are managed automatically.' },
    { status: 405 }
  );
}
