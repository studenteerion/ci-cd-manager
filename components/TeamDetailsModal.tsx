'use client';

import { useState, useEffect } from 'react';
import { TeamConfig } from '@/actions/teams';

interface TeamDetailsModalProps {
  teamId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function TeamDetailsModal({ teamId, isOpen, onClose, onRefresh }: TeamDetailsModalProps) {
  const [config, setConfig] = useState<TeamConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [branch, setBranch] = useState('main');
  const [newBranch, setNewBranch] = useState('');
  const [envText, setEnvText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadTeamConfig();
    }
  }, [isOpen, teamId]);

  const loadTeamConfig = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/env`);
      const data = await response.json();

      if (data.success) {
        const envStr = Object.entries(data.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
        setEnvText(envStr);
      } else {
        setError(data.message || 'Failed to load config');
      }

      const branchResponse = await fetch(`/api/teams/${teamId}/branch`);
      const branchData = await branchResponse.json();

      if (branchData.success) {
        setBranch(branchData.branch);
        setNewBranch(branchData.branch);
      }
    } catch (err) {
      setError('Failed to load team configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEnv = async () => {
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const env: Record<string, string> = {};
      envText.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          env[key.trim()] = value.trim();
        }
      });

      const response = await fetch(`/api/teams/${teamId}/env`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('✅ Environment variables updated and containers restarted');
        onRefresh();
      } else {
        setError(data.message || 'Failed to save environment variables');
      }
    } catch (err) {
      setError('Failed to save environment variables');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/deploy`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setStatus('✅ Deployment triggered successfully');
        onRefresh();
      } else {
        setError(data.message || 'Failed to deploy');
      }
    } catch (err) {
      setError('Failed to trigger deployment');
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const handleUpdateBranch = async () => {
    if (newBranch === branch) {
      setError('Please select a different branch');
      return;
    }

    setSaving(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/branch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: newBranch }),
      });

      const data = await response.json();

      if (data.success) {
        setBranch(newBranch);
        setStatus('✅ Branch updated and webhook restarted');
        onRefresh();
      } else {
        setError(data.message || 'Failed to update branch');
      }
    } catch (err) {
      setError('Failed to update branch');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Team: <code className="text-blue-600">{teamId}</code>
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Messages */}
          {status && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-900 font-medium">
              {status}
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-900 font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-600">Loading team configuration...</div>
          ) : (
            <>
              {/* Current Branch */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">
                  📦 Current Branch
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Webhook is monitoring: <code className="bg-blue-100 px-2 py-1 rounded font-mono text-blue-900">{branch}</code>
                </p>
              </div>

              {/* Branch Selection */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  🔀 Change Branch
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    placeholder="Enter branch name (e.g., main, develop, production)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                  />
                  <button
                    onClick={handleUpdateBranch}
                    disabled={saving || deploying || newBranch === branch}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
                  >
                    {saving ? 'Updating...' : 'Update Branch'}
                  </button>
                </div>
              </div>

              {/* Environment Variables */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  🔐 Environment Variables
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Format: KEY=VALUE (one per line). Changes will trigger container restart.
                </p>
                <textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  className="w-full h-48 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm text-slate-900 placeholder-slate-500"
                  placeholder="API_KEY=value
DATABASE_URL=value
DEBUG=true"
                />
                <button
                  onClick={handleSaveEnv}
                  disabled={saving || deploying}
                  className="mt-3 w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
                >
                  {saving ? 'Saving...' : '💾 Save & Restart Containers'}
                </button>
              </div>

              {/* Manual Deploy */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  🚀 Manual Deploy
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Trigger the deploy script immediately without waiting for webhook.
                </p>
                <button
                  onClick={handleDeploy}
                  disabled={deploying || saving}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
                >
                  {deploying ? 'Deploying...' : '🚀 Deploy Now'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-900 rounded-lg hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
