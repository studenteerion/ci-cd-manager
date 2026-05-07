'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Webhook, Settings } from 'lucide-react';
import { TeamList } from '@/components/TeamList';
import { TeamDetailsModal } from '@/components/TeamDetailsModal';
import { TeamInfo } from '@/actions/teams';

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        </div>
        {systemStatus && (
          <p className="mt-4 text-sm text-slate-600">{systemStatus}</p>
        )}
      </div>

      {/* Teams List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Teams ({teams.length})
        </h2>
        {loading ? (
          <div className="text-center text-slate-600">Loading teams...</div>
        ) : (
          <TeamList teams={teams} refreshKey={refreshKey} onTeamSelect={handleTeamSelect} />
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
