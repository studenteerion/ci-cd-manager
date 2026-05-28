'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Plus, LogOut, User } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Read username from cookie
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('username='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      setUsername(decodeURIComponent(user));
    }
    const roleCookie = cookies.find(c => c.trim().startsWith('role='));
    if (roleCookie) {
      const userRole = roleCookie.split('=')[1];
      setRole(decodeURIComponent(userRole));
    }
  }, []);

  const isActive = (path: string) => pathname === path;

  const handleLogout = () => {
    document.cookie =
      'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie =
      'username=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie =
      'role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    router.push('/login');
  };

  return (
  <div className="w-64 bg-slate-900 text-white min-h-screen fixed left-0 top-0 shadow-lg flex flex-col overflow-x-hidden">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <LayoutGrid size={20} />
          </div>
          Dashboard
        </h1>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {role !== 'team' ? (
          <>
            <Link
              href="/dashboard/teams"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive('/dashboard/teams')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutGrid size={20} />
              <span>Teams</span>
            </Link>

            <Link
              href="/dashboard/create-team"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive('/dashboard/create-team')
                  ? 'bg-green-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Plus size={20} />
              <span>Create Team</span>
            </Link>
          </>
        ) : (
          username && (
            <Link
              href={`/dashboard/teams/${username}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                pathname.startsWith(`/dashboard/teams/${username}`)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutGrid size={20} />
              <span>Il mio team</span>
            </Link>
          )
        )}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-slate-700 p-4 space-y-4">
        <ThemeToggle />
        {/* User Info */}
        {username && (
          <div className="px-4 py-3 bg-slate-800 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Accesso come</p>
              <p className="text-sm font-medium text-white truncate">{username}</p>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition text-white font-medium"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
