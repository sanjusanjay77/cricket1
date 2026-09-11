
import { useEffect, useState } from 'react';
import { Records as RecordsApi } from '../api/api.js';

// ----------------------------------------------------
// GCC FILTER
// ----------------------------------------------------
function isGCCPlayer(entry) {
  if (!entry) return false;

  const team =
    entry.team_short ||
    entry.team_name ||
    entry.team ||
    '';

  return String(team).trim().toUpperCase() === 'GCC';
}

// ----------------------------------------------------
// GCC ONLY LIST
// ----------------------------------------------------
function gccOnly(list) {
  if (!Array.isArray(list)) return [];

  return list.filter(isGCCPlayer);
}

// ----------------------------------------------------
// LEADERBOARD CARD
// ----------------------------------------------------
function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel
}) {
  const gccList = gccOnly(list);

  if (gccList.length === 0) return null;

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
        {gccList.map((entry, idx) => (
          <div
            key={entry.player_id}
            className="flex items-center justify-between text-sm py-1 border-b border-slate-700/40 last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-slate-500 font-bold">
                {idx + 1}
              </span>

              <span className="font-medium">
                {entry.player_name || 'Unknown'}
              </span>

              <span className="text-xs text-emerald-400">
                (GCC)
              </span>
            </div>

            <span className="font-bold text-emerald-400">
              {entry[valueKey]}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// BEST SINGLE PERFORMANCE
// ----------------------------------------------------
function BestSingle({
  title,
  icon,
  entry,
  line
}) {
  if (!entry || !isGCCPlayer(entry)) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-2 flex items-center gap-2">
        {icon} {title}
      </h3>

      <div className="text-2xl font-extrabold">
        {entry.player_name || 'Unknown'}
      </div>

      <div className="text-slate-400 text-sm">
        {line(entry)}
      </div>

      <div className="text-xs text-emerald-400 mt-1">
        GCC
      </div>

      {entry.match_label && (
        <div className="text-xs text-slate-500 mt-1">
          {entry.match_label}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// MAIN RECORDS PAGE
// ----------------------------------------------------
export default function Records() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    RecordsApi
      .get()
      .then(data => {
        console.log('ALL TIME RECORDS:', data);

        const filteredRecords = {
          ...data,

          // -------------------------------
          // GCC BEST SINGLE RECORDS
          // -------------------------------
          highestScore:
            isGCCPlayer(data?.highestScore)
              ? data.highestScore
              : null,

          bestBowling:
            isGCCPlayer(data?.bestBowling)
              ? data.bestBowling
              : null,

          // -------------------------------
          // GCC LEADERBOARDS
          // -------------------------------
          mostRuns:
            gccOnly(data?.mostRuns),

          mostWickets:
            gccOnly(data?.mostWickets),

          mostFours:
            gccOnly(data?.mostFours),

          mostSixes:
            gccOnly(data?.mostSixes),

          bestStrikeRate:
            gccOnly(data?.bestStrikeRate),

          bestEconomy:
            gccOnly(data?.bestEconomy),

          mostBallsFaced:
            gccOnly(data?.mostBallsFaced),

          mostBallsBowled:
            gccOnly(data?.mostBallsBowled)
        };

        setRecords(filteredRecords);
      })
      .catch(error => {
        console.error(
          'Failed to load records:',
          error
        );

        setRecords({
          highestScore: null,
          bestBowling: null,
          mostRuns: [],
          mostWickets: [],
          mostFours: [],
          mostSixes: [],
          bestStrikeRate: [],
          bestEconomy: [],
          mostBallsFaced: [],
          mostBallsBowled: []
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // ------------------------------------------------
  // LOADING
  // ------------------------------------------------
  if (loading) {
    return (
      <p className="text-slate-400">
        Loading GCC records…
      </p>
    );
  }

  // ------------------------------------------------
  // ERROR / EMPTY RESPONSE
  // ------------------------------------------------
  if (!records) {
    return (
      <div className="card text-center text-slate-400">
        Unable to load records.
      </div>
    );
  }

  const hasAnyRecords =
    records.highestScore ||
    records.bestBowling ||
    records.mostRuns?.length ||
    records.mostWickets?.length ||
    records.mostFours?.length ||
    records.mostSixes?.length ||
    records.bestStrikeRate?.length ||
    records.bestEconomy?.length ||
    records.mostBallsFaced?.length ||
    records.mostBallsBowled?.length;

  // ------------------------------------------------
  // PAGE
  // ------------------------------------------------
  return (
    <div className="fade-in space-y-4">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          📜 GCC All-Time Records
        </h1>

        <p className="text-sm text-slate-500">
          All-time records for GCC players only.
        </p>
      </div>

      {/* ------------------------------------------
          BEST BATTING + BEST BOWLING
      ------------------------------------------ */}
      <div className="grid sm:grid-cols-2 gap-4">

        <BestSingle
          title="Best Batting Figures"
          icon="🏏"
          entry={records.highestScore}
          line={(e) =>
            `${e.runs} runs from ${e.balls} balls · ${e.fours}x4 · ${e.sixes}x6 · SR ${e.strike_rate}`
          }
        />

        <BestSingle
          title="Best Bowling Figures"
          icon="🎯"
          entry={records.bestBowling}
          line={(e) =>
            `${e.wickets}/${e.runs} in ${e.overs} overs · Econ ${e.economy}`
          }
        />

      </div>

      {/* ------------------------------------------
          LEADERBOARDS
      ------------------------------------------ */}
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

        <LeaderboardCard
          title="Most Balls Faced"
          icon="⏱️"
          list={records.mostBallsFaced}
          valueKey="balls_faced"
        />

        <LeaderboardCard
          title="Most Balls Bowled"
          icon="⏱️"
          list={records.mostBallsBowled}
          valueKey="balls_bowled"
        />

      </div>

      {/* ------------------------------------------
          EMPTY STATE
      ------------------------------------------ */}
      {!hasAnyRecords && (
        <div className="card text-center text-slate-400">
          No GCC records yet — records will populate as GCC matches are played.
        </div>
      )}

    </div>
  );
}
