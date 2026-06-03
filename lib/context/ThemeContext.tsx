'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'theme-preference';
const THEME_PREF_ATTR = 'data-theme-pref';

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
    }
  }, []);

  const applyTheme = useCallback((nextTheme: ThemePreference) => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const systemTheme = getSystemTheme();
    const resolved = nextTheme === 'system' ? systemTheme : nextTheme;

    root.setAttribute('data-theme', resolved);
    root.setAttribute(THEME_PREF_ATTR, nextTheme);
    root.style.colorScheme = resolved;
    setResolvedTheme(resolved);
  }, []);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
      applyTheme(next);
    },
    [applyTheme]
  );

  useEffect(() => {
    applyTheme(theme);

    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme(theme);
      }
    };

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [applyTheme, theme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
