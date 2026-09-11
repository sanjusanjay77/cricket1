import { useEffect, useState } from 'react';
import { Records as RecordsApi } from '../api/api.js';

function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel,
}) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  // Always show maximum Top 5
  const topFive = list.slice(0, 5);

  return (
    <div className="card">

      <h3 className="font-semibold mb-3 flex items-center gap-2 text-lg">
        <span>{icon}</span>
        <span>{title}</span>
        <span className="ml-auto text-xs font-bold text-slate-500">
          TOP 5
        </span>
      </h3>

      {minLabel && (
        <p className="text-xs text-slate-500 mb-3">
          {minLabel}
        </p>
      )}

      <div className="space-y-2">

        {topFive.map((entry, index) => {

          const rank = index + 1;

          const rankStyle =
            rank === 1
              ? 'bg-yellow-500/15 border-yellow-500/40'
              : rank === 2
              ? 'bg-slate-400/10 border-slate-400/30'
              : rank === 3
              ? 'bg-orange-700/10 border-orange-700/30'
              : 'bg-slate-800/40 border-slate-700/40';

          const rankIcon =
            rank === 1
              ? '🥇'
              : rank === 2
              ? '🥈'
              : rank === 3
              ? '🥉'
              : rank;

          return (
            <div
              key={`${entry.player_id || entry.id || entry.player_name}-${index}`}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${rankStyle}`}
            >

              <div className="flex items-center gap-3 min-w-0">

                <span
                  className={`w-7 text-center font-extrabold ${
                    rank <= 3
                      ? 'text-lg'
                      : 'text-sm text-slate-500'
                  }`}
                >
                  {rankIcon}
                </span>

                <div className="min-w-0">

                  <div className="font-semibold truncate">
                    {entry.player_name ||
                      entry.name ||
                      'Unknown Player'}
                  </div>

                  {rank === 1 && (
                    <div className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold">
                      Leader
                    </div>
                  )}

                </div>

              </div>

              <span className="font-extrabold text-emerald-400 ml-3 whitespace-nowrap">
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

function BestSingle({
  title,
  icon,
  entry,
  line,
}) {
  if (!entry) {
    return null;
  }

  return (
    <div className="card">

      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h3>

      <div className="flex items-center gap-3">

        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl shadow-lg">
          🏏
        </div>

        <div>
          <div className="text-xl font-extrabold">
            {entry.player_name ||
              entry.name ||
              'Unknown Player'}
          </div>

          <div className="text-slate-400 text-sm mt-1">
            {line(entry)}
          </div>
        </div>

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
      <div className="card text-center text-slate-400">
        Loading records…
      </div>
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
    <div className="fade-in space-y-5">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="card">

        <div className="flex items-center gap-3">

          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-700 flex items-center justify-center text-3xl shadow-lg shadow-yellow-900/30">
            🏏
          </div>

          <div>

            <h1 className="text-2xl sm:text-3xl font-black">
              🏆 GCC All-Time Records
            </h1>

            <p className="text-sm text-slate-500 mt-1">
              Golden Cricket Club — Top 5 player records
            </p>

          </div>

        </div>

      </div>

      {/* =====================================================
          BEST INDIVIDUAL RECORDS
      ===================================================== */}

      <div>

        <h2 className="text-lg font-bold mb-3">
          ⭐ Best Individual Performances
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">

          <BestSingle
            title="Highest Individual Score"
            icon="🏏"
            entry={records.highestScore}
            line={(e) =>
              `${e.runs || 0} runs from ${
                e.balls || 0
              } balls · ${
                e.fours || 0
              }x4 · ${
                e.sixes || 0
              }x6 · SR ${
                e.strike_rate || 0
              }`
            }
          />

          <BestSingle
            title="Best Bowling Figures"
            icon="🎯"
            entry={records.bestBowling}
            line={(e) =>
              `${e.wickets || 0}/${
                e.runs || 0
              } in ${
                e.overs || '0.0'
              } overs · Econ ${
                e.economy || 0
              }`
            }
          />

        </div>

      </div>

      {/* =====================================================
          TOP 5 BATTING
      ===================================================== */}

      <div>

        <h2 className="text-lg font-bold mb-3">
          🏏 Top 5 Batting Records
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">

          <LeaderboardCard
            title="Most Runs"
            icon="🏆"
            list={records.mostRuns}
            valueKey="runs"
            unit=" runs"
          />

          <LeaderboardCard
            title="Most Fours"
            icon="🔥"
            list={records.mostFours}
            valueKey="fours"
            unit=" fours"
          />

          <LeaderboardCard
            title="Most Sixes"
            icon="🚀"
            list={records.mostSixes}
            valueKey="sixes"
            unit=" sixes"
          />

          <LeaderboardCard
            title="Best Strike Rate"
            icon="⚡"
            list={records.bestStrikeRate}
            valueKey="strike_rate"
            minLabel="Minimum 10 balls faced"
          />

        </div>

      </div>

      {/* =====================================================
          TOP 5 BOWLING
      ===================================================== */}

      <div>

        <h2 className="text-lg font-bold mb-3">
          🎯 Top 5 Bowling Records
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">

          <LeaderboardCard
            title="Most Wickets"
            icon="🎯"
            list={records.mostWickets}
            valueKey="wickets"
            unit=" wickets"
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

      {/* =====================================================
          RECORD SUMMARY
      ===================================================== */}

      <div className="card">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-bold">
            📊 Records Summary
          </h2>

          <span className="text-xs text-slate-500">
            TOP 5
          </span>

        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

          <SummaryBox
            icon="🏏"
            label="Most Runs"
            value={
              records.mostRuns?.[0]?.runs ?? 0
            }
          />

          <SummaryBox
            icon="🎯"
            label="Most Wickets"
            value={
              records.mostWickets?.[0]?.wickets ?? 0
            }
          />

          <SummaryBox
            icon="🔥"
            label="Most Fours"
            value={
              records.mostFours?.[0]?.fours ?? 0
            }
          />

          <SummaryBox
            icon="🚀"
            label="Most Sixes"
            value={
              records.mostSixes?.[0]?.sixes ?? 0
            }
          />

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   SUMMARY BOX
========================================================= */

function SummaryBox({
  icon,
  label,
  value,
}) {
  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-center">

      <div className="text-2xl">
        {icon}
      </div>

      <div className="text-xl font-extrabold text-emerald-400 mt-1">
        {value}
      </div>

      <div className="text-[11px] text-slate-500 mt-1">
        {label}
      </div>

    </div>
  );
}
