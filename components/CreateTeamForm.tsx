'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { DownloadCloud } from 'lucide-react';
import {
  EnvEntry,
  mergeEnvEntries,
  parseEnvContent,
  validateEnvEntries,
} from '@/lib/env-file';
import { BranchSelector } from '@/components/BranchSelector';
import { fetchGitHubBranches, isGitHubRepoUrl } from '@/lib/github/client';

interface EnvVariable {
  key: string;
  value: string;
}

interface CreateTeamFormProps {
  onSuccess: () => void;
}

type TeamCreatePayload = {
  teamName: string;
  repositoryUrl: string;
  domain: string;
  branch: string;
  envEntries: EnvEntry[];
};

type TeamCreateTask = {
  status: 'pending' | 'success' | 'error';
  teamName: string;
  message?: string;
  startedAt: string;
  payload: TeamCreatePayload;
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

export function CreateTeamForm({ onSuccess }: CreateTeamFormProps) {
  const [teamName, setTeamName] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [domain, setDomain] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [branch, setBranch] = useState('');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchStatus, setBranchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [branchError, setBranchError] = useState('');
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([
    { key: '', value: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || '';
  const computedDomain = baseDomain
    ? (subdomain ? `${subdomain}.${baseDomain}` : '')
    : domain;
  const [envUploadOpen, setEnvUploadOpen] = useState(false);
  const [envDragActive, setEnvDragActive] = useState(false);
  const branchFetchAbortRef = useRef<AbortController | null>(null);
  const branchFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchTouchedRef = useRef(false);
  const [activeTaskName, setActiveTaskName] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TeamCreateStatusFile | null>(null);

  const persistTask = useCallback((task: TeamCreateTask | null) => {
    if (typeof window === 'undefined') return;
    if (task) {
      window.localStorage.setItem(TEAM_TASK_STORAGE_KEY, JSON.stringify(task));
    } else {
      window.localStorage.removeItem(TEAM_TASK_STORAGE_KEY);
    }
    window.dispatchEvent(new Event('team-create-task'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loadTask = () => {
      const stored = window.localStorage.getItem(TEAM_TASK_STORAGE_KEY);
      if (!stored) {
        setActiveTaskName(null);
        return;
      }
      try {
        const task = JSON.parse(stored) as TeamCreateTask;
        if (task.status === 'pending') {
          setActiveTaskName(task.teamName);
        }
      } catch {
        setActiveTaskName(null);
      }
    };

    loadTask();
    window.addEventListener('storage', loadTask);
    window.addEventListener('team-create-task', loadTask as EventListener);
    return () => {
      window.removeEventListener('storage', loadTask);
      window.removeEventListener('team-create-task', loadTask as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!activeTaskName) {
      setTaskStatus(null);
      return;
    }

    let active = true;
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/teams/create-status?team=${encodeURIComponent(activeTaskName)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data?.success) return;
        setTaskStatus(data.status as TeamCreateStatusFile);

        if (data.status?.status === 'success') {
          const stored = window.localStorage.getItem(TEAM_TASK_STORAGE_KEY);
          if (stored) {
            const task = JSON.parse(stored) as TeamCreateTask;
            persistTask({ ...task, status: 'success', message: 'Creazione completata' });
          }
          setSuccess('Creazione completata.');
          setTimeout(() => persistTask(null), 5000);
        }
        if (data.status?.status === 'error') {
          setError(data.status?.message || 'Errore durante la creazione del team');
          const stored = window.localStorage.getItem(TEAM_TASK_STORAGE_KEY);
          if (stored) {
            const task = JSON.parse(stored) as TeamCreateTask;
            persistTask({ ...task, status: 'error', message: data.status?.message });
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeTaskName, persistTask]);

  const handleAddEnvVar = () => {
    setEnvVariables([...envVariables, { key: '', value: '' }]);
  };

  const handleTeamNameChange = (value: string) => {
    const normalized = value.replace(/\s+/g, '');
    setTeamName(normalized);
    if (baseDomain && normalized && !subdomainTouched) {
      setSubdomain(normalized);
    }
  };

  const handleTeamNameBlur = () => {
    if (baseDomain && teamName && !subdomainTouched) {
      setSubdomain(teamName.replace(/\s+/g, ''));
    }
  };

  const handleRepositoryChange = (value: string) => {
    setRepositoryUrl(value);
    branchTouchedRef.current = false;
  };

  const toEnvEntries = (vars: EnvVariable[]): EnvEntry[] =>
    vars
      .filter((env) => env.key.trim() || env.value.trim())
      .map((env, index) => ({
        key: env.key.trim(),
        value: env.value ?? '',
        line: index + 1,
      }));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      const existingKeys = new Set(envVariables.map((v) => v.key).filter(Boolean));
      const mergedEntries = mergeEnvEntries(toEnvEntries(envVariables), parsed.entries);
      const merged = mergedEntries.map((entry) => ({ key: entry.key, value: entry.value }));
      let added = 0;
      let updated = 0;
      parsed.entries.forEach((entry) => {
        if (existingKeys.has(entry.key)) updated += 1; else added += 1;
      });
      setEnvVariables(merged.length > 0 ? merged : [{ key: '', value: '' }]);
      setSuccess(`Imported ${parsed.entries.length} variables (${updated} updated, ${added} added)`);
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

  const handleRemoveEnvVar = (index: number) => {
    setEnvVariables(envVariables.filter((_, i) => i !== index));
  };

  const handleEnvVarChange = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const updated = [...envVariables];
    updated[index][field] = value;
    setEnvVariables(updated);
  };

  useEffect(() => {
    const trimmed = repositoryUrl.trim();
    if (!trimmed) {
      setBranchOptions([]);
      setBranchStatus('idle');
      setBranchError('');
      setDefaultBranch(null);
      setBranch('');
      return;
    }

    if (!isGitHubRepoUrl(trimmed)) {
      setBranchOptions([]);
      setBranchStatus('error');
      setBranchError('Inserisci un link GitHub valido (es. https://github.com/org/repo).');
      setDefaultBranch(null);
      setBranch('');
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
        console.info('[GitHub] Fetching branches', { repositoryUrl: trimmed });
        const response = await fetchGitHubBranches(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;

        if (!response.success) {
          setBranchOptions([]);
          setBranchStatus('error');
          setBranchError(response.message || 'Impossibile recuperare i branch dal repository.');
          setDefaultBranch(null);
          setBranch('');
          console.warn('[GitHub] Branch fetch failed', response.message);
          return;
        }

        setBranchOptions(response.branches);
        setDefaultBranch(response.defaultBranch ?? null);
        setBranchStatus('success');

        if (response.branches.length === 0) {
          setBranch('');
          setBranchError('Nessun branch disponibile per questo repository.');
          return;
        }

        setBranchError('');
        if (!branchTouchedRef.current) {
          const preferred = response.defaultBranch && response.branches.includes(response.defaultBranch)
            ? response.defaultBranch
            : response.branches[0];
          if (preferred) setBranch(preferred);
        }
        console.info('[GitHub] Branch fetch success', {
          total: response.branches.length,
          defaultBranch: response.defaultBranch,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('[GitHub] Branch fetch error', error);
        setBranchOptions([]);
        setBranchStatus('error');
        setBranchError('Errore durante il recupero dei branch dal repository.');
        setDefaultBranch(null);
        setBranch('');
      }
    }, 600);

    return () => {
      if (branchFetchTimeoutRef.current) {
        clearTimeout(branchFetchTimeoutRef.current);
      }
      controller.abort();
    };
  }, [repositoryUrl]);

  const executeCreateTeam = useCallback(
    async (payload: TeamCreatePayload, options?: { resume?: boolean }) => {
      setError('');
      setSuccess('');
      setLoading(true);

      const task: TeamCreateTask = {
        status: 'pending',
        teamName: payload.teamName,
        startedAt: new Date().toISOString(),
        payload,
      };
      persistTask(task);

      try {
        const response = await fetch('/api/teams/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success) {
          const passwordInfo = data.teamPassword
            ? ` Password team: ${data.teamPassword}`
            : '';
          const message = `Team creato con successo. Webhook secret: ${data.webhookSecret}.${passwordInfo}`;
          setSuccess(message);
          persistTask({
            ...task,
            status: 'success',
            message,
          });

          setTeamName('');
          setRepositoryUrl('');
          setDomain('');
          setSubdomain('');
          setSubdomainTouched(false);
          setBranch('');
          setBranchOptions([]);
          setBranchStatus('idle');
          setBranchError('');
          setDefaultBranch(null);
          setEnvVariables([{ key: '', value: '' }]);

          setTimeout(() => {
            persistTask(null);
          }, 5000);

          if (!options?.resume) {
            setTimeout(onSuccess, 1000);
          }
        } else {
          const message = data.message || 'Failed to create team';
          setError(message);
          persistTask({
            ...task,
            status: 'error',
            message,
          });
        }
      } catch (err) {
        const message = 'An error occurred. Please try again.';
        setError(message);
        persistTask({
          ...task,
          status: 'error',
          message,
        });
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, persistTask]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(TEAM_TASK_STORAGE_KEY);
    if (!stored) return;

    try {
      const task = JSON.parse(stored) as TeamCreateTask;
      if (task.status !== 'pending') return;

      setTeamName(task.payload.teamName);
      setRepositoryUrl(task.payload.repositoryUrl);
      setBranch(task.payload.branch);
      setEnvVariables(
        task.payload.envEntries.length
          ? task.payload.envEntries.map((entry) => ({ key: entry.key, value: entry.value }))
          : [{ key: '', value: '' }]
      );

      if (baseDomain && task.payload.domain.endsWith(`.${baseDomain}`)) {
        setSubdomain(task.payload.domain.replace(`.${baseDomain}`, ''));
        setSubdomainTouched(true);
      } else {
        setDomain(task.payload.domain);
      }
    } catch (error) {
      console.error('Failed to load pending team creation task', error);
    }
  }, [baseDomain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    try {
      const finalDomain = baseDomain ? computedDomain : domain;
      if (!teamName || !repositoryUrl || !finalDomain) {
        setError('Please fill in all required fields');
        return;
      }

      if (/\s/.test(teamName) || /\s/.test(finalDomain)) {
        setError('Team name and domain cannot contain spaces');
        return;
      }

      if (!branchOptions.length || !branch) {
        setError('Seleziona un branch dal repository GitHub');
        return;
      }

      if (envVariables.some((env) => !env.key.trim() && env.value.trim())) {
        setError('Environment variable keys cannot be empty when a value is provided');
        return;
      }

      const envEntries = toEnvEntries(envVariables);
      const validation = validateEnvEntries(envEntries);
      if (validation.errors.length > 0) {
        setError(`Invalid environment variables: ${validation.errors.join(' | ')}`);
        return;
      }

      await executeCreateTeam({
        teamName,
        repositoryUrl,
        domain: finalDomain,
        branch,
        envEntries: validation.entries,
      });
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Plus size={24} />
        Create New Team
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Team Name
            <span className="ml-2 text-xs font-semibold uppercase text-red-500">Required</span>
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => handleTeamNameChange(e.target.value)}
            onBlur={handleTeamNameBlur}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
            placeholder="e.g., alpha, beta"
            disabled={loading}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Repository URL (HTTPS)
            <span className="ml-2 text-xs font-semibold uppercase text-red-500">Required</span>
          </label>
          <input
            type="url"
            value={repositoryUrl}
            onChange={(e) => handleRepositoryChange(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
            placeholder="https://github.com/org/repo.git"
            disabled={loading}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            {baseDomain ? 'Subdomain' : 'Domain'}
            <span className="ml-2 text-xs font-semibold uppercase text-red-500">Required</span>
          </label>
          {baseDomain ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => {
                    setSubdomain(e.target.value.replace(/\s+/g, ''));
                    setSubdomainTouched(true);
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                  placeholder="e.g., alpha"
                  disabled={loading}
                  required
                />
                <span className="text-sm text-slate-500">.{baseDomain}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Full domain: {computedDomain || `your-team.${baseDomain}`}
              </p>
            </div>
          ) : (
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value.replace(/\s+/g, ''))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
              placeholder="alpha.example.com"
              disabled={loading}
              required
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">
            Branch
            <span className="ml-2 text-xs font-semibold uppercase text-red-500">Required</span>
          </label>
          <BranchSelector
            branch={branch}
            branches={branchOptions}
            defaultBranch={defaultBranch}
            loading={branchStatus === 'loading'}
            error={branchError}
            disabled={loading || !isGitHubRepoUrl(repositoryUrl)}
            placeholderLabel="Inserisci il link del repository"
            onBranchChange={setBranch}
            onTouched={() => {
              branchTouchedRef.current = true;
            }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="block text-sm font-medium text-slate-900">
              Environment Variables
              <span className="ml-2 text-xs font-semibold uppercase text-slate-400">Optional</span>
            </span>
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
                disabled={loading}
              >
                <DownloadCloud size={16} />
                Upload .env
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
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
          <div className="space-y-2">
            {envVariables.map((env, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={env.key}
                  onChange={(e) =>
                    handleEnvVarChange(index, 'key', e.target.value)
                  }
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                  placeholder="KEY"
                  disabled={loading}
                />
                <input
                  type="text"
                  value={env.value}
                  onChange={(e) =>
                    handleEnvVarChange(index, 'value', e.target.value)
                  }
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                  placeholder="value"
                  disabled={loading}
                />
                {envVariables.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveEnvVar(index)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    disabled={loading}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddEnvVar}
            className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            disabled={loading}
          >
            <Plus size={16} />
            Add Variable
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-900 text-sm font-medium">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Creating Team...' : 'Create Team'}
        </button>

        {taskStatus && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Creazione team {taskStatus.teamName}
                </p>
                <p className="text-xs text-slate-600">
                  {taskStatus.status === 'pending'
                    ? 'In corso...'
                    : taskStatus.status === 'success'
                    ? 'Completata'
                    : 'Errore durante la creazione'}
                </p>
              </div>
              <span
                className={`text-xs font-semibold uppercase px-2 py-1 rounded-full ${
                  taskStatus.status === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : taskStatus.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {taskStatus.status}
              </span>
            </div>
            {taskStatus.steps?.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {taskStatus.steps.map((step) => (
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
            )}
            {taskStatus.message && (
              <p className="mt-3 text-xs text-slate-500">{taskStatus.message}</p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
