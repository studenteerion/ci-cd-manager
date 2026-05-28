import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, createSessionToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';

    if (!normalizedUsername || !normalizedPassword) {
      return NextResponse.json(
        { success: false, message: 'Username and password are required' },
        { status: 400 }
      );
    }

    const verification = await verifyCredentials(normalizedUsername, normalizedPassword);

    if (!verification.valid) {
      const message = verification.reason === 'inactive'
        ? 'Credenziali disattivate'
        : 'Credenziali non valide';
      return NextResponse.json(
        { success: false, message },
        { status: verification.reason === 'inactive' ? 403 : 401 }
      );
    }

    const token = createSessionToken();
    const response = NextResponse.json({
      success: true,
      message: 'Login effettuato',
      role: verification.user?.role,
      username: verification.user?.username,
    });

    // Set secure session cookie with username
    response.cookies.set({
      name: 'session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    // Set non-httpOnly cookie with username for client-side access
    response.cookies.set({
      name: 'username',
      value: normalizedUsername,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    response.cookies.set({
      name: 'role',
      value: verification.user?.role || 'admin',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred' },
      { status: 500 }
    );
  }
}
