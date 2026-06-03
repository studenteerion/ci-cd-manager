'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Plus, LogOut, User, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

type TeamCreateTask = {
  status: 'pending' | 'success' | 'error';
  teamName: string;
  message?: string;
};

type TeamCreateStepStatus = 'pending' | 'in-progress' | 'done' | 'error';

type TeamCreateStatusFile = {
  teamName: string;
  status: 'pending' | 'success' | 'error';
  steps: Array<{ id: string; label: string; status: TeamCreateStepStatus }>;
  currentStep?: string;
  message?: string;
  startedAt: string;
  updatedAt: string;
};

const TEAM_TASK_STORAGE_KEY = 'team-create-task';

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [teamCreateTask, setTeamCreateTask] = useState<TeamCreateTask | null>(null);
  const [taskDetails, setTaskDetails] = useState<TeamCreateStatusFile | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const clearTeamCreateTask = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(TEAM_TASK_STORAGE_KEY);
    setTeamCreateTask(null);
    setTaskDetails(null);
    window.dispatchEvent(new Event('team-create-task'));
  };

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

  useEffect(() => {
    if (!teamCreateTask) {
      setTaskDetails(null);
      return;
    }

    let active = true;
    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `/api/teams/create-status?team=${encodeURIComponent(teamCreateTask.teamName)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data?.success) return;

        setTaskDetails(data.status as TeamCreateStatusFile);
        if (data.status?.status === 'success') {
          const updated = {
            ...teamCreateTask,
            status: 'success',
            message: data.status?.message || 'Creazione completata',
          };
          window.localStorage.setItem(TEAM_TASK_STORAGE_KEY, JSON.stringify(updated));
          window.dispatchEvent(new Event('team-create-task'));
        }
        if (data.status?.status === 'error') {
          const updated = {
            ...teamCreateTask,
            status: 'error',
            message: data.status?.message || 'Errore durante la creazione',
          };
          window.localStorage.setItem(TEAM_TASK_STORAGE_KEY, JSON.stringify(updated));
          window.dispatchEvent(new Event('team-create-task'));
        }
      } catch (error) {
        // ignore polling errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [teamCreateTask]);

  useEffect(() => {
    const readTask = () => {
      if (typeof window === 'undefined') return;
      const stored = window.localStorage.getItem(TEAM_TASK_STORAGE_KEY);
      if (!stored) {
        setTeamCreateTask(null);
        return;
      }
      try {
        const parsed = JSON.parse(stored) as TeamCreateTask;
        setTeamCreateTask(parsed);
      } catch (error) {
        setTeamCreateTask(null);
      }
    };

    readTask();
    window.addEventListener('storage', readTask);
    window.addEventListener('team-create-task', readTask as EventListener);
    return () => {
      window.removeEventListener('storage', readTask);
      window.removeEventListener('team-create-task', readTask as EventListener);
    };
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
  <div className="w-64 bg-slate-900 text-white min-h-screen fixed left-0 top-0 shadow-lg flex flex-col overflow-x-hidden z-50">
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

        {teamCreateTask && (
          <button
            type="button"
            onClick={() => setTaskModalOpen(true)}
            className="relative mt-6 w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-left transition hover:bg-slate-700"
          >
            <span className="absolute right-2 top-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  clearTeamCreateTask();
                }}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Chiudi notifica task"
              >
                ✕
              </button>
            </span>
            <p className="text-xs uppercase tracking-wide text-slate-400">Tasks</p>
            <div className="mt-2 flex items-start gap-2 text-sm text-slate-200">
              {teamCreateTask.status === 'pending' ? (
                <Loader2 size={16} className="mt-0.5 animate-spin text-blue-400" />
              ) : teamCreateTask.status === 'success' ? (
                <CheckCircle size={16} className="mt-0.5 text-emerald-400" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 text-amber-400" />
              )}
              <div>
                <p className="font-medium">
                  Creazione team {teamCreateTask.teamName}
                </p>
                <p className="text-xs text-slate-400">
                  {teamCreateTask.status === 'pending'
                    ? 'In corso...'
                    : teamCreateTask.status === 'success'
                    ? 'Completata'
                    : 'Errore durante la creazione'}
                </p>
              </div>
            </div>
          </button>
        )}
      </nav>

      {taskModalOpen && teamCreateTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Task</p>
                <h3 className="text-lg font-semibold text-slate-900">
                  Creazione team {teamCreateTask.teamName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="text-slate-600 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Stato</span>
                <span
                  className={`text-xs font-semibold uppercase px-2 py-1 rounded-full ${
                    teamCreateTask.status === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : teamCreateTask.status === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {teamCreateTask.status}
                </span>
              </div>
              {taskDetails?.steps?.length ? (
                <ul className="space-y-2 text-sm">
                  {taskDetails.steps.map((step) => (
                    <li key={step.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700">{step.label}</span>
                      <span
                        className={`text-xs font-semibold uppercase ${
                          step.status === 'done'
                            ? 'text-emerald-600'
                            : step.status === 'error'
                            ? 'text-red-600'
                            : step.status === 'in-progress'
                            ? 'text-blue-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {step.status.replace('-', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Nessun dettaglio disponibile.</p>
              )}
              {taskDetails?.message && (
                <p className="text-xs text-slate-500">{taskDetails.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

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
