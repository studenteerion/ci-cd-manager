'use client';

import { useEffect, useState } from 'react';
import { Settings, Folder } from 'lucide-react';
import { TeamInfo } from '@/actions/teams';

interface TeamListProps {
  teams: TeamInfo[];
  refreshKey: number;
  onTeamSelect?: (teamId: string) => void;
}

export function TeamList({ teams: initialTeams, refreshKey, onTeamSelect }: TeamListProps) {
  const [teams, setTeams] = useState<TeamInfo[]>(initialTeams);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((team) => (
        <div
          key={team.name}
          className="bg-slate-50 rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition"
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
            <Folder size={24} className="text-blue-500" />
          </div>
          <div className="text-sm text-slate-600 mb-4 space-y-1">
            <p className="font-mono text-xs bg-white px-2 py-1 rounded border border-slate-200">
              /opt/apps/team-{team.name}
            </p>
          </div>
          <button
            onClick={() => onTeamSelect?.(team.name)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      ))}
    </div>
  );
}
