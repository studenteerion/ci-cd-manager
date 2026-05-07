import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function requireAuth(request: NextRequest): Promise<{ authenticated: boolean; response?: NextResponse }> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;

  if (!session) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized - no session' },
        { status: 401 }
      ),
    };
  }

  return { authenticated: true };
}
