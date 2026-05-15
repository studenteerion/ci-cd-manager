'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/lib/context/ToastContext';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

interface ToastProps {
  toast: ReturnType<typeof useToast>['toasts'][0];
  onRemove: (id: string) => void;
}

function Toast({ toast, onRemove }: ToastProps) {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 10000;

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 10);

    return () => clearInterval(interval);
  }, [duration]);

  const bgColor = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  }[toast.type];

  const textColor = {
    success: 'text-green-800',
    error: 'text-red-800',
    info: 'text-blue-800',
  }[toast.type];

  const Icon = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  }[toast.type];

  const iconColor = {
    success: 'text-green-500',
    error: 'text-red-500',
    info: 'text-blue-500',
  }[toast.type];

  return (
    <div
      className={`${bgColor} border rounded-lg shadow-lg p-4 flex items-start gap-3 pointer-events-auto min-w-80 animate-slide-in`}
    >
      <Icon size={20} className={iconColor} />
      <div className="flex-1">
        <p className={`${textColor} font-medium text-sm`}>{toast.message}</p>
        <div className="w-full bg-gray-200 rounded-full h-1 mt-2 overflow-hidden">
          <div
            className={`h-full ${
              toast.type === 'success'
                ? 'bg-green-500'
                : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            } transition-all`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`${textColor} text-xs mt-1`}>
          {Math.ceil(progress / 10)}s
        </p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className={`${textColor} hover:opacity-70 transition flex-shrink-0`}
      >
        <X size={18} />
      </button>
    </div>
  );
}
