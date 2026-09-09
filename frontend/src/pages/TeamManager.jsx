import { useEffect, useState } from 'react';
import { Teams, Players } from '../api/api.js';

export default function TeamManager() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [newTeam, setNewTeam] = useState({ name: '', short_name: '', logo_color: '#1e3a8a', is_own: false });
  const [newPlayer, setNewPlayer] = useState({ name: '', role: 'batsman', jersey_no: '' });

  const refresh = () => Teams.list().then(setTeams);
  useEffect(() => { refresh(); }, []);

  const openTeam = (id) => Teams.get(id).then(setSelectedTeam);

  const createTeam = async (e) => {
    e.preventDefault();
    if (!newTeam.name || !newTeam.short_name) return;
    await Teams.create(newTeam);
    setNewTeam({ name: '', short_name: '', logo_color: '#1e3a8a', is_own: false });
    refresh();
  };

  const toggleOwn = async (team, e) => {
    e.stopPropagation();
    await Teams.update(team.id, { is_own: !team.is_own });
    refresh();
    if (selectedTeam?.id === team.id) openTeam(team.id);
  };

  const addPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayer.name || !selectedTeam) return;
    await Players.create({ ...newPlayer, team_id: selectedTeam.id, jersey_no: newPlayer.jersey_no || null });
    setNewPlayer({ name: '', role: 'batsman', jersey_no: '' });
    openTeam(selectedTeam.id);
  };

  const removePlayer = async (id) => {
    await Players.remove(id);
    openTeam(selectedTeam.id);
  };

  const removeTeam = async (id) => {
    if (!confirm('Delete this team and all its players?')) return;
    await Teams.remove(id);
    setSelectedTeam(null);
    refresh();
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold mb-1">Teams</h1>
        <p className="text-sm text-slate-500 mb-4">Mark your own team(s) with ⭐ — Player Stats only shows players from teams marked this way; everyone else is treated as an opponent.</p>
        <form onSubmit={createTeam} className="card space-y-3 mb-4">
          <h2 className="font-semibold">Create Team</h2>
          <input className="input" placeholder="Team name (e.g. GCC)"
            value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} />
          <input className="input" placeholder="Short code (e.g. GCC)" maxLength={5}
            value={newTeam.short_name} onChange={e => setNewTeam({ ...newTeam, short_name: e.target.value.toUpperCase() })} />
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400 flex items-center gap-1">Color
              <input type="color" value={newTeam.logo_color} onChange={e => setNewTeam({ ...newTeam, logo_color: e.target.value })} />
            </label>
            <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newTeam.is_own} onChange={e => setNewTeam({ ...newTeam, is_own: e.target.checked })} />
              ⭐ This is my team
            </label>
          </div>
          <button className="btn btn-primary w-full">Create Team</button>
        </form>

        <div className="space-y-2">
          {teams.map(t => (
            <div key={t.id} onClick={() => openTeam(t.id)}
              className={`card cursor-pointer flex items-center justify-between hover:border-emerald-500 ${selectedTeam?.id === t.id ? 'border-emerald-500' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: t.logo_color }}>
                  {t.short_name}
                </span>
                <span className="font-medium">{t.name}</span>
                {!!t.is_own && <span className="text-xs bg-emerald-600/30 text-emerald-400 px-2 py-0.5 rounded-full">⭐ My team</span>}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={(e) => toggleOwn(t, e)} className="text-xs text-slate-400 hover:text-yellow-400" title="Toggle 'my team'">
                  {t.is_own ? 'Unmark' : 'Mark as mine'}
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeTeam(t.id); }} className="text-red-400 text-sm hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-4">Squad</h1>
        {!selectedTeam && <div className="card text-slate-400">Select a team to manage its players.</div>}
        {selectedTeam && (
          <div>
            <div className="card mb-4">
              <h2 className="font-semibold mb-2">{selectedTeam.name} ({selectedTeam.players.length} players)</h2>
              <ul className="divide-y divide-slate-700">
                {selectedTeam.players.map(p => (
                  <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                    <span>#{p.jersey_no ?? '-'} {p.name} <span className="text-slate-400">({p.role})</span></span>
                    <button onClick={() => removePlayer(p.id)} className="text-red-400 hover:text-red-300">Remove</button>
                  </li>
                ))}
                {selectedTeam.players.length === 0 && <li className="py-2 text-slate-500 text-sm">No players yet.</li>}
              </ul>
            </div>

            <form onSubmit={addPlayer} className="card space-y-3">
              <h2 className="font-semibold">Add Player</h2>
              <input className="input" placeholder="Player name" value={newPlayer.name}
                onChange={e => setNewPlayer({ ...newPlayer, name: e.target.value })} />
              <div className="flex gap-2">
                <select className="input" value={newPlayer.role} onChange={e => setNewPlayer({ ...newPlayer, role: e.target.value })}>
                  <option value="batsman">Batsman</option>
                  <option value="bowler">Bowler</option>
                  <option value="all-rounder">All-rounder</option>
                  <option value="wicketkeeper">Wicketkeeper</option>
                </select>
                <input className="input" type="number" placeholder="Jersey #" value={newPlayer.jersey_no}
                  onChange={e => setNewPlayer({ ...newPlayer, jersey_no: e.target.value })} />
              </div>
              <button className="btn btn-primary w-full">Add Player</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
