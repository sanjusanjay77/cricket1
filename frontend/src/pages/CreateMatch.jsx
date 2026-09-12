import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Teams, Matches } from '../api/api.js';
import TeamAutocomplete from '../components/TeamAutocomplete.jsx';

export default function CreateMatch() {
  const [teams, setTeams] = useState([]);
  const [team1Id, setTeam1Id] = useState(null);
  const [team2Id, setTeam2Id] = useState(null);
  const [oversLimit, setOversLimit] = useState('20');
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    Teams.list()
      .then(setTeams)
      .catch((error) => {
        console.error('Failed to load teams:', error);
      });
  }, []);

  const handleCreated = (team, which) => {
    setTeams((current) => [team, ...current]);

    if (which === 1) {
      setTeam1Id(team.id);
    } else {
      setTeam2Id(team.id);
    }
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!team1Id || !team2Id) {
      alert('Please select both teams.');
      return;
    }

    if (team1Id === team2Id) {
      alert('Please select two different teams.');
      return;
    }

    const overs = Number(oversLimit);

    if (
      !Number.isFinite(overs) ||
      overs <= 0 ||
      !Number.isInteger(overs)
    ) {
      alert('Please enter a valid number of overs.');
      return;
    }

    setCreating(true);

    try {
      const match = await Matches.create({
        team1_id: team1Id,
        team2_id: team2Id,
        overs_limit: overs,
      });

      navigate(`/match/${match.id}/setup`);
    } catch (error) {
      console.error('Create match error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to create scoreboard.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen pb-6">
      <div className="max-w-xl mx-auto px-3 sm:px-0">

        {/* HEADER */}
        <div className="pt-2 pb-5">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-4"
          >
            ← Matches
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">
              🏏
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                New Scoreboard
              </h1>

              <p className="text-sm text-slate-500 mt-0.5">
                Set up your match in a few seconds
              </p>
            </div>
          </div>
        </div>

        {/* FORM */}
        <form onSubmit={submit} className="space-y-3">

          {/* TEAMS CARD */}
          <div className="card p-4 sm:p-5">

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base">
                  Select Teams
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">
                  Choose the two teams playing
                </p>
              </div>

              <span className="text-xl">⚔️</span>
            </div>

            {/* TEAM 1 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Team 1
              </label>

              <TeamAutocomplete
                teams={teams}
                value={team1Id}
                excludeId={team2Id}
                onChange={setTeam1Id}
                onCreated={(team) => handleCreated(team, 1)}
                placeholder="Search or create Team 1"
              />
            </div>

            {/* VS */}
            <div className="flex items-center gap-3 my-3">
              <div className="h-px bg-slate-800 flex-1" />

              <span className="text-[11px] font-black text-slate-600">
                VS
              </span>

              <div className="h-px bg-slate-800 flex-1" />
            </div>

            {/* TEAM 2 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Team 2
              </label>

              <TeamAutocomplete
                teams={teams}
                value={team2Id}
                excludeId={team1Id}
                onChange={setTeam2Id}
                onCreated={(team) => handleCreated(team, 2)}
                placeholder="Search or create Team 2"
              />
            </div>

          </div>

          {/* MATCH SETTINGS */}
          <div className="card p-4 sm:p-5">

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base">
                  Match Settings
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">
                  Choose the number of overs
                </p>
              </div>

              <span className="text-xl">⚙️</span>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Overs per innings
            </label>

            {/* QUICK OVERS */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {[5, 8, 10, 15, 20].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOversLimit(String(value))}
                  className={`h-11 rounded-xl border text-sm font-bold transition ${
                    Number(oversLimit) === value
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            {/* CUSTOM OVERS */}
            <input
              type="number"
              min="1"
              step="1"
              value={oversLimit}
              onChange={(e) => setOversLimit(e.target.value)}
              className="input w-full h-12 text-base"
              placeholder="Enter custom overs"
              required
            />

            <p className="text-[11px] text-slate-500 mt-2">
              You can use any whole number of overs.
            </p>

          </div>

          {/* MATCH PREVIEW */}
          {(team1Id || team2Id) && (
            <div className="card p-4">

              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-600 mb-3">
                Match Preview
              </div>

              <div className="flex items-center justify-between gap-3">

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 mb-1">
                    Team 1
                  </div>

                  <div className="font-bold truncate">
                    {teams.find((t) => t.id === team1Id)?.name ||
                      'Not selected'}
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500">
                  VS
                </div>

                <div className="flex-1 min-w-0 text-right">
                  <div className="text-xs text-slate-500 mb-1">
                    Team 2
                  </div>

                  <div className="font-bold truncate">
                    {teams.find((t) => t.id === team2Id)?.name ||
                      'Not selected'}
                  </div>
                </div>

              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Format
                </span>

                <span className="font-semibold text-slate-300">
                  {oversLimit || '—'} overs
                </span>
              </div>

            </div>
          )}

          {/* CREATE BUTTON */}
          <button
            type="submit"
            disabled={creating}
            className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-base shadow-lg shadow-emerald-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">
                  ⟳
                </span>
                Creating match...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                🏏
                Start New Scoreboard
                <span>→</span>
              </span>
            )}
          </button>

        </form>

        {/* FOOTER HELP */}
        <div className="text-center mt-5">
          <p className="text-xs text-slate-600">
            Need to add players first?
          </p>

          <Link
            to="/teams"
            className="inline-block mt-1 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Manage Teams →
          </Link>
        </div>

      </div>
    </div>
  );
}
