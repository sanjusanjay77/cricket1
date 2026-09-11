import { useEffect, useState } from 'react';
import { Records as RecordsApi } from '../api/api.js';

function getTopFive(list, sortFn) {
  if (!Array.isArray(list)) {
    if (list && typeof list === 'object') {
      list = [list];
    } else {
      return [];
    }
  }

  return [...list]
    .sort(sortFn)
    .slice(0, 5);
}

function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel,
  sortFn
}) {
  const topFive = getTopFive(
    list,
    sortFn || ((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
  );

  if (topFive.length === 0) {
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
        {topFive.map((entry, index) => {
          const rank = index + 1;

          return (
            <div
              key={`${entry.player_id || entry.id || entry.player_name || index}-${index}`}
              className="flex items-center justify-between text-sm py-2 border-b border-slate-700/40 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 text-slate-500 font-bold">
                  {rank === 1
                    ? '🥇'
                    : rank === 2
                    ? '🥈'
                    : rank === 3
                    ? '🥉'
                    : rank}
                </span>

                <span className="font-medium truncate">
                  {entry.player_name ||
                    entry.name ||
                    'Unknown Player'}
                </span>
              </div>

              <span className="font-bold text-emerald-400 ml-3 whitespace-nowrap">
                {entry[valueKey] ?? 0}
                {unit}
              </span>
            </div>
          );
        })}
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

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          📜 GCC All-Time Records
        </h1>

        <p className="text-sm text-slate-500">
          Top 5 all-time records for GCC players.
        </p>
      </div>

      {/* Top 5 Batting Records */}
      <div className="grid sm:grid-cols-2 gap-4">

        <LeaderboardCard
          title="Highest Score"
          icon="🏏"
          list={records.highestScore}
          valueKey="runs"
          unit=" runs"
          sortFn={(a, b) =>
            Number(b.runs || 0) - Number(a.runs || 0)
          }
        />

        <LeaderboardCard
          title="Most Runs"
          icon="🏆"
          list={records.mostRuns}
          valueKey="runs"
          unit=" runs"
          sortFn={(a, b) =>
            Number(b.runs || 0) - Number(a.runs || 0)
          }
        />

        <LeaderboardCard
          title="Most Fours"
          icon="🔥"
          list={records.mostFours}
          valueKey="fours"
          unit=" fours"
          sortFn={(a, b) =>
            Number(b.fours || 0) - Number(a.fours || 0)
          }
        />

        <LeaderboardCard
          title="Most Sixes"
          icon="🚀"
          list={records.mostSixes}
          valueKey="sixes"
          unit=" sixes"
          sortFn={(a, b) =>
            Number(b.sixes || 0) - Number(a.sixes || 0)
          }
        />

      </div>

      {/* Top 5 Bowling Records */}
      <div className="grid sm:grid-cols-2 gap-4">

        <LeaderboardCard
          title="Best Bowling Figures"
          icon="🎯"
          list={records.bestBowling}
          valueKey="wickets"
          unit=" wickets"
          sortFn={(a, b) => {
            const wicketDifference =
              Number(b.wickets || 0) -
              Number(a.wickets || 0);

            if (wicketDifference !== 0) {
              return wicketDifference;
            }

            return (
              Number(a.runs || 0) -
              Number(b.runs || 0)
            );
          }}
        />

        <LeaderboardCard
          title="Most Wickets"
          icon="🏆"
          list={records.mostWickets}
          valueKey="wickets"
          unit=" wickets"
          sortFn={(a, b) =>
            Number(b.wickets || 0) -
            Number(a.wickets || 0)
          }
        />

      </div>

      {/* Top 5 Performance Records */}
      <div className="grid sm:grid-cols-2 gap-4">

        <LeaderboardCard
          title="Best Strike Rate"
          icon="⚡"
          list={records.bestStrikeRate}
          valueKey="strike_rate"
          unit=" SR"
          minLabel="Minimum 10 balls faced"
          sortFn={(a, b) =>
            Number(b.strike_rate || 0) -
            Number(a.strike_rate || 0)
          }
        />

        <LeaderboardCard
          title="Best Economy"
          icon="🛡️"
          list={records.bestEconomy}
          valueKey="economy"
          unit=" Econ"
          minLabel="Minimum 2 overs bowled"
          sortFn={(a, b) =>
            Number(a.economy || 0) -
            Number(b.economy || 0)
          }
        />

      </div>

    </div>
  );
}
