'use client';

import { useEffect, useState } from 'react';
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
      <div className="text-center py-8 text-slate-600">
        No teams created yet. Create your first team using the form above.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {teams.map((team) => (
        <div
          key={team.name}
          className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600"
        >
          <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
          <div className="mt-4 text-sm text-slate-600">
            <p>Directory: <code className="bg-slate-100 px-2 py-1 rounded">/opt/apps/team-{team.name}</code></p>
          </div>
          <button
            onClick={() => onTeamSelect?.(team.name)}
            className="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
          >
            ⚙️ Settings
          </button>
        </div>
      ))}
    </div>
  );
}
