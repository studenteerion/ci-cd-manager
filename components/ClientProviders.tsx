'use client';

import { ToastProvider } from '@/lib/context/ToastContext';
import { ToastContainer } from '@/components/ToastContainer';
import { ReactNode } from 'react';
import { ThemeProvider } from '@/lib/context/ThemeContext';

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ToastContainer />
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}
