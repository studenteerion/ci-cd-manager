'use client';

import { ToastProvider } from '@/lib/context/ToastContext';
import { ToastContainer } from '@/components/ToastContainer';
import { ReactNode } from 'react';

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ToastContainer />
      {children}
    </ToastProvider>
  );
}
