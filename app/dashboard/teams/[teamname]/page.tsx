'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { ChevronLeft, Cog, GitBranch, Code2, DownloadCloud, Plus, X, Circle, Eye, EyeOff, Copy, RotateCw, FileText, RefreshCw, Loader2, Terminal, User, Play, Square, Server, MoreVertical, Folder, Globe, Zap } from 'lucide-react';
import { useToast } from '@/lib/context/ToastContext';
import { BranchSelector } from '@/components/BranchSelector';
import { fetchGitHubBranches, fetchGitHubCommits, isGitHubRepoUrl, CommitInfo } from '@/lib/github/client';
import {
  EnvEntry,
  mergeEnvEntries,
  parseEnvContent,
  validateEnvEntries,
} from '@/lib/env-file';

interface TeamConfig {
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
  const webhookBaseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ?? '';
  const webhookUrl = webhookBaseUrl
    ? `${webhookBaseUrl.replace(/\/$/, '')}/hooks/${teamName}`
    : '';

  const [config, setConfig] = useState<TeamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [containerStatus, setContainerStatus] = useState<string>('');
  const [containerName, setContainerName] = useState<string>('');
  const [containerActionLoading, setContainerActionLoading] = useState(false);
  const [containerActionType, setContainerActionType] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [hostPort, setHostPort] = useState<number | null>(null);
  const [branch, setBranch] = useState('main');
  const [newBranch, setNewBranch] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchStatus, setBranchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [branchError, setBranchError] = useState('');
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsText, setLogsText] = useState('');
  const [logsError, setLogsError] = useState('');
  const logsRef = useRef<HTMLDivElement | null>(null);
  const [gitLogsOpen, setGitLogsOpen] = useState(false);
  const [gitLogsLoading, setGitLogsLoading] = useState(false);
  const [gitLogsText, setGitLogsText] = useState('');
  const [gitLogsError, setGitLogsError] = useState('');
  const gitLogsRef = useRef<HTMLDivElement | null>(null);
  const [deployLogsOpen, setDeployLogsOpen] = useState(false);
  const [deployLogsLoading, setDeployLogsLoading] = useState(false);
  const [deployLogsText, setDeployLogsText] = useState('');
  const [deployLogsError, setDeployLogsError] = useState('');
  const deployLogsRef = useRef<HTMLDivElement | null>(null);
  const deployLogsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deployLogsAutoScroll, setDeployLogsAutoScroll] = useState(true);
  const deployLogsAutoScrollRef = useRef(true);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [commitOptions, setCommitOptions] = useState<CommitInfo[]>([]);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitSearchTerm, setCommitSearchTerm] = useState('');
  const [commitBranchOverride, setCommitBranchOverride] = useState('');
  const [deployingCommit, setDeployingCommit] = useState(false);
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([
    { key: '', value: '' },
  ]);
  const envFileInputRef = useRef<HTMLInputElement | null>(null);
  const [envUploadOpen, setEnvUploadOpen] = useState(false);
  const [envDragActive, setEnvDragActive] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showEnvValues, setShowEnvValues] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [currentRole, setCurrentRole] = useState<'admin' | 'team' | null>(null);
  const [teamAccountStatus, setTeamAccountStatus] = useState<'active' | 'inactive'>('active');
  const [teamPasswordInput, setTeamPasswordInput] = useState('');
  const [teamCurrentPassword, setTeamCurrentPassword] = useState('');
  const [teamGeneratedPassword, setTeamGeneratedPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showGeneratedPassword, setShowGeneratedPassword] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [containerMenuOpen, setContainerMenuOpen] = useState(false);
  const [containerDialogOpen, setContainerDialogOpen] = useState(false);
  const [containerDialogMode, setContainerDialogMode] = useState<'remove' | 'remove-volumes' | 'rebuild' | 'recreate' | null>(null);
  const [containerConfirmInput, setContainerConfirmInput] = useState('');
  const [containerMaintenanceLoading, setContainerMaintenanceLoading] = useState(false);
  const containerStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerStatusAbortRef = useRef<AbortController | null>(null);
  const containerStatusRequestIdRef = useRef(0);
  const containerStatusRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchFetchAbortRef = useRef<AbortController | null>(null);
  const branchFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchTouchedRef = useRef(false);
  const commitDefaultBranch = branch || defaultBranch || 'main';
  const commitSelectedBranch = commitBranchOverride.trim() || commitDefaultBranch;
  const githubWebhookUrl = useMemo(() => {
    const trimmed = repositoryUrl.trim();
    if (!trimmed || !isGitHubRepoUrl(trimmed)) return '';
    const normalized = trimmed.replace(/\.git$/i, '').replace(/\/$/, '');
    return `${normalized}/settings/hooks/new`;
  }, [repositoryUrl]);

  useEffect(() => {
    loadTeamConfig();
  }, [teamName]);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const roleCookie = cookies.find((c) => c.trim().startsWith('role='));
    if (roleCookie) {
      const roleValue = decodeURIComponent(roleCookie.split('=')[1]);
      setCurrentRole(roleValue === 'team' ? 'team' : 'admin');
    }
  }, []);

  useEffect(() => {
    if (currentRole !== 'admin') return;
    const loadCredentials = async () => {
      setCredentialsLoading(true);
      try {
        const response = await fetch(`/api/teams/${teamName}/credentials`);
        const data = await response.json();
        if (data.success) {
          setTeamAccountStatus(data.status || 'active');
          setTeamCurrentPassword(data.password || '');
        } else {
          addToast(data.message || 'Impossibile caricare le credenziali team', 'error');
        }
      } catch (error) {
        addToast('Impossibile caricare le credenziali team', 'error');
      } finally {
        setCredentialsLoading(false);
      }
    };
    loadCredentials();
  }, [currentRole, teamName, addToast]);

  useEffect(() => {
    if (logsOpen && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logsOpen, logsText]);

  useEffect(() => {
    if (gitLogsOpen && gitLogsRef.current) {
      gitLogsRef.current.scrollTop = gitLogsRef.current.scrollHeight;
    }
  }, [gitLogsOpen, gitLogsText]);

  useEffect(() => {
    if (deployLogsOpen && deployLogsRef.current && deployLogsAutoScrollRef.current) {
      deployLogsRef.current.scrollTop = deployLogsRef.current.scrollHeight;
    }
  }, [deployLogsOpen, deployLogsText, deployLogsAutoScroll]);

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

  const fetchContainerStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      containerStatusAbortRef.current?.abort();
      const controller = new AbortController();
      containerStatusAbortRef.current = controller;
      const requestId = ++containerStatusRequestIdRef.current;

      try {
        const response = await fetch(`/api/teams/${teamName}/status`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (controller.signal.aborted || requestId !== containerStatusRequestIdRef.current) return;

        if (data?.status) {
          setContainerStatus(data.status);
        } else if (!options?.silent) {
          setContainerStatus('unknown');
        }

        if (typeof data?.containerName === 'string') {
          setContainerName(data.containerName);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        if (!options?.silent) {
          setContainerStatus((prev) => prev || 'unknown');
        }
      }
    },
    [teamName]
  );

  useEffect(() => {
    if (!teamName) return;

    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchContainerStatus({ silent: true });
    };

    refresh();

    if (containerStatusIntervalRef.current) {
      clearInterval(containerStatusIntervalRef.current);
    }
    containerStatusIntervalRef.current = setInterval(refresh, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (containerStatusIntervalRef.current) {
        clearInterval(containerStatusIntervalRef.current);
      }
      if (containerStatusRetryRef.current) {
        clearTimeout(containerStatusRetryRef.current);
      }
      containerStatusAbortRef.current?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [teamName, fetchContainerStatus]);

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

  const toEnvEntries = (vars: EnvVariable[]): EnvEntry[] =>
    vars
      .filter((env) => env.key.trim() || env.value.trim())
      .map((env, index) => ({
        key: env.key.trim(),
        value: env.value ?? '',
        line: index + 1,
      }));

  const handleEnvUploadClick = () => envFileInputRef.current?.click();

  const handleEnvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseEnvContent(text);
      if (parsed.errors.length > 0) {
        addToast(`Malformed .env: ${parsed.errors.join(' | ')}`, 'error');
        return;
      }
      if (parsed.entries.length === 0) {
        addToast('Uploaded file contained no environment variables', 'error');
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
      addToast(`Imported ${parsed.entries.length} variables (${updated} updated, ${added} added)`, 'success');
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
      const [envRes, branchRes, statusRes, webhookRes, portRes] = await Promise.all([
        fetch(`/api/teams/${teamName}/env`),
        fetch(`/api/teams/${teamName}/branch`),
        fetch(`/api/teams/${teamName}/status`),
        fetch(`/api/teams/${teamName}/webhook-secret`),
        fetch(`/api/teams/${teamName}/port`),
      ]);

      const envData = await envRes.json();
      const branchData = await branchRes.json();
      const statusData = await statusRes.json();
      const webhookData = await webhookRes.json();
      const portData = await portRes.json();

      if (envData.success) {
        const entries = Array.isArray(envData.envEntries)
          ? (envData.envEntries as EnvEntry[])
          : Object.entries(envData.env || {}).map(([key, value], index) => ({
              key,
              value: String(value),
              line: index + 1,
            }));
        const envVars = entries.map((entry) => ({ key: entry.key, value: entry.value }));
        if (envVars.length === 0) {
          envVars.push({ key: '', value: '' });
        }
        setEnvVariables(envVars);
        if (envData.envParseErrors?.length) {
          setError(`Env parse errors: ${envData.envParseErrors.join(' | ')}`);
        }
      } else {
        setError(envData.message || 'Failed to load config');
      }

      if (branchData.success) {
        setBranch(branchData.branch || 'main');
        setNewBranch(branchData.branch || 'main');
      }

      if (statusData.status) {
        setContainerStatus(statusData.status);
      } else {
        setContainerStatus('unknown');
      }

      if (statusData.containerName) {
        setContainerName(statusData.containerName);
      } else {
        setContainerName('');
      }

      if (portData.success && typeof portData.hostPort === 'number') {
        setHostPort(portData.hostPort);
      }

      if (webhookData.success) {
        setWebhookSecret(webhookData.webhookSecret);
      }

      if (envData.repository) {
        setRepositoryUrl(envData.repository);
      }

      setConfig({
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

  const fetchGitLogs = async () => {
    setGitLogsLoading(true);
    setGitLogsError('');
    try {
      const response = await fetch(`/api/teams/${teamName}/git-logs?tail=50`);
      const data = await response.json();
      if (data.success) {
        setGitLogsText(data.logs || '');
      } else {
        setGitLogsError(data.message || 'Failed to load git logs');
      }
    } catch (err) {
      setGitLogsError('Failed to load git logs');
      console.error(err);
    } finally {
      setGitLogsLoading(false);
      if (gitLogsRef.current) {
        gitLogsRef.current.scrollTop = gitLogsRef.current.scrollHeight;
      }
    }
  };

  const handleSaveEnv = async () => {
    setSaving(true);
    try {
      if (envVariables.some((env) => !env.key.trim() && env.value.trim())) {
        addToast('Environment variable keys cannot be empty when a value is provided', 'error');
        return;
      }
      const envEntries = toEnvEntries(envVariables);
      const validation = validateEnvEntries(envEntries);
      if (validation.errors.length > 0) {
        addToast(`Invalid environment variables: ${validation.errors.join(' | ')}`, 'error');
        return;
      }

      const response = await fetch(`/api/teams/${teamName}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envEntries: validation.entries }),
      });
      const data = await response.json();
      if (data.success) {
        addToast('Environment variables saved successfully', 'success');
        await loadTeamConfig();
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
      addToast('Seleziona un branch dal repository', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/branch`, {
        method: 'PATCH',
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

  const handleContainerAction = async (action: 'start' | 'stop' | 'restart') => {
    setContainerActionLoading(true);
    setContainerActionType(action);
    try {
      const response = await fetch(`/api/teams/${teamName}/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.success) {
        addToast(
          action === 'start'
            ? 'Container avviato'
            : action === 'restart'
            ? 'Container riavviato'
            : 'Container fermato',
          'success'
        );
        await loadTeamConfig();
        fetchContainerStatus({ silent: true });
        if (containerStatusRetryRef.current) {
          clearTimeout(containerStatusRetryRef.current);
        }
        containerStatusRetryRef.current = setTimeout(() => {
          fetchContainerStatus({ silent: true });
        }, 2000);
      } else {
        addToast(data.message || 'Operazione container fallita', 'error');
      }
    } catch (err) {
      addToast('Operazione container fallita', 'error');
      console.error(err);
    } finally {
      setContainerActionLoading(false);
      setContainerActionType(null);
    }
  };

  const fetchCommitOptions = async () => {
    const trimmed = repositoryUrl.trim();
    if (!trimmed) {
      setCommitError('Repository non configurato per questo team.');
      setCommitOptions([]);
      return;
    }
    if (!isGitHubRepoUrl(trimmed)) {
      setCommitError('Inserisci un link GitHub valido (es. https://github.com/org/repo).');
      setCommitOptions([]);
      return;
    }

    setCommitLoading(true);
    setCommitError('');
    try {
      const response = await fetchGitHubCommits(trimmed, commitSelectedBranch);
      if (!response.success) {
        setCommitError(response.message || 'Impossibile recuperare i commit.');
        setCommitOptions([]);
        return;
      }
      setCommitOptions(response.commits || []);
      setSelectedCommit(response.commits?.[0] ?? null);
    } catch (err) {
      setCommitError('Errore durante il recupero dei commit.');
      console.error(err);
    } finally {
      setCommitLoading(false);
    }
  };

  const handleOpenCommitDeploy = () => {
    setCommitModalOpen(true);
    setCommitSearchTerm('');
    setCommitBranchOverride('');
    fetchCommitOptions();
  };

  const filteredCommitOptions = useMemo(() => {
    const normalized = commitSearchTerm.trim().toLowerCase();
    if (!normalized) return commitOptions;
    return commitOptions.filter((commit) => {
      const shaMatch = commit.sha.toLowerCase().includes(normalized);
      const messageMatch = (commit.message || '').toLowerCase().includes(normalized);
      return shaMatch || messageMatch;
    });
  }, [commitOptions, commitSearchTerm]);

  useEffect(() => {
    if (!commitModalOpen) return;
    setSelectedCommit(null);
    setCommitSearchTerm('');
  }, [commitSelectedBranch, commitModalOpen]);

  const handleDeployCommit = async () => {
    if (!selectedCommit) {
      addToast('Seleziona un commit da deployare', 'error');
      return;
    }

    const branchOverride = commitBranchOverride.trim();

    setDeployingCommit(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit: selectedCommit.sha,
          branch: branchOverride || undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        addToast('Deployment del commit avviato', 'success');
        setCommitModalOpen(false);
      } else {
        addToast(data.message || 'Deploy del commit fallito', 'error');
      }
    } catch (err) {
      addToast('Deploy del commit fallito', 'error');
      console.error(err);
    } finally {
      setDeployingCommit(false);
    }
  };

  const fetchDeployLogs = async () => {
    setDeployLogsLoading(true);
    setDeployLogsError('');
    try {
      const response = await fetch(`/api/teams/${teamName}/deploy-logs?tail=300`);
      const data = await response.json();
      if (data.success) {
        setDeployLogsText(data.logs || '');
      } else {
        setDeployLogsError(data.message || 'Failed to load deploy logs');
      }
    } catch (err) {
      setDeployLogsError('Failed to load deploy logs');
      console.error(err);
    } finally {
      setDeployLogsLoading(false);
      if (deployLogsRef.current && deployLogsAutoScrollRef.current) {
        deployLogsRef.current.scrollTop = deployLogsRef.current.scrollHeight;
      }
    }
  };

  const handleOpenDeployLogs = () => {
    setDeployLogsOpen(true);
    fetchDeployLogs();
    if (deployLogsIntervalRef.current) {
      clearInterval(deployLogsIntervalRef.current);
    }
    deployLogsIntervalRef.current = setInterval(fetchDeployLogs, 2000);
  };

  const handleCloseDeployLogs = () => {
    setDeployLogsOpen(false);
    if (deployLogsIntervalRef.current) {
      clearInterval(deployLogsIntervalRef.current);
      deployLogsIntervalRef.current = null;
    }
  };

  const handleDeleteTeam = async () => {
    const normalizedInput = deleteInput.trim().toLowerCase();
    const normalizedTeam = teamName.toLowerCase();
    if (!normalizedInput || normalizedInput !== normalizedTeam) {
      addToast('Il nome inserito non corrisponde al team', 'error');
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/teams/${teamName}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteInput.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        addToast('Team eliminato con successo', 'success');
        setDeleteOpen(false);
        setDeleteInput('');
        router.push('/dashboard/teams');
      } else {
        addToast(data.message || 'Eliminazione team fallita', 'error');
      }
    } catch (err) {
      addToast('Eliminazione team fallita', 'error');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateTeamPassword = async () => {
    setCredentialsLoading(true);
    setTeamGeneratedPassword('');
    try {
      const response = await fetch(`/api/teams/${teamName}/credentials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate: true }),
      });
      const data = await response.json();
      if (data.success) {
        setTeamGeneratedPassword(data.password || '');
        setTeamCurrentPassword(data.password || '');
        addToast('Password generata con successo', 'success');
      } else {
        addToast(data.message || 'Generazione password fallita', 'error');
      }
    } catch (error) {
      addToast('Generazione password fallita', 'error');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleSaveTeamPassword = async () => {
    if (!teamPasswordInput.trim()) {
      addToast('Inserisci una password valida', 'error');
      return;
    }
    setCredentialsLoading(true);
    setTeamGeneratedPassword('');
    try {
      const response = await fetch(`/api/teams/${teamName}/credentials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: teamPasswordInput.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        const nextPassword = data.password || teamPasswordInput.trim();
        setTeamGeneratedPassword(nextPassword);
        setTeamCurrentPassword(nextPassword);
        setTeamPasswordInput('');
        addToast('Password aggiornata con successo', 'success');
      } else {
        addToast(data.message || 'Aggiornamento password fallito', 'error');
      }
    } catch (error) {
      addToast('Aggiornamento password fallito', 'error');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleToggleTeamStatus = async () => {
    const nextStatus = teamAccountStatus === 'active' ? 'inactive' : 'active';
    setCredentialsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/credentials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (data.success) {
        setTeamAccountStatus(nextStatus);
        addToast('Stato credenziali aggiornato', 'success');
      } else {
        addToast(data.message || 'Aggiornamento stato fallito', 'error');
      }
    } catch (error) {
      addToast('Aggiornamento stato fallito', 'error');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const openContainerDialog = (mode: 'remove' | 'remove-volumes' | 'rebuild' | 'recreate') => {
    setContainerDialogMode(mode);
    setContainerConfirmInput('');
    setContainerDialogOpen(true);
  };

  const handleContainerMaintenance = async (action: 'remove' | 'remove-volumes' | 'rebuild' | 'recreate') => {
    setContainerMaintenanceLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamName}/container-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!data.success) {
        addToast(data.message || 'Operazione container fallita', 'error');
        return;
      }
      addToast(data.message || 'Operazione completata', 'success');
      await loadTeamConfig();

      if (action === 'remove-volumes') {
        if (data.requiresRebuild) {
          openContainerDialog('rebuild');
        } else if (data.requiresRecreate) {
          openContainerDialog('recreate');
        }
      }
    } catch (error) {
      addToast('Operazione container fallita', 'error');
      console.error(error);
    } finally {
      setContainerMaintenanceLoading(false);
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

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(webhookSecret);
      addToast('Webhook secret copied to clipboard', 'success');
    } catch (err) {
      addToast('Failed to copy secret', 'error');
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!webhookUrl) {
      addToast('Webhook base URL non configurato', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      addToast('Webhook URL copiato negli appunti', 'success');
    } catch (err) {
      addToast('Impossibile copiare il webhook URL', 'error');
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
    <>
      <div className="w-full max-w-none">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex items-center gap-2">
            {currentRole !== 'team' && (
              <button
                onClick={() => router.push('/dashboard/teams')}
                className="h-10 w-10 leading-none rounded-lg border border-slate-200 bg-white hover:bg-slate-100 shadow-sm transition flex items-center justify-center"
                aria-label="Torna all'elenco team"
              >
                <ChevronLeft size={24} className="text-slate-600" />
              </button>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-slate-900">{teamName}</h1>
          </div>
        </div>
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server size={20} className="text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900">Accesso applicazione</h2>
          </div>
          <p className="text-slate-600 mb-4">
            Indirizzo e porta pubblicati per l'applicazione, come nella lista principale.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <Folder size={16} className="text-slate-500" />
              <span className="font-mono">/opt/apps/{teamName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Globe size={16} className="text-emerald-500" />
              {config?.domain ? (
                <a
                  href={`https://${config.domain}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-blue-600 hover:underline"
                >
                  {config.domain}
                </a>
              ) : (
                <span className="text-slate-400">Dominio non configurato</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Zap size={16} className="text-amber-500" />
              {hostPort ? (
                <span className="font-mono">localhost:{hostPort}</span>
              ) : (
                <span className="text-slate-400">Porta non disponibile</span>
              )}
            </div>
          </div>
        </div>
        {/* end Info Card */}

      {containerStatus && (
        <div className="mb-8 bg-white rounded-lg shadow-md p-6 relative">
          <div className="flex items-center gap-2 mb-4">
            <Server size={20} className="text-indigo-500" />
            <h2 className="text-xl font-semibold text-slate-900">Container</h2>
          </div>
          {currentRole === 'admin' && (
            <div className="absolute right-4 top-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setContainerMenuOpen((prev) => !prev)}
                  className="h-9 w-9 leading-none rounded-lg border border-slate-200 bg-white hover:bg-slate-100 shadow-sm transition flex items-center justify-center"
                  aria-label="Azioni container"
                >
                  <MoreVertical size={18} className="text-slate-600" />
                </button>
                {containerMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setContainerMenuOpen(false)}
                      aria-label="Chiudi menu container"
                    />
                    <div className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg z-40">
                      <button
                        type="button"
                        onClick={() => {
                          setContainerMenuOpen(false);
                          openContainerDialog('remove');
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Elimina container
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContainerMenuOpen(false);
                          openContainerDialog('remove-volumes');
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Elimina container e volumi associati
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <p className="text-slate-600 mb-4">
            Gestisci lo stato del container e accedi rapidamente ai log.
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
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
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const nextOpen = !logsOpen;
                setLogsOpen(nextOpen);
                if (nextOpen && !logsText) {
                  fetchLogs();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition leading-none"
            >
              <FileText size={16} />
              {logsOpen ? 'Nascondi logs' : 'Logs container'}
            </button>
            <button
              onClick={() => {
                const nextOpen = !gitLogsOpen;
                setGitLogsOpen(nextOpen);
                if (nextOpen && !gitLogsText) {
                  fetchGitLogs();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition leading-none"
            >
              <GitBranch size={16} />
              {gitLogsOpen ? 'Nascondi git logs' : 'Git logs'}
            </button>
            <button
              onClick={() => handleContainerAction('start')}
              disabled={
                containerActionLoading ||
                !['stopped', 'exited', 'unknown', 'created'].includes(containerStatus)
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition leading-none disabled:opacity-50"
            >
              <Play size={16} />
              Avvia
              {containerActionLoading && containerActionType === 'start' && (
                <Loader2 size={14} className="animate-spin" />
              )}
            </button>
            <button
              onClick={() => handleContainerAction('restart')}
              disabled={
                containerActionLoading ||
                !['running', 'restarting', 'exited', 'stopped', 'created'].includes(containerStatus)
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition leading-none disabled:opacity-50"
            >
              <RotateCw size={16} />
              Riavvia
              {containerActionLoading && containerActionType === 'restart' && (
                <Loader2 size={14} className="animate-spin" />
              )}
            </button>
            <button
              onClick={() => handleContainerAction('stop')}
              disabled={
                containerActionLoading ||
                !['running', 'restarting'].includes(containerStatus)
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition leading-none disabled:opacity-50"
            >
              <Square size={16} />
              Stop
              {containerActionLoading && containerActionType === 'stop' && (
                <Loader2 size={14} className="animate-spin" />
              )}
            </button>
          </div>
            {logsOpen && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-slate-500" />
                    Logs container
                  </h3>
                  <button
                    onClick={fetchLogs}
                    disabled={logsLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 leading-none"
                  >
                    {logsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
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
        </div>
      )}

      {/* Git Logs Section */}
      {gitLogsOpen && (
        <div className="mb-8 border border-slate-200 rounded-lg bg-slate-900 text-slate-100 max-w-full w-full overflow-x-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <span className="text-sm font-medium">git logs</span>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchGitLogs}
                disabled={gitLogsLoading}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition"
              >
                Refresh
              </button>
              <button
                onClick={() => setGitLogsOpen(false)}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          {gitLogsError && (
            <div className="px-4 py-2 text-xs text-red-300">{gitLogsError}</div>
          )}
          <div
            ref={gitLogsRef}
            className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto min-w-0"
          >
            {gitLogsLoading ? 'Loading git logs...' : gitLogsText || 'No git logs available.'}
          </div>
        </div>
      )}

      {/* Deploy Section */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <DownloadCloud size={20} className="text-emerald-500" />
          Deploy
        </h2>
        <p className="text-slate-600 mb-2">
          Trigger a new deployment of this team using the current configuration
        </p>
        <p className="text-xs text-slate-500 mb-4">
          I deploy automatici via webhook avviano comunque il container, anche se era stato fermato manualmente.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center gap-2 leading-none"
          >
            {deploying ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
            {deploying ? 'Deploying...' : 'Deploy Now'}
          </button>
          <button
            onClick={handleOpenCommitDeploy}
            className="px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition font-medium flex items-center gap-2 leading-none"
          >
            <GitBranch size={18} />
            Deploy commit
          </button>
          <button
            onClick={handleOpenDeployLogs}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium flex items-center gap-2 leading-none"
          >
            <Terminal size={18} />
            Output deploy
          </button>
        </div>
      </div>

  {/* Branch Configuration */}
  {currentRole && (
  <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 leading-none">
            <GitBranch size={20} className="text-cyan-500 shrink-0 overflow-visible" />
            Current Branch
          </h2>
          <button
            onClick={handleBranchRefresh}
            disabled={branchStatus === 'loading' || !repositoryUrl}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 leading-none"
          >
            {branchStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Aggiorna lista
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <BranchSelector
            branch={newBranch}
            branches={branchOptions}
            defaultBranch={defaultBranch}
            loading={branchStatus === 'loading'}
            error={branchError}
            disabled={saving}
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
            disabled={saving || !newBranch || newBranch === branch || branchOptions.length === 0}
            className="self-start inline-flex items-center px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
          >
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {saving ? 'Aggiornamento...' : 'Aggiorna branch'}
          </button>
        </div>
  </div>
  )}

      {/* Environment Variables */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Code2 size={20} className="text-purple-500" />
            Environment Variables
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEnvValues((prev) => !prev)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 flex items-center gap-2"
              title="Toggle env values visibility"
            >
              {showEnvValues ? <EyeOff size={16} /> : <Eye size={16} />}
              {showEnvValues ? 'Hide' : 'Show'} Values
            </button>
            <input
              ref={envFileInputRef}
              type="file"
              onChange={handleEnvFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setEnvUploadOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 flex items-center gap-2 leading-none"
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
                  className="text-slate-600 hover:text-slate-900 leading-none flex items-center justify-center"
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
                    className="mt-3 rounded bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 leading-none"
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
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                placeholder="KEY"
                disabled={saving}
              />
              <input
                type={showEnvValues ? 'text' : 'password'}
                value={showEnvValues ? env.value : '••••••••'}
                onChange={(e) =>
                  handleEnvVarChange(index, 'value', e.target.value)
                }
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
                placeholder="value"
                disabled={saving}
                readOnly={!showEnvValues}
              />
              {envVariables.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveEnvVar(index)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition leading-none flex items-center justify-center"
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
          className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium leading-none"
          disabled={saving}
        >
          <Plus size={16} />
          Add Variable
        </button>
        <button
          onClick={handleSaveEnv}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 font-medium leading-none"
        >
          {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
          {saving ? 'Saving...' : 'Save Environment Variables'}
        </button>
      </div>

  {/* Webhook Secret Configuration */}
  {currentRole && (
  <div className="mb-8 bg-white rounded-lg shadow-md p-6 relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Cog size={20} className="text-blue-500" />
            Webhook Secret
          </h2>
          <a
            href={githubWebhookUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition leading-none ${
              githubWebhookUrl
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            onClick={(event) => {
              if (!githubWebhookUrl) {
                event.preventDefault();
              }
            }}
          >
            Configure on GitHub
          </a>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Webhook URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                <span className="font-mono text-slate-900 flex-1 break-all">
                  {webhookUrl || 'Configura NEXT_PUBLIC_WEBHOOK_BASE_URL'}
                </span>
              </div>
              <button
                onClick={handleCopyWebhookUrl}
                disabled={!webhookUrl}
                className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition flex items-center gap-2 leading-none disabled:opacity-50"
              >
                <Copy size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Questo URL verrà usato dai webhook. Imposta il <span className="font-medium">Content-Type</span> su <span className="font-medium">application/json</span>.
            </p>
          </div>
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
                  className="text-slate-600 hover:text-slate-900 transition flex items-center justify-center leading-none"
                >
                  {showWebhookSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                onClick={handleCopySecret}
                className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition flex items-center gap-2 leading-none"
              >
                <Copy size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Use this secret to verify webhook requests from your CI/CD pipeline
            </p>
          </div>
          {currentRole !== 'team' && (
            <button
              onClick={handleRegenerateSecret}
              disabled={regeneratingSecret}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center gap-2 leading-none"
            >
              {regeneratingSecret ? <Loader2 size={18} className="animate-spin" /> : <RotateCw size={18} />}
              {regeneratingSecret ? 'Rigenerazione...' : 'Rigenera secret'}
            </button>
          )}
        </div>
  </div>
  )}

      {currentRole === 'admin' && (
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User size={20} className="text-emerald-500" />
            Credenziali team
          </h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Username team</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-mono text-slate-900 truncate">{teamName}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(teamName);
                        addToast('Username copiato', 'success');
                      } catch (error) {
                        addToast('Impossibile copiare lo username', 'error');
                      }
                    }}
                    className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition flex items-center justify-center"
                    aria-label="Copia username"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Password corrente</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-mono text-slate-900 truncate">
                    {showCurrentPassword
                      ? teamCurrentPassword || 'Non disponibile'
                      : '••••••••••••'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!teamCurrentPassword) return;
                        try {
                          await navigator.clipboard.writeText(teamCurrentPassword);
                          addToast('Password copiata', 'success');
                        } catch (error) {
                          addToast('Impossibile copiare la password', 'error');
                        }
                      }}
                      disabled={!teamCurrentPassword}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition flex items-center justify-center disabled:opacity-50"
                      aria-label="Copia password"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      disabled={!teamCurrentPassword}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition flex items-center justify-center disabled:opacity-50"
                      aria-label={showCurrentPassword ? 'Nascondi password' : 'Mostra password'}
                    >
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm text-slate-700">
                  Stato account: <span className="font-medium capitalize">{teamAccountStatus}</span>
                </p>
                <p className="text-xs text-slate-500">Se inattivo, il team non può effettuare il login.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600">
                  {teamAccountStatus === 'active' ? 'Attivo' : 'Inattivo'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={teamAccountStatus === 'active'}
                  onClick={handleToggleTeamStatus}
                  disabled={credentialsLoading}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${teamAccountStatus === 'active'
                    ? 'bg-emerald-600'
                    : 'bg-slate-400'} ${credentialsLoading ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${teamAccountStatus === 'active'
                      ? 'translate-x-6'
                      : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nuova password manuale
              </label>
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <input
                  type="text"
                  value={teamPasswordInput}
                  onChange={(e) => setTeamPasswordInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  placeholder="Inserisci password"
                  disabled={credentialsLoading}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTeamPassword}
                    disabled={credentialsLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
                  >
                    Salva password
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateTeamPassword}
                    disabled={credentialsLoading}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium"
                  >
                    Genera password
                  </button>
                </div>
              </div>
            </div>
            {teamGeneratedPassword && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-emerald-700">Password generata</p>
                    <p className="font-mono text-sm">
                      {showGeneratedPassword ? teamGeneratedPassword : '••••••••••••'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGeneratedPassword((prev) => !prev)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition text-xs font-medium"
                  >
                    {showGeneratedPassword ? 'Nascondi' : 'Mostra'} password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Team */}
      {currentRole === 'admin' && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-red-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <X size={20} className="text-red-500" />
          Elimina Team
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Questa operazione elimina definitivamente il progetto, inclusi la cartella, la configurazione Caddy e i webhook.
        </p>
        <button
          onClick={() => setDeleteOpen(true)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
        >
          Elimina team
        </button>
        </div>
      )}
    </div>

    {deleteOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-lg font-semibold text-slate-900">Conferma eliminazione</h3>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteInput('');
              }}
              className="text-slate-600 hover:text-slate-900"
            >
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-slate-700">
              Digita <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{teamName}</span> per confermare la cancellazione definitiva.
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="Nome progetto"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900"
              disabled={deleting}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteInput('');
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                disabled={deleting}
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteTeam}
                disabled={deleting || deleteInput.trim().toLowerCase() !== teamName.toLowerCase()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
              >
                {deleting && <Loader2 size={16} className="mr-2 animate-spin" />}
                {deleting ? 'Eliminazione...' : 'Elimina definitivamente'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {containerDialogOpen && containerDialogMode && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-lg font-semibold text-slate-900">
              {containerDialogMode === 'remove'
                ? 'Elimina container'
                : containerDialogMode === 'remove-volumes'
                ? 'Elimina container e volumi'
                : containerDialogMode === 'rebuild'
                ? 'Rebuild container'
                : 'Ricrea container'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setContainerDialogOpen(false);
                setContainerDialogMode(null);
              }}
              className="text-slate-600 hover:text-slate-900"
            >
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4">
            {containerDialogMode === 'remove' && (
              <p className="text-sm text-slate-700">
                Questa operazione rimuove il container attuale ma mantiene i volumi e i dati persistenti.
                I webhook e le automazioni restano configurati; il container potrà essere ricreato con il prossimo deploy.
              </p>
            )}
            {containerDialogMode === 'remove-volumes' && (
              <p className="text-sm text-slate-700">
                Questa operazione elimina il container e i volumi associati. Tutti i dati persistenti verranno cancellati.
                I webhook restano configurati, ma i dati dovranno essere rigenerati dopo la ricreazione del container.
              </p>
            )}
            {containerDialogMode === 'rebuild' && (
              <p className="text-sm text-slate-700">
                I volumi sono stati eliminati e le immagini non sono disponibili. È necessario eseguire un rebuild per
                ricreare il container. Vuoi procedere ora?
              </p>
            )}
            {containerDialogMode === 'recreate' && (
              <p className="text-sm text-slate-700">
                Il container è stato rimosso. È necessario ricrearlo per ripristinare il servizio.
                Vuoi procedere con la ricreazione adesso?
              </p>
            )}

            <div>
              <p className="text-xs text-slate-500 mb-2">
                Digita la frase di conferma per continuare:
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">
                {containerDialogMode === 'remove'
                  ? 'ELIMINA CONTAINER'
                  : containerDialogMode === 'remove-volumes'
                  ? 'ELIMINA CONTAINER E VOLUMI'
                  : containerDialogMode === 'rebuild'
                  ? 'REBUILD CONTAINER'
                  : 'RICREA CONTAINER'}
              </div>
              <input
                type="text"
                value={containerConfirmInput}
                onChange={(e) => setContainerConfirmInput(e.target.value)}
                className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900"
                placeholder="Scrivi la frase di conferma"
                disabled={containerMaintenanceLoading}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setContainerDialogOpen(false);
                  setContainerDialogMode(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                disabled={containerMaintenanceLoading}
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={async () => {
                  const required = containerDialogMode === 'remove'
                    ? 'ELIMINA CONTAINER'
                    : containerDialogMode === 'remove-volumes'
                    ? 'ELIMINA CONTAINER E VOLUMI'
                    : containerDialogMode === 'rebuild'
                    ? 'REBUILD CONTAINER'
                    : 'RICREA CONTAINER';
                  if (containerConfirmInput.trim() !== required) return;
                  setContainerDialogOpen(false);
                  await handleContainerMaintenance(containerDialogMode);
                  setContainerDialogMode(null);
                }}
                disabled={
                  containerMaintenanceLoading ||
                  containerConfirmInput.trim() !== (containerDialogMode === 'remove'
                    ? 'ELIMINA CONTAINER'
                    : containerDialogMode === 'remove-volumes'
                    ? 'ELIMINA CONTAINER E VOLUMI'
                    : containerDialogMode === 'rebuild'
                    ? 'REBUILD CONTAINER'
                    : 'RICREA CONTAINER')
                }
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
              >
                {containerMaintenanceLoading ? 'Operazione...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {commitModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-lg font-semibold text-slate-900">Deploy commit specifico</h3>
            <button
              type="button"
              onClick={() => {
                setCommitModalOpen(false);
                setSelectedCommit(null);
                setCommitSearchTerm('');
                setCommitBranchOverride('');
              }}
              className="text-slate-600 hover:text-slate-900"
            >
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="commit-branch-select">
                  Branch per il deploy
                </label>
                <select
                  id="commit-branch-select"
                  value={commitBranchOverride.trim() || commitDefaultBranch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCommitBranchOverride(value === commitDefaultBranch ? '' : value);
                  }}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={commitDefaultBranch}>
                    {commitDefaultBranch} (predefinito)
                  </option>
                  {branchOptions
                    .filter((option) => option !== commitDefaultBranch)
                    .map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={fetchCommitOptions}
                disabled={commitLoading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 leading-none"
              >
                {commitLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Aggiorna
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Il branch selezionato vale solo per questo deploy manuale e non modifica la configurazione del team.
            </p>
            {commitError && (
              <div className="text-sm text-red-600">{commitError}</div>
            )}
            <input
              type="text"
              value={commitSearchTerm}
              onChange={(e) => setCommitSearchTerm(e.target.value)}
              placeholder="Cerca per commit o messaggio..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
            />
            <div className="border border-slate-200 rounded-lg h-64 overflow-auto divide-y divide-slate-100">
              {commitLoading ? (
                <div className="p-4 text-sm text-slate-600">Caricamento commit...</div>
              ) : filteredCommitOptions.length === 0 ? (
                <div className="p-4 text-sm text-slate-600">Nessun commit trovato.</div>
              ) : (
                filteredCommitOptions.map((commit) => {
                  const isSelected = selectedCommit?.sha === commit.sha;
                  return (
                    <button
                      key={commit.sha}
                      type="button"
                      onClick={() => setSelectedCommit(commit)}
                      className={`w-full text-left px-4 py-3 transition ${
                        isSelected
                          ? 'bg-emerald-50 border-l-4 border-emerald-500'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-500">
                          {commit.sha.slice(0, 7)}
                        </span>
                        {commit.date && (
                          <span className="text-xs text-slate-400">
                            {new Date(commit.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-slate-900">
                        {commit.message || '(senza messaggio)'}
                      </div>
                      {commit.author && (
                        <div className="mt-1 text-xs text-slate-500">{commit.author}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCommitModalOpen(false);
                  setSelectedCommit(null);
                  setCommitSearchTerm('');
                  setCommitBranchOverride('');
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeployCommit}
                disabled={!selectedCommit || deployingCommit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
              >
                {deployingCommit && <Loader2 size={16} className="mr-2 animate-spin" />}
                {deployingCommit ? 'Deploy in corso...' : 'Deploy commit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

      {deployLogsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-semibold text-slate-900">Output del deploy</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchDeployLogs}
                  disabled={deployLogsLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 leading-none"
                >
                  {deployLogsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Aggiorna
                </button>
                <button
                  type="button"
                  onClick={handleCloseDeployLogs}
                  className="text-slate-600 hover:text-slate-900"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4">
              {deployLogsError && (
                <div className="mb-3 text-sm text-red-600">{deployLogsError}</div>
              )}
              <div
                ref={deployLogsRef}
                onScroll={() => {
                  const el = deployLogsRef.current;
                  if (!el) return;
                  const threshold = 24;
                  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
                  deployLogsAutoScrollRef.current = atBottom;
                  setDeployLogsAutoScroll(atBottom);
                }}
                className="border border-slate-200 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono p-4 h-72 overflow-auto whitespace-pre-wrap break-all"
              >
                {deployLogsLoading && !deployLogsText
                  ? 'Caricamento log del deploy...'
                  : deployLogsText || 'Nessun log disponibile.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
