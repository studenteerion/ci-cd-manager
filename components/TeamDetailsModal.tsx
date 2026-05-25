'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Cog, Code2, GitBranch, DownloadCloud, RefreshCw } from 'lucide-react';
import { TeamConfig } from '@/actions/teams';
import { BranchSelector } from '@/components/BranchSelector';
import { fetchGitHubBranches, isGitHubRepoUrl } from '@/lib/github/client';
import {
  EnvEntry,
  mergeEnvEntries,
  parseEnvContent,
  serializeEnvEntries,
  validateEnvEntries,
} from '@/lib/env-file';

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
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchStatus, setBranchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [branchError, setBranchError] = useState('');
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [envText, setEnvText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [envUploadOpen, setEnvUploadOpen] = useState(false);
  const [envDragActive, setEnvDragActive] = useState(false);
  const branchFetchAbortRef = useRef<AbortController | null>(null);
  const branchFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchTouchedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      loadTeamConfig();
    }
  }, [isOpen, teamId]);

  useEffect(() => {
    const trimmed = repositoryUrl.trim();
    if (!trimmed) {
      setBranchOptions([]);
      setBranchStatus('idle');
      setBranchError('');
      setDefaultBranch(null);
      return;
    }

    if (!isGitHubRepoUrl(trimmed)) {
      setBranchOptions([]);
      setBranchStatus('error');
      setBranchError('Inserisci un link GitHub valido (es. https://github.com/org/repo).');
      setDefaultBranch(null);
      return;
    }

    if (branchFetchTimeoutRef.current) {
      clearTimeout(branchFetchTimeoutRef.current);
    }
    branchFetchAbortRef.current?.abort();
    const controller = new AbortController();
    branchFetchAbortRef.current = controller;

    setBranchOptions([]);
    setDefaultBranch(null);
    setBranchStatus('loading');
    setBranchError('');

    branchFetchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetchGitHubBranches(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;

        if (!response.success) {
          setBranchOptions([]);
          setBranchStatus('error');
          setBranchError(response.message || 'Impossibile recuperare i branch dal repository.');
          setDefaultBranch(null);
          return;
        }

        setBranchOptions(response.branches);
        setDefaultBranch(response.defaultBranch ?? null);
        setBranchStatus('success');

        if (response.branches.length === 0) {
          setBranchError('Nessun branch disponibile per questo repository.');
          return;
        }

        setBranchError('');
        if (!branchTouchedRef.current) {
          const preferred = response.branches.includes(branch)
            ? branch
            : response.defaultBranch && response.branches.includes(response.defaultBranch)
              ? response.defaultBranch
              : response.branches[0];
          if (preferred) setNewBranch(preferred);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setBranchOptions([]);
        setBranchStatus('error');
        setBranchError('Errore durante il recupero dei branch dal repository.');
        setDefaultBranch(null);
      }
    }, 600);

    return () => {
      if (branchFetchTimeoutRef.current) {
        clearTimeout(branchFetchTimeoutRef.current);
      }
      controller.abort();
    };
  }, [repositoryUrl, branch]);

  const loadTeamConfig = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/env`);
      const data = await response.json();

      if (data.success) {
        const entries: EnvEntry[] = Array.isArray(data.envEntries)
          ? data.envEntries
          : Object.entries(data.env || {}).map(([key, value], index) => ({
              key,
              value: String(value),
              line: index + 1,
            }));
        const envStr = serializeEnvEntries(entries);
        setEnvText(envStr);
        if (data.envParseErrors?.length) {
          setError(`Env parse errors: ${data.envParseErrors.join(' | ')}`);
        }
      } else {
        setError(data.message || 'Failed to load config');
      }

      const branchResponse = await fetch(`/api/teams/${teamId}/branch`);
      const branchData = await branchResponse.json();

      if (branchData.success) {
        setBranch(branchData.branch);
        setNewBranch(branchData.branch);
      }
      if (data.repository) {
        setRepositoryUrl(data.repository);
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
      const parsed = parseEnvContent(envText);
      if (parsed.errors.length > 0) {
        setError(`Malformed .env: ${parsed.errors.join(' | ')}`);
        return;
      }
      const validation = validateEnvEntries(parsed.entries);
      if (validation.errors.length > 0) {
        setError(`Invalid environment variables: ${validation.errors.join(' | ')}`);
        return;
      }

      const response = await fetch(`/api/teams/${teamId}/env`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envEntries: validation.entries }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('✅ Environment variables updated and containers restarted');
        onRefresh();
        await loadTeamConfig();
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

  // File upload handling for .env files - client-side only
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mergeEnvTextWithEntries = (currentText: string, incoming: EnvEntry[]) => {
    const currentParsed = parseEnvContent(currentText);
    const merged = mergeEnvEntries(currentParsed.entries, incoming);
    return serializeEnvEntries(merged);
  };

  const handleFileInputClick = () => fileInputRef.current?.click();

  const processEnvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseEnvContent(text);
      if (parsed.errors.length > 0) {
        setError(`Malformed .env: ${parsed.errors.join(' | ')}`);
        return;
      }
      if (parsed.entries.length === 0) {
        setError('Uploaded file contained no environment variables');
        return;
      }
      const mergedText = mergeEnvTextWithEntries(envText, parsed.entries);
      setEnvText(mergedText);
      setStatus(`Imported ${parsed.entries.length} variables (merged into editor)`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setEnvUploadOpen(false);
    };
    reader.readAsText(file);
  };

  const handleEnvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processEnvFile(file);
  };

  const handleEnvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEnvDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processEnvFile(file);
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

  const handleBranchRefresh = async () => {
    const trimmed = repositoryUrl.trim();
    if (!trimmed || !isGitHubRepoUrl(trimmed)) {
      setBranchError('Inserisci un link GitHub valido (es. https://github.com/org/repo).');
      setBranchStatus('error');
      return;
    }

    if (branchFetchTimeoutRef.current) {
      clearTimeout(branchFetchTimeoutRef.current);
    }
    branchFetchAbortRef.current?.abort();
    const controller = new AbortController();
    branchFetchAbortRef.current = controller;

    setBranchStatus('loading');
    setBranchError('');

    try {
      const response = await fetchGitHubBranches(trimmed, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!response.success) {
        setBranchOptions([]);
        setBranchStatus('error');
        setBranchError(response.message || 'Impossibile recuperare i branch dal repository.');
        setDefaultBranch(null);
        return;
      }

      setBranchOptions(response.branches);
      setDefaultBranch(response.defaultBranch ?? null);
      setBranchStatus('success');

      if (response.branches.length === 0) {
        setBranchError('Nessun branch disponibile per questo repository.');
        return;
      }

      setBranchError('');
      if (!branchTouchedRef.current) {
        const preferred = response.branches.includes(branch)
          ? branch
          : response.defaultBranch && response.branches.includes(response.defaultBranch)
            ? response.defaultBranch
            : response.branches[0];
        if (preferred) setNewBranch(preferred);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setBranchOptions([]);
      setBranchStatus('error');
      setBranchError('Errore durante il recupero dei branch dal repository.');
      setDefaultBranch(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cog size={24} />
            Team: <code className="text-blue-600">{teamId}</code>
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 transition"
            title="Close"
          >
            <X size={24} />
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
              {/* Manual Deploy */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <DownloadCloud size={20} />
                  Manual Deploy
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Trigger the deploy script immediately without waiting for webhook.
                </p>
                <button
                  onClick={handleDeploy}
                  disabled={deploying || saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
                >
                  <DownloadCloud size={18} />
                  {deploying ? 'Deploying...' : 'Deploy Now'}
                </button>
              </div>

              {/* Current Branch */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <GitBranch size={20} />
                  Current Branch
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Webhook is monitoring: <code className="bg-blue-100 px-2 py-1 rounded font-mono text-blue-900">{branch}</code>
                </p>
              </div>

              {/* Branch Selection */}
              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <GitBranch size={20} />
                    Change Branch
                  </h3>
                  <button
                    onClick={handleBranchRefresh}
                    disabled={branchStatus === 'loading' || !repositoryUrl}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 leading-none"
                  >
                    <RefreshCw size={16} />
                    Aggiorna lista
                  </button>
                </div>
                <div className="space-y-3">
                  <BranchSelector
                    branch={newBranch}
                    branches={branchOptions}
                    defaultBranch={defaultBranch}
                    loading={branchStatus === 'loading'}
                    error={branchError}
                    disabled={saving || deploying}
                    placeholderLabel={branchStatus === 'loading'
                      ? 'Scansione branch in corso...'
                      : 'Seleziona un branch dal repository'}
                    onBranchChange={(value) => {
                      branchTouchedRef.current = true;
                      setNewBranch(value);
                    }}
                    onTouched={() => {
                      branchTouchedRef.current = true;
                    }}
                  />
                  <button
                    onClick={handleUpdateBranch}
                    disabled={saving || deploying || newBranch === branch || branchOptions.length === 0}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
                  >
                    {saving ? 'Updating...' : 'Update Branch'}
                  </button>
                </div>
              </div>

              {/* Environment Variables */}
              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Code2 size={20} />
                    Environment Variables
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleEnvFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setEnvUploadOpen(true)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 flex items-center gap-2"
                      title="Upload .env file (will merge into editor, not saved to server)"
                    >
                      <DownloadCloud size={16} />
                      Upload .env
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Format: KEY=VALUE (one per line). Changes will trigger container restart.
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Tip: se il file <code>.env</code> non appare, abilita la visualizzazione dei file nascosti (Ctrl+H).
                </p>
                {envUploadOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <h4 className="text-lg font-semibold text-slate-900">Upload .env</h4>
                        <button
                          type="button"
                          onClick={() => setEnvUploadOpen(false)}
                          className="text-slate-600 hover:text-slate-900"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="p-4">
                        <div
                          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
                            envDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
                          }`}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setEnvDragActive(true);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setEnvDragActive(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            setEnvDragActive(false);
                          }}
                          onDrop={handleEnvDrop}
                        >
                          <DownloadCloud size={28} className="text-slate-500" />
                          <p className="mt-3 text-sm text-slate-700">
                            Trascina qui il file <code>.env</code> oppure
                          </p>
                          <button
                            type="button"
                            onClick={handleFileInputClick}
                            className="mt-3 rounded bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
                          >
                            Sfoglia file
                          </button>
                          <p className="mt-2 text-xs text-slate-500">I file non vengono salvati sul server.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
                  {saving ? 'Saving...' : 'Save & Restart Containers'}
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
