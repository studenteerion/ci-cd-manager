import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes - only /login and /api/auth/* are allowed without session
  const isLoginPage = pathname === '/login' || pathname === '/';
  const isAuthApi = pathname.startsWith('/api/auth/');
  const isPublic = isLoginPage || isAuthApi;

  if (isPublic) {
    return NextResponse.next();
  }

  // For all other routes, require session cookie
  const session = request.cookies.get('session')?.value;

  if (!session) {
    // If it's an API route, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized - no session' },
        { status: 401 }
      );
    }
    // If it's a page route, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};

