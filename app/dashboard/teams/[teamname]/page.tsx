'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { ChevronLeft, Cog, GitBranch, Code2, DownloadCloud, Zap, Plus, X, Circle, Eye, EyeOff, Copy, RotateCw, FileText, RefreshCw } from 'lucide-react';
import { useToast } from '@/lib/context/ToastContext';

interface TeamConfig {
  hostPort?: number;
  domain?: string;
  env?: Record<string, string>;
  branch?: string;
  containerStatus?: string;
}

interface EnvVariable {
  key: string;
  value: string;
}

export default function TeamDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const teamName = params.teamname as string;

  const [config, setConfig] = useState<TeamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [containerStatus, setContainerStatus] = useState<string>('');
  const [containerName, setContainerName] = useState<string>('');
  const [branch, setBranch] = useState('main');
  const [newBranch, setNewBranch] = useState('');
  const [newPort, setNewPort] = useState<number | ''>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsText, setLogsText] = useState('');
  const [logsError, setLogsError] = useState('');
  const logsRef = useRef<HTMLDivElement | null>(null);
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([
    { key: '', value: '' },
  ]);
  const envFileInputRef = useRef<HTMLInputElement | null>(null);
  const [envUploadOpen, setEnvUploadOpen] = useState(false);
  const [envDragActive, setEnvDragActive] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadTeamConfig();
  }, [teamName]);

  useEffect(() => {
    if (logsOpen && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logsOpen, logsText]);

  const handleAddEnvVar = () => {
    setEnvVariables([...envVariables, { key: '', value: '' }]);
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

  const parseEnvContent = (text: string) => {
    const result: Record<string, string> = {};
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const valuePart = line.slice(idx + 1).trim();
      const hashIdx = valuePart.indexOf('#');
      const value = (hashIdx >= 0 ? valuePart.slice(0, hashIdx) : valuePart).trim();
      if (key) result[key] = value;
    });
    return result;
  };

  const mergeEnvArrayWithObject = (
    current: EnvVariable[],
    parsed: Record<string, string>
  ) => {
    const order: string[] = [];
    const map = new Map<string, string>();

    current.forEach(({ key, value }) => {
      if (key) {
        if (!order.includes(key)) order.push(key);
        map.set(key, value);
      }
    });

    Object.entries(parsed).forEach(([k, v]) => {
      if (!order.includes(k)) order.push(k);
      map.set(k, v);
    });

    const merged = order.map((k) => ({ key: k, value: map.get(k) || '' }));
    if (merged.length === 0) merged.push({ key: '', value: '' });
    return merged;
  };

  const handleEnvUploadClick = () => envFileInputRef.current?.click();

  const handleEnvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseEnvContent(text);
      if (Object.keys(parsed).length === 0) {
        addToast('Uploaded file contained no environment variables', 'error');
        return;
      }
      const existingKeys = new Set(envVariables.map((v) => v.key).filter(Boolean));
      const merged = mergeEnvArrayWithObject(envVariables, parsed);
      let added = 0;
      let updated = 0;
      Object.keys(parsed).forEach((k) => {
        if (existingKeys.has(k)) updated++; else added++;
      });
      setEnvVariables(merged);
      addToast(`Imported ${Object.keys(parsed).length} variables (${updated} updated, ${added} added)`, 'success');
      if (envFileInputRef.current) envFileInputRef.current.value = '';
      setEnvUploadOpen(false);
    };
    reader.readAsText(file);
  };

  const handleEnvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEnvDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleEnvFileUpload(event);
    }
  };

  const loadTeamConfig = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const [envRes, branchRes, portRes, statusRes, webhookRes] = await Promise.all([
        fetch(`/api/teams/${teamName}/env`),
        fetch(`/api/teams/${teamName}/branch`),
        fetch(`/api/teams/${teamName}/port`),
        fetch(`/api/teams/${teamName}/status`),
        fetch(`/api/teams/${teamName}/webhook-secret`),
      ]);

      const envData = await envRes.json();
      const branchData = await branchRes.json();
      const portData = await portRes.json();
      const statusData = await statusRes.json();
      const webhookData = await webhookRes.json();

      if (envData.success) {
        const envVars = Object.entries(envData.env).map(([key, value]) => ({
          key,
          value: String(value),
        }));
        if (envVars.length === 0) {
          envVars.push({ key: '', value: '' });
        }
        setEnvVariables(envVars);
      } else {
        setError(envData.message || 'Failed to load config');
      }

      if (branchData.success) {
        setBranch(branchData.branch || 'main');
      }

      if (portData.hostPort) {
        setNewPort(portData.hostPort);
      }

      if (statusData.status) {
        setContainerStatus(statusData.status);
      }

      if (statusData.containerName) {
        setContainerName(statusData.containerName);
      }

      if (webhookData.success) {
        setWebhookSecret(webhookData.webhookSecret);
      }

      setConfig({
        hostPort: portData.hostPort,
        domain: envData.domain,
        branch: branchData.branch || 'main',
        containerStatus: statusData.status,
      });
    } catch (err) {
      setError('Failed to load team configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/teams/${teamName}/logs?tail=200`);
      const data = await response.json();
      if (data.success) {
        setLogsText(data.logs || '');
      } else {
        setLogsError(data.message || 'Failed to load logs');
      }
    } catch (err) {
      setLogsError('Failed to load logs');
      console.error(err);
    } finally {
      setLogsLoading(false);
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }
  };

  const handleSaveEnv = async () => {
    setSaving(true);
    try {
      const envObj = envVariables.reduce(
        (acc, { key, value }) => {
          if (key) acc[key] = value;
          return acc;
        },
        {} as Record<string, string>
      );

      const envContent = Object.entries(envObj)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const response = await fetch(`/api/teams/${teamName}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envContent }),
      });
      const data = await response.json();
      if (data.success) {
        addToast('Environment variables saved successfully', 'success');
      } else {
        addToast(data.message || 'Failed to save env', 'error');
      }
    } catch (err) {
      addToast('Failed to save environment variables', 'error');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateBranch = async () => {
    if (!newBranch.trim()) {
      addToast('Please enter a branch name', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: newBranch }),
      });
      const data = await response.json();
      if (data.success) {
        setBranch(newBranch);
        setNewBranch('');
        addToast('Branch updated successfully', 'success');
      } else {
        addToast(data.message || 'Failed to update branch', 'error');
      }
    } catch (err) {
      addToast('Failed to update branch', 'error');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePort = async () => {
    if (newPort === '') {
      addToast('Please enter a port number', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/port`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostPort: newPort }),
      });
      const data = await response.json();
      if (data.success) {
        addToast('Port updated successfully', 'success');
      } else {
        addToast(data.message || 'Failed to update port', 'error');
      }
    } catch (err) {
      addToast('Failed to update port', 'error');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/deploy`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        addToast('Deployment started successfully', 'success');
      } else {
        addToast(data.message || 'Failed to deploy', 'error');
      }
    } catch (err) {
      addToast('Failed to deploy team', 'error');
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(webhookSecret);
      addToast('Webhook secret copied to clipboard', 'success');
    } catch (err) {
      addToast('Failed to copy secret', 'error');
    }
  };

  const handleRegenerateSecret = async () => {
    if (!confirm('Are you sure you want to regenerate the webhook secret? This will invalidate the current secret.')) {
      return;
    }

    setRegeneratingSecret(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/webhook-secret`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setWebhookSecret(data.webhookSecret);
        addToast('Webhook secret regenerated successfully', 'success');
      } else {
        addToast(data.message || 'Failed to regenerate secret', 'error');
      }
    } catch (err) {
      addToast('Failed to regenerate webhook secret', 'error');
      console.error(err);
    } finally {
      setRegeneratingSecret(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600">Loading team configuration...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-4xl font-bold text-slate-900">{teamName}</h1>
          <p className="text-slate-600">Team configuration and deployment</p>
        </div>
        {containerStatus && (
          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-sm border border-slate-200">
            <Circle
              size={12}
              className={`fill-current ${
                containerStatus === 'running'
                  ? 'text-green-500'
                  : containerStatus === 'stopped' || containerStatus === 'exited'
                  ? 'text-red-500'
                  : containerStatus === 'restarting'
                  ? 'text-yellow-500'
                  : 'text-slate-400'
              }`}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700 capitalize">
                {containerStatus}
              </span>
              {containerName && (
                <span className="text-xs text-slate-500">{containerName}</span>
              )}
            </div>
            <button
              onClick={() => {
                const nextOpen = !logsOpen;
                setLogsOpen(nextOpen);
                if (nextOpen && !logsText) {
                  fetchLogs();
                }
              }}
              className="ml-2 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
            >
              <FileText size={14} />
              Logs
            </button>
          </div>
        )}
      </div>

      {logsOpen && (
        <div className="mb-8 bg-white rounded-lg shadow-md p-6 max-w-full overflow-x-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={20} className="text-slate-500" />
              Container Logs
            </h2>
            <button
              onClick={fetchLogs}
              disabled={logsLoading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {logsError && (
            <div className="mb-3 text-sm text-red-600">{logsError}</div>
          )}
          <div
            ref={logsRef}
            className="border border-slate-200 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono p-4 h-64 overflow-auto whitespace-pre-wrap break-all"
          >
            {logsLoading ? 'Loading logs...' : logsText || 'No logs available.'}
          </div>
        </div>
      )}

      {/* Port Configuration */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Zap size={20} className="text-amber-500" />
          Port Configuration
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Localhost Port
            </label>
            <input
              type="number"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 61555"
            />
            <p className="text-xs text-slate-500 mt-1">
              The port exposed on localhost in development
            </p>
          </div>
          <button
            onClick={handleUpdatePort}
            disabled={saving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
          >
            Update Port
          </button>
        </div>
      </div>

      {/* Branch Configuration */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <GitBranch size={20} className="text-cyan-500" />
          Current Branch
        </h2>
        <div className="mb-6">
          <div className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg">
            <span className="font-mono text-slate-900">{branch}</span>
          </div>
        </div>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              New Branch Name
            </label>
            <input
              type="text"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="e.g., main, develop, feature/new-ui"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
          </div>
          <button
            onClick={handleUpdateBranch}
            disabled={saving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
          >
            Update Branch
          </button>
        </div>
      </div>

      {/* Webhook Secret Configuration */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Cog size={20} className="text-blue-500" />
          Webhook Secret
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Secret Key
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                <span className="font-mono text-slate-900 flex-1 truncate">
                  {showWebhookSecret ? webhookSecret : '••••••••••••••••••••••••••••••••'}
                </span>
                <button
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="text-slate-600 hover:text-slate-900 transition"
                >
                  {showWebhookSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                onClick={handleCopySecret}
                className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition flex items-center gap-2"
              >
                <Copy size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Use this secret to verify webhook requests from your CI/CD pipeline
            </p>
          </div>
          <button
            onClick={handleRegenerateSecret}
            disabled={regeneratingSecret}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center gap-2"
          >
            <RotateCw size={18} />
            Regenerate Secret
          </button>
        </div>
      </div>

      {/* Environment Variables */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Code2 size={20} className="text-purple-500" />
            Environment Variables
          </h2>
          <div className="flex items-center gap-2">
            <input
              ref={envFileInputRef}
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
                    onClick={handleEnvUploadClick}
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
          <p className="text-xs text-slate-500">
            Tip: se il file <code>.env</code> non appare, abilita la visualizzazione dei file nascosti (Ctrl+H).
          </p>
          {envVariables.map((env, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={env.key}
                onChange={(e) =>
                  handleEnvVarChange(index, 'key', e.target.value)
                }
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
                placeholder="KEY"
                disabled={saving}
              />
              <input
                type="text"
                value={env.value}
                onChange={(e) =>
                  handleEnvVarChange(index, 'value', e.target.value)
                }
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
                placeholder="value"
                disabled={saving}
              />
              {envVariables.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveEnvVar(index)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  disabled={saving}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddEnvVar}
          className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
          disabled={saving}
        >
          <Plus size={16} />
          Add Variable
        </button>
        <button
          onClick={handleSaveEnv}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
        >
          Save Environment Variables
        </button>
      </div>

      {/* Deploy Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <DownloadCloud size={20} className="text-emerald-500" />
          Deploy
        </h2>
        <p className="text-slate-600 mb-4">
          Trigger a new deployment of this team using the current configuration
        </p>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center gap-2"
        >
          <DownloadCloud size={18} />
          Deploy Now
        </button>
      </div>
    </div>
  );
}
