'use client';

import { Loader2 } from 'lucide-react';

interface BranchSelectorProps {
  branch: string;
  branches: string[];
  defaultBranch?: string | null;
  loading: boolean;
  error?: string;
  disabled?: boolean;
  placeholderLabel: string;
  onBranchChange: (value: string) => void;
  onTouched: () => void;
}

export function BranchSelector({
  branch,
  branches,
  defaultBranch,
  loading,
  error,
  disabled = false,
  placeholderLabel,
  onBranchChange,
  onTouched,
}: BranchSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1">
        Git Branch
        {loading && (
          <span className="ml-2 inline-flex items-center text-xs text-blue-600">
            <Loader2 size={14} className="mr-1 animate-spin" />
            Scanning…
          </span>
        )}
      </label>

      <div className="space-y-2">
        <select
          value={branch || '__placeholder__'}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '__placeholder__') return;
            onTouched();
            onBranchChange(value);
          }}
          disabled={disabled}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
        >
          {branches.length === 0 ? (
            <option value="__placeholder__">{placeholderLabel}</option>
          ) : (
            branches.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))
          )}
        </select>
        {defaultBranch && branches.length > 0 && (
          <p className="text-xs text-slate-600">
            Default branch detected: <span className="font-medium">{defaultBranch}</span>
          </p>
        )}
        {branches.length === 0 && !loading && (
          <p className="text-xs text-slate-600">
            {placeholderLabel}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
