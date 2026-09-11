
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Teams, Matches } from '../api/api.js';
import TeamAutocomplete from '../components/TeamAutocomplete.jsx';

export default function CreateMatch() {
  const [teams, setTeams] = useState([]);
  const [team1Id, setTeam1Id] = useState(null);
  const [team2Id, setTeam2Id] = useState(null);
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  const refreshTeams = () => {
    Teams.list().then(setTeams);
  };

  useEffect(() => {
    refreshTeams();
  }, []);

  const submit = async (e) => {
    e.preventDefault();

    if (!team1Id || !team2Id) {
      return alert('Select both teams');
    }

    if (team1Id === team2Id) {
      return alert('Teams must be different');
    }

    setCreating(true);

    try {
      const match = await Matches.create({
        team1_id: team1Id,
        team2_id: team2Id
      });

      navigate(`/match/${match.id}/setup`);
    } catch (error) {
      console.error('Create match error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to create scoreboard'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCreated = (team, which) => {
    setTeams((t) => [team, ...t]);

    if (which === 1) {
      setTeam1Id(team.id);
    } else {
      setTeam2Id(team.id);
    }
  };

  return (
    <div className="max-w-lg mx-auto fade-in">
      <h1 className="text-2xl font-bold mb-1">
        New Scoreboard
      </h1>

      <p className="text-sm text-slate-500 mb-4">
        Type a team name — pick an existing one, or create it on the spot.
      </p>

      <form onSubmit={submit} className="card space-y-4">
        {/* TEAM 1 */}
        <div>
          <label className="text-sm text-slate-400 mb-1 block">
            Team 1
          </label>

          <TeamAutocomplete
            teams={teams}
            value={team1Id}
            excludeId={team2Id}
            onChange={setTeam1Id}
            onCreated={(t) => handleCreated(t, 1)}
            placeholder="Type Team 1 name…"
          />
        </div>

        {/* TEAM 2 */}
        <div>
          <label className="text-sm text-slate-400 mb-1 block">
            Team 2
          </label>

          <TeamAutocomplete
            teams={teams}
            value={team2Id}
            excludeId={team1Id}
            onChange={setTeam2Id}
            onCreated={(t) => handleCreated(t, 2)}
            placeholder="Type Team 2 name…"
          />
        </div>

        {/* CREATE */}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={creating}
        >
          {creating
            ? 'Creating Scoreboard…'
            : 'Create Scoreboard'}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-3">
        Need to add players first?{' '}
        <Link
          to="/teams"
          className="underline hover:text-emerald-400"
        >
          Manage Teams
        </Link>
      </p>
    </div>
  );
}

