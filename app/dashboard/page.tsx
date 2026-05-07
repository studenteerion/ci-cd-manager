'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateTeamForm } from '@/components/CreateTeamForm';
import { TeamList } from '@/components/TeamList';
import { TeamDetailsModal } from '@/components/TeamDetailsModal';
import { TeamInfo } from '@/actions/teams';

export default function DashboardPage() {
  const router = useRouter();
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

  const handleLogout = () => {
    document.cookie =
      'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    router.push('/login');
  };

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

  const handleTeamCreated = () => {
    setRefreshKey(prev => prev + 1);
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Multi-Tenant Dashboard
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Actions */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">System Actions</h2>
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={handleReloadCaddy}
              disabled={systemLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50"
            >
              🔄 Reload Caddy
            </button>
            <button
              onClick={handleRestartWebhook}
              disabled={systemLoading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition disabled:opacity-50"
            >
              🔄 Restart Webhook
            </button>
          </div>
          {systemStatus && (
            <p className="mt-4 text-sm text-slate-600">{systemStatus}</p>
          )}
        </div>

        {/* Create Team Form */}
        <div className="mb-8">
          <CreateTeamForm onSuccess={handleTeamCreated} />
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
      </main>

      {/* Team Details Modal */}
      {selectedTeam && (
        <TeamDetailsModal
          teamId={selectedTeam}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      )}
    </div>
  );
}
