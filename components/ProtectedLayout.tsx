'use client';

import { useEffect, ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if we have a username cookie (set alongside the httpOnly session cookie)
    const hasCookie = document.cookie.includes('username=');

    if (!hasCookie) {
      // No session, redirect to login
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
    
    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
