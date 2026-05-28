'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Folder, Zap, Circle } from 'lucide-react';
import { TeamInfo } from '@/actions/teams';

interface TeamListProps {
  teams: TeamInfo[];
  refreshKey: number;
  onTeamSelect?: (teamId: string) => void;
  filterText?: string;
  statusFilter?: string;
}

interface TeamWithPort extends TeamInfo {
  hostPort?: number;
  status?: string;
  domain?: string;
}

export function TeamList({
  teams: initialTeams,
  refreshKey,
  onTeamSelect,
  filterText,
  statusFilter,
}: TeamListProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamWithPort[]>(initialTeams);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/teams');
        const data = await response.json();
        if (data.teams) {
          // Fetch port and status for each team
          const teamsWithPorts = await Promise.all(
            data.teams.map(async (team: TeamInfo) => {
              try {
                const [portRes, statusRes] = await Promise.all([
                  fetch(`/api/teams/${team.name}/port`),
                  fetch(`/api/teams/${team.name}/status`),
                ]);
                const portData = await portRes.json();
                const statusData = await statusRes.json();
                return {
                  ...team,
                  hostPort: portData.hostPort,
                  status: statusData.status,
                  domain: portData.domain,
                };
              } catch {
                return team;
              }
            })
          );
          setTeams(teamsWithPorts);
        }
      } catch (error) {
        console.error('Failed to fetch teams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [refreshKey]);

  if (loading) {
    return <div className="text-center text-slate-600">Loading teams...</div>;
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-slate-600">
        <Folder size={48} className="mx-auto mb-4 text-slate-400" />
        <p>No teams created yet.</p>
      </div>
    );
  }

  const normalizedSearch = (filterText || '').trim().toLowerCase();
  const normalizedStatus = (statusFilter || '').trim().toLowerCase();
  const filteredTeams = teams.filter((team) => {
    const matchesStatus = normalizedStatus
      ? (team.status || '').toLowerCase() === normalizedStatus
      : true;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;
    const matchesName = team.name.toLowerCase().includes(normalizedSearch);
    const matchesDomain = (team.domain || '').toLowerCase().includes(normalizedSearch);
    const matchesPort = team.hostPort
      ? team.hostPort.toString().includes(normalizedSearch)
      : false;
    return matchesName || matchesDomain || matchesPort;
  });

  return (
    <>
      {filteredTeams.length === 0 ? (
        <div className="text-center py-12 text-slate-600">
          <Folder size={48} className="mx-auto mb-4 text-slate-400" />
          <p>Nessun team trovato.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map((team) => (
            <div
              key={team.name}
              className="bg-slate-50 rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                <Folder size={24} className="text-blue-500" />
              </div>
              <div className="text-sm text-slate-600 mb-4 space-y-2">
                <p className="font-mono text-xs bg-white px-2 py-1 rounded border border-slate-200">
                  /opt/apps/{team.name}
                </p>
                {team.domain && (
                  <p className="flex items-center gap-2 text-slate-700">
                    <Zap size={16} className="text-amber-500" />
                    <a
                      href={`https://${team.domain}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {team.domain}
                    </a>
                  </p>
                )}
                {team.hostPort && (
                  <p className="flex items-center gap-2 text-slate-700">
                    <Zap size={16} className="text-amber-500" />
                    <span className="font-mono">localhost:{team.hostPort}</span>
                  </p>
                )}
                {team.status && (
                  <p className="flex items-center gap-2 text-slate-700">
                    <Circle
                      size={12}
                      className={`fill-current ${
                        team.status === 'running'
                          ? 'text-green-500'
                          : team.status === 'stopped' || team.status === 'exited'
                          ? 'text-red-500'
                          : team.status === 'restarting'
                          ? 'text-yellow-500'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="text-sm capitalize">{team.status}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => router.push(`/dashboard/teams/${team.name}`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Settings size={18} />
                Settings
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
