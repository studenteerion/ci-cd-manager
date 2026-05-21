'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/context/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const baseButton =
    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition border';

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="text-xs uppercase tracking-wide text-slate-400">Theme</span>
      <div className="grid grid-cols-1 gap-2 w-full">
        <button
          type="button"
          onClick={() => setTheme('system')}
          className={`${baseButton} w-full justify-between ${
            theme === 'system'
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Monitor size={14} />
            System
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`${baseButton} w-full justify-between ${
            theme === 'light'
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Sun size={14} />
            Light
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`${baseButton} w-full justify-between ${
            theme === 'dark'
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Moon size={14} />
            Dark
          </span>
        </button>
      </div>
    </div>
  );
}
