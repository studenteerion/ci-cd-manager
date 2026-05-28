'use client';

import { useEffect, ReactNode, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('username='));
    const roleCookie = cookies.find(c => c.trim().startsWith('role='));
    const username = userCookie ? decodeURIComponent(userCookie.split('=')[1]) : '';
    const role = roleCookie ? decodeURIComponent(roleCookie.split('=')[1]) : '';

    if (!username) {
      // No session, redirect to login
      router.push('/login');
    } else {
      if (role === 'team') {
        const allowedPrefix = `/dashboard/teams/${username}`;
        if (!pathname.startsWith(allowedPrefix)) {
          router.replace(allowedPrefix);
        }
      }
      setIsAuthenticated(true);
    }
    
    setIsChecking(false);
  }, [router, pathname]);

  if (isChecking) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
