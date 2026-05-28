import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByUsername } from '@/lib/auth';

export async function requireAuth(
  request: NextRequest
): Promise<{ authenticated: boolean; response?: NextResponse; user?: { username: string; role: string; status: string } }> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const username = cookieStore.get('username')?.value;

  if (!session || !username) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized - no session' },
        { status: 401 }
      ),
    };
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized - user not found' },
        { status: 401 }
      ),
    };
  }

  if (user.status === 'inactive') {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Credenziali disattivate' },
        { status: 403 }
      ),
    };
  }

  return { authenticated: true, user };
}
