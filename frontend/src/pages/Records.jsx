import { useEffect, useState } from 'react';
import { Records as RecordsApi } from '../api/api.js';

function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel
}) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>

      {minLabel && (
        <p className="text-xs text-slate-500 mb-2">
          {minLabel}
        </p>
      )}

      <div className="space-y-1.5">
        {list.map((entry, index) => (
          <div
            key={`${entry.player_id}-${index}`}
            className="flex items-center justify-between text-sm py-1 border-b border-slate-700/40 last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-slate-500 font-bold">
                {index + 1}
              </span>

              <span className="font-medium">
                {entry.player_name || entry.name || 'Unknown Player'}
              </span>
            </div>

            <span className="font-bold text-emerald-400">
              {entry[valueKey] ?? 0}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BestSingle({ title, icon, entry, line }) {
  if (!entry) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-2 flex items-center gap-2">
        {icon} {title}
      </h3>

      <div className="text-2xl font-extrabold">
        {entry.player_name || entry.name || 'Unknown Player'}
      </div>

      <div className="text-slate-400 text-sm">
        {line(entry)}
      </div>
    </div>
  );
}

export default function Records() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    RecordsApi
      .get()
      .then((data) => {
        console.log('ALL TIME RECORDS:', data);
        setRecords(data);
      })
      .catch((err) => {
        console.error('Failed to load records:', err);
        setError('Failed to load records.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <p className="text-slate-400">
        Loading records…
      </p>
    );
  }

  if (error) {
    return (
      <div className="card text-red-400">
        {error}
      </div>
    );
  }

  if (!records) {
    return (
      <div className="card text-center text-slate-400">
        No records available.
      </div>
    );
  }

  return (
    <div className="fade-in space-y-4">

      <div>
        <h1 className="text-2xl font-bold mb-1">
          📜 GCC All-Time Records
        </h1>

        <p className="text-sm text-slate-500">
          All-time records for GCC players.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">

        <BestSingle
          title="Best Batting Figures"
          icon="🏏"
          entry={records.highestScore}
          line={(e) =>
            `${e.runs || 0} runs from ${e.balls || 0} balls · ${
              e.fours || 0
            }x4 · ${e.sixes || 0}x6 · SR ${
              e.strike_rate || 0
            }`
          }
        />

        <BestSingle
          title="Best Bowling Figures"
          icon="🎯"
          entry={records.bestBowling}
          line={(e) =>
            `${e.wickets || 0}/${e.runs || 0} in ${
              e.overs || '0.0'
            } overs · Econ ${e.economy || 0}`
          }
        />

      </div>

      <div className="grid sm:grid-cols-2 gap-4">

        <LeaderboardCard
          title="Most Runs"
          icon="🏆"
          list={records.mostRuns}
          valueKey="runs"
        />

        <LeaderboardCard
          title="Most Wickets"
          icon="🏆"
          list={records.mostWickets}
          valueKey="wickets"
        />

        <LeaderboardCard
          title="Most Fours"
          icon="🔥"
          list={records.mostFours}
          valueKey="fours"
        />

        <LeaderboardCard
          title="Most Sixes"
          icon="🚀"
          list={records.mostSixes}
          valueKey="sixes"
        />

        <LeaderboardCard
          title="Best Strike Rate"
          icon="⚡"
          list={records.bestStrikeRate}
          valueKey="strike_rate"
          minLabel="Minimum 10 balls faced"
        />

        <LeaderboardCard
          title="Best Economy"
          icon="🛡️"
          list={records.bestEconomy}
          valueKey="economy"
          minLabel="Minimum 2 overs bowled"
        />

      </div>

    </div>
  );
}
