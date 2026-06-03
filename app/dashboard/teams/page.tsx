'use client';

import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Webhook, Settings, FileText, X } from 'lucide-react';
import { TeamList } from '@/components/TeamList';
import { TeamDetailsModal } from '@/components/TeamDetailsModal';
import { TeamInfo } from '@/actions/teams';

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('');
  const [systemLogsOpen, setSystemLogsOpen] = useState<'caddy' | 'webhook' | null>(null);
  const [systemLogsText, setSystemLogsText] = useState('');
  const [systemLogsError, setSystemLogsError] = useState('');
  const [systemLogsLoading, setSystemLogsLoading] = useState(false);
  const systemLogsRef = useRef<HTMLDivElement | null>(null);
  const [systemLogsAutoScroll, setSystemLogsAutoScroll] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/teams');
        const data = await response.json();
        if (data.teams) {
          setTeams(data.teams);
        }
      } catch (error) {
        console.error('Failed to fetch teams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [refreshKey]);

  useEffect(() => {
    if (systemLogsOpen && systemLogsRef.current && systemLogsAutoScroll) {
      systemLogsRef.current.scrollTop = systemLogsRef.current.scrollHeight;
    }
  }, [systemLogsOpen, systemLogsText, systemLogsAutoScroll]);

  const handleReloadCaddy = async () => {
    setSystemLoading(true);
    setSystemStatus('');
    try {
      const response = await fetch('/api/system/reload-caddy', { method: 'POST' });
      const data = await response.json();
      setSystemStatus(data.message);
    } catch (error) {
      setSystemStatus('Failed to reload Caddy');
    } finally {
      setSystemLoading(false);
    }
  };

  const handleRestartWebhook = async () => {
    setSystemLoading(true);
    setSystemStatus('');
    try {
      const response = await fetch('/api/system/restart-webhook', { method: 'POST' });
      const data = await response.json();
      setSystemStatus(data.message);
    } catch (error) {
      setSystemStatus('Failed to restart webhook');
    } finally {
      setSystemLoading(false);
    }
  };

  const loadSystemLogs = async (type: 'caddy' | 'webhook') => {
    setSystemLogsLoading(true);
    setSystemLogsError('');
    try {
      const response = await fetch(`/api/system/${type}-logs?tail=200`);
      const data = await response.json();
      if (data.success) {
        setSystemLogsText(data.logs || '');
      } else {
        setSystemLogsError(data.message || 'Failed to load logs');
      }
    } catch (error) {
      setSystemLogsError('Failed to load logs');
      console.error('Failed to load system logs:', error);
    } finally {
      setSystemLogsLoading(false);
      if (systemLogsRef.current && systemLogsAutoScroll) {
        systemLogsRef.current.scrollTop = systemLogsRef.current.scrollHeight;
      }
    }
  };

  const handleTeamSelect = (teamId: string) => {
    setSelectedTeam(teamId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTeam(null);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Teams</h1>
        <p className="text-slate-600">Manage your deployed teams and infrastructure</p>
      </div>

      {/* System Actions */}
      <div className="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Settings size={20} />
          System Actions
        </h2>
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleReloadCaddy}
            disabled={systemLoading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
          >
            <RefreshCw size={18} />
            Reload Caddy
          </button>
          <button
            onClick={handleRestartWebhook}
            disabled={systemLoading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition disabled:opacity-50 font-medium"
          >
            <Webhook size={18} />
            Restart Webhook
          </button>
          <button
            onClick={() => {
              if (systemLogsOpen === 'caddy') {
                setSystemLogsOpen(null);
                return;
              }
              setSystemLogsOpen('caddy');
              loadSystemLogs('caddy');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium"
          >
            <FileText size={18} />
            Visualizza log Caddy
          </button>
          <button
            onClick={() => {
              if (systemLogsOpen === 'webhook') {
                setSystemLogsOpen(null);
                return;
              }
              setSystemLogsOpen('webhook');
              loadSystemLogs('webhook');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium"
          >
            <FileText size={18} />
            Visualizza log Webhook
          </button>
        </div>
        {systemStatus && (
          <p className="mt-4 text-sm text-slate-600">{systemStatus}</p>
        )}
        {systemLogsOpen && (
          <div className="mt-6 border border-slate-200 rounded-lg bg-slate-900 text-slate-100 max-w-full w-full overflow-x-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
              <span className="text-sm font-medium capitalize">
                {systemLogsOpen} logs
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadSystemLogs(systemLogsOpen)}
                  disabled={systemLogsLoading}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setSystemLogsOpen(null)}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {systemLogsError && (
              <div className="px-4 py-2 text-xs text-red-300">{systemLogsError}</div>
            )}
            <div
              ref={systemLogsRef}
              onScroll={() => {
                const el = systemLogsRef.current;
                if (!el) return;
                const threshold = 24;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
                setSystemLogsAutoScroll(atBottom);
              }}
              className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto min-w-0"
            >
              {systemLogsLoading ? 'Loading logs...' : systemLogsText || 'No logs available.'}
            </div>
          </div>
        )}
      </div>

      {/* Teams List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Teams ({teams.length})
          </h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Cerca per nome, dominio o porta..."
              className="h-9 w-64 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tutti gli stati</option>
              <option value="running">In esecuzione</option>
              <option value="restarting">In riavvio</option>
              <option value="stopped">Fermato</option>
              <option value="exited">Uscito</option>
              <option value="unknown">Sconosciuto</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="text-center text-slate-600">Loading teams...</div>
        ) : (
          <TeamList
            teams={teams}
            refreshKey={refreshKey}
            onTeamSelect={handleTeamSelect}
            filterText={teamSearch}
            statusFilter={statusFilter}
          />
        )}
      </div>

      {/* Team Details Modal */}
      {selectedTeam && (
        <TeamDetailsModal
          teamId={selectedTeam}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      )}
    </>
  );
}
