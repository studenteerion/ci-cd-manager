'use client';

import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { DownloadCloud } from 'lucide-react';

interface EnvVariable {
  key: string;
  value: string;
}

interface CreateTeamFormProps {
  onSuccess: () => void;
}

export function CreateTeamForm({ onSuccess }: CreateTeamFormProps) {
  const [teamName, setTeamName] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [domain, setDomain] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [branch, setBranch] = useState('main');
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([
    { key: '', value: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [domainTouched, setDomainTouched] = useState(false);
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || '';
  const [envUploadOpen, setEnvUploadOpen] = useState(false);
  const [envDragActive, setEnvDragActive] = useState(false);

  const handleAddEnvVar = () => {
    setEnvVariables([...envVariables, { key: '', value: '' }]);
  };

  const handleTeamNameChange = (value: string) => {
    setTeamName(value);
    if (baseDomain && value && !domainTouched) {
      setDomain(`${value}.${baseDomain}`);
    }
  };

  const handleTeamNameBlur = () => {
    if (baseDomain && teamName && !domainTouched) {
      setDomain(`${teamName}.${baseDomain}`);
    }
  };

  // Parse .env file content into a key->value map
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

  // Merge parsed env object into current envVariables array.
  // Existing keys are overwritten; new keys are appended. Preserves current key order.
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileInputClick = () => fileInputRef.current?.click();

  const processEnvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseEnvContent(text);
      if (Object.keys(parsed).length === 0) {
        setError('Uploaded file contained no environment variables');
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
      setSuccess(`Imported ${Object.keys(parsed).length} variables (${updated} updated, ${added} added)`);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!teamName || !repositoryUrl || !domain || !hostPort) {
        setError('Please fill in all required fields');
        return;
      }

      const envObj = envVariables.reduce(
        (acc, { key, value }) => {
          if (key) acc[key] = value;
          return acc;
        },
        {} as Record<string, string>
      );

      const response = await fetch('/api/teams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          repositoryUrl,
          domain,
          hostPort: parseInt(hostPort),
          branch,
          envVariables: envObj,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assignedPort = data.hostPort || hostPort;
        const portInfo = data.hostPort && data.hostPort !== parseInt(hostPort) 
          ? ` (Port ${parseInt(hostPort)} was occupied, assigned ${data.hostPort})`
          : '';
        setSuccess(`Team created successfully on port ${assignedPort}${portInfo}. Webhook secret: ${data.webhookSecret}`);
        setTeamName('');
        setRepositoryUrl('');
        setDomain('');
  setDomainTouched(false);
        setHostPort('');
        setBranch('main');
        setEnvVariables([{ key: '', value: '' }]);
        
        // Call parent callback to refresh teams list
        setTimeout(onSuccess, 1000);
      } else {
        setError(data.message || 'Failed to create team');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
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
            Team Name *
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => handleTeamNameChange(e.target.value)}
            onBlur={handleTeamNameBlur}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
            placeholder="e.g., alpha, beta"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Repository URL (HTTPS) *
          </label>
          <input
            type="url"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
            placeholder="https://github.com/org/repo.git"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Domain *
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setDomainTouched(true);
            }}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
            placeholder="alpha.example.com"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Host Port (localhost) *
          </label>
          <input
            type="number"
            value={hostPort}
            onChange={(e) => setHostPort(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
            placeholder="8000"
            min="1000"
            max="65535"
            disabled={loading}
          />
          <p className="text-xs text-slate-600 mt-1">Port for Caddy reverse proxy on localhost</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Git Branch
          </label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder-slate-500"
            placeholder="main"
            disabled={loading}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="block text-sm font-medium text-slate-900">
              Environment Variables
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
      </div>
    </form>
  );
}
