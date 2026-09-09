import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Teams, Matches } from '../api/api.js';
import TeamAutocomplete from '../components/TeamAutocomplete.jsx';

const OVERS_PRESETS = [5, 6, 8, 10, 15, 20, 25, 30, 40, 50];

export default function CreateMatch() {
  const [teams, setTeams] = useState([]);
  const [team1Id, setTeam1Id] = useState(null);
  const [team2Id, setTeam2Id] = useState(null);
  const [oversLimit, setOversLimit] = useState(20);
  const [customOvers, setCustomOvers] = useState(false);
  const navigate = useNavigate();

  const refreshTeams = () => Teams.list().then(setTeams);
  useEffect(() => { refreshTeams(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!team1Id || !team2Id) return alert('Select both teams');
    if (team1Id === team2Id) return alert('Teams must be different');
    const match = await Matches.create({ team1_id: team1Id, team2_id: team2Id, overs_limit: oversLimit });
    navigate(`/match/${match.id}/setup`);
  };

  const handleCreated = (team, which) => {
    setTeams(t => [team, ...t]);
    if (which === 1) setTeam1Id(team.id); else setTeam2Id(team.id);
  };

  return (
    <div className="max-w-lg mx-auto fade-in">
      <h1 className="text-2xl font-bold mb-1">New Scoreboard</h1>
      <p className="text-sm text-slate-500 mb-4">Type a team name — pick an existing one, or create it on the spot.</p>

      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="text-sm text-slate-400 mb-1 block">Team 1</label>
          <TeamAutocomplete teams={teams} value={team1Id} excludeId={team2Id}
            onChange={setTeam1Id} onCreated={(t) => handleCreated(t, 1)} placeholder="Type Team 1 name…" />
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">Team 2</label>
          <TeamAutocomplete teams={teams} value={team2Id} excludeId={team1Id}
            onChange={setTeam2Id} onCreated={(t) => handleCreated(t, 2)} placeholder="Type Team 2 name…" />
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">Overs per innings</label>
          {!customOvers ? (
            <select className="input" value={oversLimit}
              onChange={e => {
                if (e.target.value === 'custom') { setCustomOvers(true); return; }
                setOversLimit(Number(e.target.value));
              }}>
              {OVERS_PRESETS.map(o => <option key={o} value={o}>{o} overs</option>)}
              <option value="custom">Custom…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input type="number" min={1} className="input" value={oversLimit} autoFocus
                onChange={e => setOversLimit(Number(e.target.value))} />
              <button type="button" className="btn btn-secondary text-sm shrink-0" onClick={() => setCustomOvers(false)}>Presets</button>
            </div>
          )}
        </div>
        <button className="btn btn-primary w-full">Create Scoreboard</button>
      </form>

      <p className="text-sm text-slate-500 mt-3">
        Need to add players first? <Link to="/teams" className="underline hover:text-emerald-400">Manage Teams</Link>
      </p>
    </div>
  );
}
