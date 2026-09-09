import { useEffect, useState } from 'react';
import { Players, Teams } from '../api/api.js';

export default function PlayerRecords() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ team_id: '', name: '', role: 'batsman', jersey_no: '' });
  const [deletingId, setDeletingId] = useState(null);

  const loadPlayers = () => Players.listAll().then(setPlayers);

  useEffect(() => {
    loadPlayers();
    Teams.list().then(setTeams);
  }, []);

  const openPlayer = async (p) => {
    setSelected(p);
    setLoadingStats(true);
    const data = await Players.stats(p.id);
    setStats(data);
    setLoadingStats(false);
  };

  const addPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayer.team_id || !newPlayer.name.trim()) return;
    await Players.create({ ...newPlayer, jersey_no: newPlayer.jersey_no || null });
    setNewPlayer({ team_id: newPlayer.team_id, name: '', role: 'batsman', jersey_no: '' });
    setShowAdd(false);
    loadPlayers();
  };

  const removePlayer = async (p, e) => {
    e.stopPropagation();
    if (!confirm(`Remove ${p.name}? Their past match stats stay on record, but they won't be selectable in new matches.`)) return;
    setDeletingId(p.id);
    try {
      await Players.remove(p.id);
      if (selected?.id === p.id) { setSelected(null); setStats(null); }
      await loadPlayers();
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const grouped = filtered.reduce((acc, p) => {
    (acc[p.team_name] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="grid md:grid-cols-2 gap-6 fade-in">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Player Stats</h1>
          <button className="btn btn-primary text-sm" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? 'Cancel' : '+ Add Player'}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Career records for players on your own teams only.</p>

        {showAdd && (
          <form onSubmit={addPlayer} className="card space-y-3 mb-4">
            <select className="input" value={newPlayer.team_id} onChange={e => setNewPlayer({ ...newPlayer, team_id: e.target.value })}>
              <option value="">Select team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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
        )}

        <input className="input mb-4" placeholder="Search player…" value={search} onChange={e => setSearch(e.target.value)} />

        {Object.keys(grouped).length === 0 && (
          <div className="card text-slate-400">No players found. Add one above.</div>
        )}

        {Object.entries(grouped).map(([teamName, teamPlayers]) => (
          <div key={teamName} className="mb-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">{teamName}</h2>
            <div className="space-y-1">
              {teamPlayers.map(p => (
                <div key={p.id} onClick={() => openPlayer(p)}
                  className={`card flex items-center justify-between py-2 cursor-pointer hover:border-emerald-500 ${selected?.id === p.id ? 'border-emerald-500' : ''}`}>
                  <span>#{p.jersey_no ?? '-'} {p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{p.role}</span>
                    <button onClick={(e) => removePlayer(p, e)} disabled={deletingId === p.id}
                      className="text-red-400 hover:text-red-300 text-xs">
                      {deletingId === p.id ? '…' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-4">Career Record</h1>
        {!selected && <div className="card text-slate-400">Select a player to see their full batting & bowling record.</div>}

        {selected && loadingStats && <div className="card text-slate-400">Loading…</div>}

        {selected && stats && !loadingStats && (
          <div className="space-y-4">
            <div className="card">
              <h2 className="text-xl font-bold">{stats.player.name}</h2>
              <p className="text-sm text-slate-400">{stats.player.team_name} · {stats.player.role}</p>
            </div>

            <div className="card">
              <h3 className="font-semibold mb-3 text-emerald-400">🏏 Batting</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Innings Batted" value={stats.batting.innings_batted} />
                <Stat label="Runs Scored" value={stats.batting.runs} />
                <Stat label="Balls Faced" value={stats.batting.balls_faced} />
                <Stat label="Fours" value={stats.batting.fours} />
                <Stat label="Sixes" value={stats.batting.sixes} />
                <Stat label="Strike Rate" value={stats.batting.strike_rate} />
                <Stat label="Average" value={stats.batting.average} />
                <Stat label="Times Out" value={stats.batting.times_out} />
                <Stat label="Not Outs" value={stats.batting.not_outs} />
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold mb-3 text-orange-400">🎯 Bowling</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Innings Bowled" value={stats.bowling.innings_bowled} />
                <Stat label="Overs Bowled" value={stats.bowling.overs} />
                <Stat label="Balls Bowled" value={stats.bowling.balls_bowled} />
                <Stat label="Runs Given" value={stats.bowling.runs_given} />
                <Stat label="Wickets" value={stats.bowling.wickets} />
                <Stat label="Economy" value={stats.bowling.economy} />
                <Stat label="Fours Given" value={stats.bowling.fours_given} />
                <Stat label="Sixes Given" value={stats.bowling.sixes_given} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-900 rounded-lg p-2">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
