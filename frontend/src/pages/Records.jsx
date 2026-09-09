import { useEffect, useState } from 'react';
import { Records as RecordsApi } from '../api/api.js';

function LeaderboardCard({ title, icon, list, valueKey, unit = '', minLabel }) {
  if (!list || list.length === 0) return null;
  return (
    <div className="card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">{icon} {title}</h3>
      {minLabel && <p className="text-xs text-slate-500 mb-2">{minLabel}</p>}
      <div className="space-y-1.5">
        {list.map((entry, idx) => (
          <div key={entry.player_id} className="flex items-center justify-between text-sm py-1 border-b border-slate-700/40 last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-5 text-slate-500 font-bold">{idx + 1}</span>
              <span className="font-medium">{entry.player_name || 'Unknown'}</span>
              {entry.team_short && <span className="text-xs text-slate-500">({entry.team_short})</span>}
            </div>
            <span className="font-bold text-emerald-400">{entry[valueKey]}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BestSingle({ title, icon, entry, line }) {
  if (!entry) return null;
  return (
    <div className="card">
      <h3 className="font-semibold mb-2 flex items-center gap-2">{icon} {title}</h3>
      <div className="text-2xl font-extrabold">{entry.player_name}</div>
      <div className="text-slate-400 text-sm">{line(entry)}</div>
      {entry.match_label && <div className="text-xs text-slate-500 mt-1">{entry.match_label}</div>}
    </div>
  );
}

export default function Records() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { RecordsApi.get().then(setRecords).finally(() => setLoading(false)); }, []);

  if (loading) return <p className="text-slate-400">Loading records…</p>;

  return (
    <div className="fade-in space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">📜 All-Time Records</h1>
        <p className="text-sm text-slate-500">Leaderboards computed across every ball ever bowled in this database.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <BestSingle title="Highest Individual Score" icon="🏏" entry={records.highestScore}
          line={(e) => `${e.runs} (${e.balls} balls, ${e.fours}x4, ${e.sixes}x6) · SR ${e.strike_rate}`} />
        <BestSingle title="Best Bowling Figures" icon="🎯" entry={records.bestBowling}
          line={(e) => `${e.wickets}/${e.runs} in ${e.overs} overs · Econ ${e.economy}`} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <LeaderboardCard title="Most Runs" icon="🏆" list={records.mostRuns} valueKey="runs" />
        <LeaderboardCard title="Most Wickets" icon="🏆" list={records.mostWickets} valueKey="wickets" />
        <LeaderboardCard title="Most Fours" icon="🔥" list={records.mostFours} valueKey="fours" />
        <LeaderboardCard title="Most Sixes" icon="🚀" list={records.mostSixes} valueKey="sixes" />
        <LeaderboardCard title="Best Strike Rate" icon="⚡" list={records.bestStrikeRate} valueKey="strike_rate" minLabel="Minimum 10 balls faced" />
        <LeaderboardCard title="Best Economy" icon="🛡️" list={records.bestEconomy} valueKey="economy" minLabel="Minimum 2 overs bowled" />
        <LeaderboardCard title="Most Balls Faced" icon="⏱️" list={records.mostBallsFaced} valueKey="balls_faced" />
        <LeaderboardCard title="Most Balls Bowled" icon="⏱️" list={records.mostBallsBowled} valueKey="balls_bowled" />
      </div>

      {!records.highestScore && (
        <div className="card text-center text-slate-400">No balls scored yet — records will populate as matches are played.</div>
      )}
    </div>
  );
}
