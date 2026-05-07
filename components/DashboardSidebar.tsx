'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Plus, LogOut } from 'lucide-react';

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (path: string) => pathname === path;

  const handleLogout = () => {
    document.cookie =
      'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    router.push('/login');
  };

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen fixed left-0 top-0 shadow-lg">
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
      <nav className="p-4 space-y-2">
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
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition text-white"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
