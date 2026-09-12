import { useEffect, useState } from 'react';
import { Records as RecordsApi, Players } from '../api/api.js';

function getTopFive(list, sortFn) {
  if (!Array.isArray(list)) {
    return [];
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
    sortFn ||
      ((a, b) =>
        Number(b[valueKey] || 0) -
        Number(a[valueKey] || 0))
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
              key={`${entry.player_id || entry.id || index}-${index}`}
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

/* -------------------------------------------------------
   PREMIUM BEST RECORD CARD
------------------------------------------------------- */

function PremiumRecordCard({
  title,
  icon,
  entry,
  mainValue,
  subtitle,
  details
}) {
  if (!entry) {
    return null;
  }

  return (
    <div
      className="
        relative overflow-hidden rounded-2xl
        border border-slate-700
        bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800
        p-5 sm:p-6
        shadow-lg
      "
    >
      {/* TOP LABEL */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">
            {icon}
          </span>

          <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
            {title}
          </span>
        </div>

        <span className="text-xl">
          🥇
        </span>
      </div>

      {/* PLAYER */}
      <div className="text-sm text-slate-400 mb-1">
        GCC RECORD HOLDER
      </div>

      <div className="text-xl sm:text-2xl font-black truncate">
        {entry.player_name ||
          entry.name ||
          'Unknown Player'}
      </div>

      {/* MAIN RECORD */}
      <div className="mt-4">
        <div className="text-4xl sm:text-5xl font-black tracking-tight">
          {mainValue}
        </div>

        {subtitle && (
          <div className="text-sm text-slate-400 mt-1">
            {subtitle}
          </div>
        )}
      </div>

      {/* DETAILS */}
      {details && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {details.map((item, index) => (
            <div
              key={index}
              className="rounded-xl bg-slate-800/80 border border-slate-700/60 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {item.label}
              </div>

              <div className="font-extrabold text-sm mt-0.5">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DECORATION */}
      <div className="absolute -right-10 -bottom-10 text-8xl opacity-[0.04]">
        {icon}
      </div>
    </div>
  );
}

export default function Records() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadGccRecords() {
      try {
        setLoading(true);
        setError('');

        const [recordsData, allPlayers] =
          await Promise.all([
            RecordsApi.get(),
            Players.listAll()
          ]);

        console.log(
          'ALL TIME RECORDS:',
          recordsData
        );

        console.log(
          'ALL PLAYERS:',
          allPlayers
        );

        /*
         * ---------------------------------------------------
         * FIND GCC PLAYERS
         * ---------------------------------------------------
         */

        const playersArray =
          Array.isArray(allPlayers)
            ? allPlayers
            : [];

        const gccPlayerIds = new Set();

        playersArray.forEach((player) => {
          const teamName =
            player.team_name ||
            player.team?.name ||
            player.team ||
            '';

          if (
            String(teamName)
              .trim()
              .toLowerCase() === 'gcc'
          ) {
            if (player.id != null) {
              gccPlayerIds.add(
                String(player.id)
              );
            }

            if (player.player_id != null) {
              gccPlayerIds.add(
                String(player.player_id)
              );
            }
          }
        });

        console.log(
          'GCC PLAYER IDS:',
          [...gccPlayerIds]
        );

        /*
         * ---------------------------------------------------
         * CHECK GCC PLAYER
         * ---------------------------------------------------
         */

        const isGccPlayer = (entry) => {
          if (!entry) {
            return false;
          }

          const playerId =
            entry.player_id ??
            entry.id ??
            entry.playerId;

          return (
            playerId != null &&
            gccPlayerIds.has(
              String(playerId)
            )
          );
        };

        /*
         * ---------------------------------------------------
         * FILTER LIST
         * ---------------------------------------------------
         */

        const filterList = (list) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return list.filter(
            isGccPlayer
          );
        };

        /*
         * ---------------------------------------------------
         * FILTER SINGLE RECORD
         * ---------------------------------------------------
         */

        const filterSingle = (entry) => {
          return isGccPlayer(entry)
            ? entry
            : null;
        };

        /*
         * ---------------------------------------------------
         * GCC RECORDS
         * ---------------------------------------------------
         */

        const gccRecords = {
          ...recordsData,

          highestScore:
            filterSingle(
              recordsData?.highestScore
            ),

          bestBowling:
            filterSingle(
              recordsData?.bestBowling
            ),

          mostRuns:
            filterList(
              recordsData?.mostRuns
            ),

          mostFours:
            filterList(
              recordsData?.mostFours
            ),

          mostSixes:
            filterList(
              recordsData?.mostSixes
            ),

          bestStrikeRate:
            filterList(
              recordsData?.bestStrikeRate
            ),

          mostWickets:
            filterList(
              recordsData?.mostWickets
            ),

          bestEconomy:
            filterList(
              recordsData?.bestEconomy
            )
        };

        /*
         * ---------------------------------------------------
         * BEST BATTING FIGURE
         *
         * Highest runs first.
         * If runs are equal:
         * fewer balls is better.
         * If still equal:
         * higher strike rate is better.
         * ---------------------------------------------------
         */

        const battingRecords =
          gccRecords.mostRuns || [];

        const bestBattingFigure =
          battingRecords.length > 0
            ? [...battingRecords].sort(
                (a, b) => {
                  const runsDiff =
                    Number(b.runs || 0) -
                    Number(a.runs || 0);

                  if (runsDiff !== 0) {
                    return runsDiff;
                  }

                  const ballsDiff =
                    Number(a.balls || 0) -
                    Number(b.balls || 0);

                  if (ballsDiff !== 0) {
                    return ballsDiff;
                  }

                  return (
                    Number(
                      b.strike_rate || 0
                    ) -
                    Number(
                      a.strike_rate || 0
                    )
                  );
                }
              )[0]
            : null;

        gccRecords.bestBattingFigure =
          bestBattingFigure;

        console.log(
          'GCC ONLY RECORDS:',
          gccRecords
        );

        console.log(
          'BEST BATTING FIGURE:',
          bestBattingFigure
        );

        setRecords(gccRecords);
      } catch (err) {
        console.error(
          'Failed to load GCC records:',
          err
        );

        setError(
          'Failed to load GCC records.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadGccRecords();
  }, []);

  if (loading) {
    return (
      <p className="text-slate-400">
        Loading GCC records…
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
        No GCC records available.
      </div>
    );
  }

  return (
    <div className="fade-in space-y-5">

      {/* =================================================
          PAGE HEADER
      ================================================= */}

      <div>
        <h1 className="text-2xl font-bold mb-1">
          📜 GCC All-Time Records
        </h1>

        <p className="text-sm text-slate-500">
          All-time records for GCC players only.
        </p>
      </div>

      {/* =================================================
          BEST OF GCC
      ================================================= */}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">
            👑
          </span>

          <h2 className="text-lg font-black">
            Best of GCC
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">

          {/* BEST BOWLING */}
          <PremiumRecordCard
            title="Best Bowling Figure"
            icon="🎯"
            entry={records.bestBowling}
            mainValue={`${records.bestBowling?.wickets || 0}/${records.bestBowling?.runs || 0}`}
            subtitle={`Best bowling performance`}
            details={[
              {
                label: 'Overs',
                value:
                  records.bestBowling?.overs ||
                  '0.0'
              },
              {
                label: 'Wickets',
                value:
                  records.bestBowling?.wickets ||
                  0
              },
              {
                label: 'Runs',
                value:
                  records.bestBowling?.runs ||
                  0
              },
              {
                label: 'Economy',
                value:
                  records.bestBowling?.economy ||
                  0
              }
            ]}
          />

          {/* BEST BATTING */}
          <PremiumRecordCard
            title="Best Batting Figure"
            icon="⚡"
            entry={
              records.bestBattingFigure
            }
            mainValue={`${
              records.bestBattingFigure
                ?.runs || 0
            } (${
              records.bestBattingFigure
                ?.balls || 0
            })`}
            subtitle="Best batting performance"
            details={[
              {
                label: 'Strike Rate',
                value:
                  records
                    .bestBattingFigure
                    ?.strike_rate ||
                  0
              },
              {
                label: 'Fours',
                value:
                  records
                    .bestBattingFigure
                    ?.fours ||
                  0
              },
              {
                label: 'Sixes',
                value:
                  records
                    .bestBattingFigure
                    ?.sixes ||
                  0
              },
              {
                label: 'Runs',
                value:
                  records
                    .bestBattingFigure
                    ?.runs ||
                  0
              }
            ]}
          />

          {/* HIGHEST SCORE */}
          <PremiumRecordCard
            title="Highest Score"
            icon="🏏"
            entry={
              records.highestScore
            }
            mainValue={
              records.highestScore
                ?.runs || 0
            }
            subtitle={`Highest individual score`}
            details={[
              {
                label: 'Balls',
                value:
                  records.highestScore
                    ?.balls ||
                  0
              },
              {
                label: 'Fours',
                value:
                  records.highestScore
                    ?.fours ||
                  0
              },
              {
                label: 'Sixes',
                value:
                  records.highestScore
                    ?.sixes ||
                  0
              },
              {
                label: 'Strike Rate',
                value:
                  records.highestScore
                    ?.strike_rate ||
                  0
              }
            ]}
          />

        </div>
      </div>

      {/* =================================================
          TOP 5 BATTING
      ================================================= */}

      <div>
        <h2 className="text-lg font-black mb-3">
          🏏 Batting Records
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">

          <LeaderboardCard
            title="Most Runs"
            icon="🏆"
            list={records.mostRuns}
            valueKey="runs"
            unit=" runs"
            sortFn={(a, b) =>
              Number(b.runs || 0) -
              Number(a.runs || 0)
            }
          />

          <LeaderboardCard
            title="Most Fours"
            icon="🔥"
            list={records.mostFours}
            valueKey="fours"
            unit=" fours"
            sortFn={(a, b) =>
              Number(b.fours || 0) -
              Number(a.fours || 0)
            }
          />

          <LeaderboardCard
            title="Most Sixes"
            icon="🚀"
            list={records.mostSixes}
            valueKey="sixes"
            unit=" sixes"
            sortFn={(a, b) =>
              Number(b.sixes || 0) -
              Number(a.sixes || 0)
            }
          />

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

        </div>
      </div>

      {/* =================================================
          TOP 5 BOWLING
      ================================================= */}

      <div>
        <h2 className="text-lg font-black mb-3">
          🎯 Bowling Records
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">

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

    </div>
  );
}
