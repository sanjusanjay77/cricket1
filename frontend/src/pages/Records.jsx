import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';

import {
  Records as RecordsApi,
  Players,
} from '../api/api.js';


/* =========================================================
   CACHE
========================================================= */

const RECORDS_CACHE_KEY =
  'gcc_records_cache_v1';


function readRecordsCache() {
  try {
    const cached =
      localStorage.getItem(
        RECORDS_CACHE_KEY
      );

    if (!cached) {
      return null;
    }

    const parsed =
      JSON.parse(cached);

    return parsed &&
      typeof parsed === 'object'
      ? parsed
      : null;

  } catch (error) {
    console.warn(
      'Failed to read records cache:',
      error
    );

    return null;
  }
}


function writeRecordsCache(records) {
  try {
    localStorage.setItem(
      RECORDS_CACHE_KEY,
      JSON.stringify(records)
    );

  } catch (error) {
    console.warn(
      'Failed to save records cache:',
      error
    );
  }
}


/* =========================================================
   TOP FIVE HELPER
========================================================= */

function getTopFive(
  list,
  sortFn,
  valueKey
) {

  if (!Array.isArray(list)) {
    return [];
  }

  return [...list]
    .sort(
      sortFn ||
        ((a, b) =>
          Number(
            b[valueKey] || 0
          ) -
          Number(
            a[valueKey] || 0
          ))
    )
    .slice(0, 5);
}


/* =========================================================
   SAFE PLAYER NAME
========================================================= */

function getPlayerName(player) {

  return (
    player?.player_name ||
    player?.name ||
    player?.playerName ||
    'Unknown Player'
  );

}


/* =========================================================
   PLAYER ID
========================================================= */

function getPlayerId(player) {

  return (
    player?.player_id ??
    player?.id ??
    player?.playerId ??
    null
  );

}


/* =========================================================
   LEADERBOARD CARD
========================================================= */

function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel,
  sortFn
}) {

  const topFive =
    getTopFive(
      list,
      sortFn,
      valueKey
    );


  if (
    topFive.length === 0
  ) {
    return null;
  }


  return (

    <div
      className="
        card
        overflow-hidden
        w-full
      "
    >

      <div className="flex items-center justify-between gap-2 mb-3">

        <h3 className="font-semibold flex items-center gap-2 min-w-0">

          <span className="text-xl shrink-0">
            {icon}
          </span>

          <span className="truncate">
            {title}
          </span>

        </h3>


        <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
          Top 5
        </span>

      </div>


      {minLabel && (

        <p className="text-xs text-slate-500 mb-2">
          {minLabel}
        </p>

      )}


      <div className="space-y-1">

        {topFive.map(
          (entry, index) => {

            const rank =
              index + 1;

            const playerName =
              getPlayerName(entry);


            return (

              <div
                key={`${getPlayerId(entry) || playerName}-${index}`}
                className="
                  flex items-center
                  justify-between
                  gap-2
                  py-3
                  px-2
                  rounded-xl
                  border-b
                  border-slate-700/40
                  last:border-0
                  hover:bg-slate-800/40
                  transition
                "
              >

                <div className="flex items-center gap-2 min-w-0">

                  <span
                    className="
                      w-7
                      h-7
                      flex
                      items-center
                      justify-center
                      shrink-0
                      text-sm
                      font-bold
                    "
                  >
                    {rank === 1
                      ? '🥇'
                      : rank === 2
                      ? '🥈'
                      : rank === 3
                      ? '🥉'
                      : rank}
                  </span>


                  <div
                    className="
                      w-8
                      h-8
                      rounded-full
                      bg-emerald-500/15
                      border
                      border-emerald-500/20
                      flex
                      items-center
                      justify-center
                      text-xs
                      font-black
                      text-emerald-400
                      shrink-0
                    "
                  >
                    {playerName
                      .charAt(0)
                      .toUpperCase()}
                  </div>


                  <span className="font-medium truncate text-sm">
                    {playerName}
                  </span>

                </div>


                <span
                  className="
                    font-bold
                    text-emerald-400
                    text-xs
                    sm:text-sm
                    whitespace-nowrap
                    text-right
                  "
                >
                  {entry[valueKey] ?? 0}
                  {unit}
                </span>

              </div>

            );

          }
        )}

      </div>

    </div>

  );

}


/* =========================================================
   PREMIUM SINGLE MATCH RECORD
========================================================= */

function PremiumRecordCard({
  title,
  icon,
  entry,
  mainValue,
  subtitle,
  details
}) {

  if (!entry) {

    return (

      <div
        className="
          relative
          overflow-hidden
          rounded-2xl
          border
          border-slate-700
          bg-slate-900
          p-5
          sm:p-7
          shadow-lg
        "
      >

        <div className="flex items-center gap-2">

          <span className="text-2xl">
            {icon}
          </span>

          <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
            {title}
          </span>

        </div>


        <div className="mt-5 text-slate-500">
          No record available yet.
        </div>

      </div>

    );

  }


  const playerName =
    getPlayerName(entry);


  return (

    <div
      className="
        relative
        overflow-hidden
        rounded-2xl
        border
        border-slate-700
        bg-gradient-to-br
        from-slate-900
        via-slate-900
        to-slate-800
        p-5
        sm:p-7
        shadow-xl
      "
    >

      <div className="flex items-center justify-between gap-3 mb-5">

        <div className="flex items-center gap-3 min-w-0">

          <span className="text-3xl shrink-0">
            {icon}
          </span>

          <span className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-300 truncate">
            {title}
          </span>

        </div>


        <span className="text-2xl shrink-0">
          🥇
        </span>

      </div>


      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
        GCC single-innings record
      </div>


      <div className="flex items-center gap-3 min-w-0">

        <div
          className="
            w-10
            h-10
            rounded-full
            bg-emerald-500/15
            border
            border-emerald-500/20
            flex
            items-center
            justify-center
            font-black
            text-emerald-400
            shrink-0
          "
        >
          {playerName
            .charAt(0)
            .toUpperCase()}
        </div>


        <div className="text-2xl sm:text-3xl font-black truncate">
          {playerName}
        </div>

      </div>


      <div className="mt-5">

        <div className="text-4xl sm:text-6xl font-black tracking-tight break-words">
          {mainValue}
        </div>


        {subtitle && (

          <div className="text-sm text-slate-400 mt-2">
            {subtitle}
          </div>

        )}

      </div>


      <div
        className="
          mt-5
          rounded-xl
          bg-slate-800/70
          border
          border-slate-700/60
          px-4
          py-3
        "
      >

        <div className="text-[10px] uppercase tracking-wide text-slate-500">
          Particular Match
        </div>


        <div className="text-sm font-bold mt-1 break-words">

          {entry.match_date

            ? new Date(
                entry.match_date
              ).toLocaleDateString(
                'en-IN',
                {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                }
              )

            : entry.match_id

            ? `Match ${entry.match_id}`

            : 'Match information unavailable'}

        </div>

      </div>


      {details &&
        details.length > 0 && (

          <div
            className="
              mt-5
              grid
              grid-cols-2
              sm:grid-cols-4
              gap-2
            "
          >

            {details.map(
              (item, index) => (

                <div
                  key={index}
                  className="
                    rounded-xl
                    bg-slate-800/80
                    border
                    border-slate-700/60
                    px-3
                    py-3
                    min-w-0
                  "
                >

                  <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">
                    {item.label}
                  </div>


                  <div className="font-extrabold text-sm mt-1 truncate">
                    {item.value}
                  </div>

                </div>

              )
            )}

          </div>

        )}


      <div className="absolute -right-10 -bottom-10 text-9xl opacity-[0.04] pointer-events-none">
        {icon}
      </div>

    </div>

  );

}


/* =========================================================
   COMPARISON STAT
========================================================= */

function ComparisonStat({
  label,
  icon,
  playerOne,
  playerTwo,
  valueOne,
  valueTwo,
  decimals = 0,
  lowerIsBetter = false
}) {

  const one =
    Number(valueOne || 0);

  const two =
    Number(valueTwo || 0);

  const difference =
    Math.abs(
      one - two
    );


  let leader = null;


  if (one !== two) {

    if (lowerIsBetter) {

      leader =
        one < two
          ? 'one'
          : 'two';

    } else {

      leader =
        one > two
          ? 'one'
          : 'two';

    }

  }


  const formatValue =
    (value) =>
      decimals > 0
        ? value.toFixed(decimals)
        : Math.round(value);


  return (

    <div
      className="
        rounded-2xl
        border
        border-slate-700
        bg-slate-900/80
        p-4
        sm:p-5
      "
    >

      <div className="flex items-center justify-center gap-2 mb-4">

        <span className="text-lg">
          {icon}
        </span>

        <span className="text-xs sm:text-sm uppercase tracking-wider font-bold text-slate-400">
          {label}
        </span>

      </div>


      <div className="grid grid-cols-2 gap-3">

        <div
          className={`
            rounded-xl
            p-3
            text-center
            border
            ${
              leader === 'one'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/50'
            }
          `}
        >

          <div className="text-xs text-slate-400 truncate">
            {playerOne}
          </div>


          <div
            className={`
              text-2xl
              sm:text-3xl
              font-black
              mt-1
              ${
                leader === 'one'
                  ? 'text-emerald-400'
                  : 'text-white'
              }
            `}
          >
            {formatValue(one)}
          </div>


          {leader === 'one' && (

            <div className="text-[10px] text-emerald-400 font-bold mt-1">
              LEADS
            </div>

          )}

        </div>


        <div
          className={`
            rounded-xl
            p-3
            text-center
            border
            ${
              leader === 'two'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/50'
            }
          `}
        >

          <div className="text-xs text-slate-400 truncate">
            {playerTwo}
          </div>


          <div
            className={`
              text-2xl
              sm:text-3xl
              font-black
              mt-1
              ${
                leader === 'two'
                  ? 'text-emerald-400'
                  : 'text-white'
              }
            `}
          >
            {formatValue(two)}
          </div>


          {leader === 'two' && (

            <div className="text-[10px] text-emerald-400 font-bold mt-1">
              LEADS
            </div>

          )}

        </div>

      </div>


      <div className="text-center mt-3 text-xs text-slate-500">

        {one === two ? (

          <span className="text-slate-400 font-semibold">
            Equal
          </span>

        ) : (

          <>

            <span className="text-slate-400">
              {leader === 'one'
                ? playerOne
                : playerTwo}
            </span>

            <span className="mx-1">
              leads by
            </span>

            <span className="font-bold text-emerald-400">

              {decimals > 0
                ? difference.toFixed(
                    decimals
                  )
                : Math.round(
                    difference
                  )}

            </span>

          </>

        )}

      </div>

    </div>

  );

}


/* =========================================================
   BUILD GCC RECORDS
========================================================= */

function buildGccRecords(
  recordsData,
  allPlayers
) {

  const playersArray =
    Array.isArray(allPlayers)
      ? allPlayers
      : [];


  const gccPlayerIds =
    new Set();


  for (
    const player of playersArray
  ) {

    const teamName =
      player.team_name ||
      player.team?.name ||
      player.team ||
      '';


    if (
      String(teamName)
        .trim()
        .toLowerCase() !==
      'gcc'
    ) {
      continue;
    }


    if (
      player.id != null
    ) {

      gccPlayerIds.add(
        String(player.id)
      );

    }


    if (
      player.player_id != null
    ) {

      gccPlayerIds.add(
        String(
          player.player_id
        )
      );

    }

  }


  function isGccPlayer(entry) {

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

  }


  function filterList(list) {

    if (!Array.isArray(list)) {
      return [];
    }

    return list.filter(
      isGccPlayer
    );

  }


  function filterSingle(entry) {

    if (
      !entry ||
      !isGccPlayer(entry)
    ) {
      return null;
    }

    return entry;

  }


  return {

    ...recordsData,

    bestBattingFigure:
      filterSingle(
        recordsData?.bestBattingFigure
      ),

    bestBowling:
      filterSingle(
        recordsData?.bestBowling
      ),

    highestScore:
      undefined,

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

    mostBallsFaced:
      filterList(
        recordsData?.mostBallsFaced
      ),

    bestStrikeRate:
      filterList(
        recordsData?.bestStrikeRate
      ),

    mostWickets:
      filterList(
        recordsData?.mostWickets
      ),

    mostBallsBowled:
      filterList(
        recordsData?.mostBallsBowled
      ),

    bestEconomy:
      filterList(
        recordsData?.bestEconomy
      )

  };

}


/* =========================================================
   RECORDS PAGE
========================================================= */

export default function Records() {

  /*
   * Read cache only once when component starts.
   */

  const initialRecords =
    useState(
      () => readRecordsCache()
    )[0];


  const [records, setRecords] =
    useState(initialRecords);


  /*
   * If cache exists, do NOT show
   * loading screen.
   *
   * The page appears immediately.
   */

  const [loading, setLoading] =
    useState(
      initialRecords === null
    );


  const [error, setError] =
    useState('');


  /* =======================================================
     COMPARISON STATE
  ======================================================= */

  const [compareOne, setCompareOne] =
    useState('');

  const [compareTwo, setCompareTwo] =
    useState('');


  /* =======================================================
     LOAD RECORDS
  ======================================================= */

  const loadRecords =
    useCallback(
      async () => {

        try {

          setError('');


          /*
           * Fetch both APIs simultaneously.
           */

          const [
            recordsData,
            allPlayers
          ] = await Promise.all([
            RecordsApi.get(),
            Players.listAll()
          ]);


          /*
           * Build GCC records.
           */

          const gccRecords =
            buildGccRecords(
              recordsData,
              allPlayers
            );


          /*
           * Update UI.
           */

          setRecords(
            gccRecords
          );


          /*
           * Save for instant next visit.
           */

          writeRecordsCache(
            gccRecords
          );


        } catch (err) {

          console.error(
            'Failed to load GCC records:',
            err
          );


          /*
           * Only show error when there
           * is no usable cached data.
           */

          setError(
            'Failed to load GCC records.'
          );

        } finally {

          setLoading(false);

        }

      },
      []
    );


  /* =======================================================
     LOAD ON PAGE OPEN
  ======================================================= */

  useEffect(() => {

    loadRecords();

  }, [loadRecords]);


  /* =======================================================
     BUILD COMPARISON PLAYER LIST
  ======================================================= */

  const comparisonPlayers =
    useMemo(() => {

      if (!records) {
        return [];
      }


      const map =
        new Map();


      const lists = [

        records.mostRuns,

        records.mostFours,

        records.mostSixes,

        records.mostBallsFaced,

        records.bestStrikeRate,

        records.mostWickets,

        records.mostBallsBowled,

        records.bestEconomy

      ];


      for (
        const list of lists
      ) {

        if (!Array.isArray(list)) {
          continue;
        }


        for (
          const entry of list
        ) {

          const id =
            getPlayerId(entry);

          const name =
            getPlayerName(entry);


          const key =
            id != null
              ? String(id)
              : name.toLowerCase();


          let player =
            map.get(key);


          if (!player) {

            player = {

              id: key,

              name,

              runs: 0,

              wickets: 0,

              fours: 0,

              sixes: 0,

              ballsFaced: 0,

              strike_rate: 0,

              ballsBowled: 0,

              economy: 0

            };


            map.set(
              key,
              player
            );

          }


          const runs =
            Number(
              entry.runs || 0
            );

          if (
            runs > player.runs
          ) {

            player.runs =
              runs;

          }


          const wickets =
            Number(
              entry.wickets || 0
            );

          if (
            wickets >
            player.wickets
          ) {

            player.wickets =
              wickets;

          }


          const fours =
            Number(
              entry.fours || 0
            );

          if (
            fours >
            player.fours
          ) {

            player.fours =
              fours;

          }


          const sixes =
            Number(
              entry.sixes || 0
            );

          if (
            sixes >
            player.sixes
          ) {

            player.sixes =
              sixes;

          }


          const ballsFaced =
            Math.max(
              Number(
                entry.balls || 0
              ),
              Number(
                entry.balls_faced || 0
              )
            );


          if (
            ballsFaced >
            player.ballsFaced
          ) {

            player.ballsFaced =
              ballsFaced;

          }


          const strikeRate =
            Number(
              entry.strike_rate || 0
            );


          if (
            strikeRate >
            player.strike_rate
          ) {

            player.strike_rate =
              strikeRate;

          }


          const ballsBowled =
            Number(
              entry.balls_bowled || 0
            );


          if (
            ballsBowled >
            player.ballsBowled
          ) {

            player.ballsBowled =
              ballsBowled;

          }


          const economy =
            Number(
              entry.economy || 0
            );


          if (
            economy > 0 &&
            (
              player.economy === 0 ||
              economy <
                player.economy
            )
          ) {

            player.economy =
              economy;

          }

        }

      }


      return [...map.values()]
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        );

    }, [records]);


  /* =======================================================
     SELECTED PLAYERS
  ======================================================= */

  const playerOne =
    useMemo(
      () =>
        comparisonPlayers.find(
          (player) =>
            player.id ===
            compareOne
        ),
      [
        comparisonPlayers,
        compareOne
      ]
    );


  const playerTwo =
    useMemo(
      () =>
        comparisonPlayers.find(
          (player) =>
            player.id ===
            compareTwo
        ),
      [
        comparisonPlayers,
        compareTwo
      ]
    );


  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading &&
    !records
  ) {

    return (

      <div className="space-y-4">

        <div className="h-8 w-56 bg-slate-800 rounded-lg animate-pulse" />

        <div className="h-40 bg-slate-800 rounded-2xl animate-pulse" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="h-48 bg-slate-800 rounded-2xl animate-pulse" />

          <div className="h-48 bg-slate-800 rounded-2xl animate-pulse" />

        </div>

      </div>

    );

  }


  /* =======================================================
     ERROR
========================================================= */

  if (
    error &&
    !records
  ) {

    return (

      <div className="card text-red-400">
        {error}
      </div>

    );

  }


  /* =======================================================
     EMPTY
========================================================= */

  if (!records) {

    return (

      <div className="card text-center text-slate-400">
        No GCC records available.
      </div>

    );

  }


  /* =======================================================
     PAGE
========================================================= */

  return (

    <div
      className="
        fade-in
        space-y-6
        w-full
        max-w-full
        overflow-hidden
      "
    >

      {/* HEADER */}

      <div
        className="
          sticky
          top-0
          z-20
          bg-slate-950
          pt-1
          pb-3
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-11
              h-11
              rounded-2xl
              bg-emerald-500/10
              border
              border-emerald-500/20
              flex
              items-center
              justify-center
              text-2xl
              shrink-0
            "
          >
            📜
          </div>


          <div className="min-w-0">

            <h1 className="text-xl sm:text-2xl font-bold truncate">
              GCC All-Time Records
            </h1>


            <p className="text-xs sm:text-sm text-slate-500">
              GCC players only
            </p>

          </div>

        </div>

      </div>


      {/* BEST OF GCC */}

      <section>

        <div className="flex items-center gap-2 mb-4">

          <span className="text-2xl">
            👑
          </span>

          <h2 className="text-xl font-black">
            Best of GCC
          </h2>

        </div>


        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-2
            gap-4
            sm:gap-5
          "
        >

          <PremiumRecordCard

            title="Best Bowling Figure"

            icon="🎯"

            entry={
              records.bestBowling
            }

            mainValue={
              records.bestBowling
                ? `${Number(
                    records
                      .bestBowling
                      .wickets || 0
                  )}/${Number(
                    records
                      .bestBowling
                      .runs || 0
                  )}`
                : '—'
            }

            subtitle="Best bowling performance in a single innings"

            details={[
              {
                label: 'Overs',
                value:
                  records
                    .bestBowling
                    ?.overs ||
                  '0.0'
              },
              {
                label: 'Wickets',
                value:
                  records
                    .bestBowling
                    ?.wickets ||
                  0
              },
              {
                label: 'Runs',
                value:
                  records
                    .bestBowling
                    ?.runs ||
                  0
              },
              {
                label: 'Economy',
                value:
                  records
                    .bestBowling
                    ?.economy ||
                  0
              }
            ]}

          />


          <PremiumRecordCard

            title="Best Batting Figure"

            icon="⚡"

            entry={
              records.bestBattingFigure
            }

            mainValue={
              records.bestBattingFigure
                ? `${Number(
                    records
                      .bestBattingFigure
                      .runs || 0
                  )} (${Number(
                    records
                      .bestBattingFigure
                      .balls || 0
                  )})`
                : '—'
            }

            subtitle="Most runs scored in a particular single innings"

            details={[
              {
                label: 'Strike Rate',
                value:
                  records
                    .bestBattingFigure
                    ?.strike_rate ??
                  0
              },
              {
                label: 'Fours',
                value:
                  records
                    .bestBattingFigure
                    ?.fours ??
                  0
              },
              {
                label: 'Sixes',
                value:
                  records
                    .bestBattingFigure
                    ?.sixes ??
                  0
              },
              {
                label: 'Balls',
                value:
                  records
                    .bestBattingFigure
                    ?.balls ??
                  0
              }
            ]}

          />

        </div>

      </section>


      {/* BATTING RECORDS */}

      <section>

        <h2 className="text-lg font-black mb-3">
          🏏 Batting Records
        </h2>


        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            gap-4
          "
        >

          <LeaderboardCard
            title="Most Runs"
            icon="🏆"
            list={
              records.mostRuns
            }
            valueKey="runs"
            unit=" runs"
            sortFn={(a, b) =>
              Number(
                b.runs || 0
              ) -
              Number(
                a.runs || 0
              )
            }
          />


          <LeaderboardCard
            title="Most Fours"
            icon="🔥"
            list={
              records.mostFours
            }
            valueKey="fours"
            unit=" fours"
            sortFn={(a, b) =>
              Number(
                b.fours || 0
              ) -
              Number(
                a.fours || 0
              )
            }
          />


          <LeaderboardCard
            title="Most Sixes"
            icon="🚀"
            list={
              records.mostSixes
            }
            valueKey="sixes"
            unit=" sixes"
            sortFn={(a, b) =>
              Number(
                b.sixes || 0
              ) -
              Number(
                a.sixes || 0
              )
            }
          />


          <LeaderboardCard
            title="Best Strike Rate"
            icon="⚡"
            list={
              records.bestStrikeRate
            }
            valueKey="strike_rate"
            unit=" SR"
            minLabel="Minimum 10 balls faced"
            sortFn={(a, b) =>
              Number(
                b.strike_rate || 0
              ) -
              Number(
                a.strike_rate || 0
              )
            }
          />

        </div>

      </section>


      {/* BOWLING RECORDS */}

      <section>

        <h2 className="text-lg font-black mb-3">
          🎯 Bowling Records
        </h2>


        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            gap-4
          "
        >

          <LeaderboardCard
            title="Most Wickets"
            icon="🏆"
            list={
              records.mostWickets
            }
            valueKey="wickets"
            unit=" wickets"
            sortFn={(a, b) =>
              Number(
                b.wickets || 0
              ) -
              Number(
                a.wickets || 0
              )
            }
          />


          <LeaderboardCard
            title="Best Economy"
            icon="🛡️"
            list={
              records.bestEconomy
            }
            valueKey="economy"
            unit=" Econ"
            minLabel="Minimum 2 overs bowled"
            sortFn={(a, b) =>
              Number(
                a.economy || 0
              ) -
              Number(
                b.economy || 0
              )
            }
          />

        </div>

      </section>


      {/* =================================================
          COMPARE PLAYERS
      ================================================= */}

      <section
        className="
          rounded-2xl
          border
          border-slate-700
          bg-gradient-to-br
          from-slate-900
          to-slate-800
          p-4
          sm:p-6
        "
      >

        <div className="flex items-center gap-3 mb-2">

          <div
            className="
              w-11
              h-11
              rounded-xl
              bg-emerald-500/10
              border
              border-emerald-500/20
              flex
              items-center
              justify-center
              text-2xl
            "
          >
            ⚔️
          </div>


          <div>

            <h2 className="text-xl font-black">
              Compare Players
            </h2>

            <p className="text-xs text-slate-500">
              Compare GCC players head-to-head
            </p>

          </div>

        </div>


        {/* SELECTORS */}

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            gap-4
            mt-5
          "
        >

          <div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Player 1
            </label>


            <select
              value={compareOne}
              onChange={(e) =>
                setCompareOne(
                  e.target.value
                )
              }
              className="
                w-full
                min-h-[48px]
                rounded-xl
                bg-slate-950
                border
                border-slate-700
                px-4
                text-sm
                font-semibold
                text-white
                outline-none
                focus:border-emerald-500
              "
            >

              <option value="">
                Select Player 1
              </option>


              {comparisonPlayers.map(
                (player) => (

                  <option
                    key={player.id}
                    value={player.id}
                  >
                    {player.name}
                  </option>

                )
              )}

            </select>

          </div>


          <div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Player 2
            </label>


            <select
              value={compareTwo}
              onChange={(e) =>
                setCompareTwo(
                  e.target.value
                )
              }
              className="
                w-full
                min-h-[48px]
                rounded-xl
                bg-slate-950
                border
                border-slate-700
                px-4
                text-sm
                font-semibold
                text-white
                outline-none
                focus:border-emerald-500
              "
            >

              <option value="">
                Select Player 2
              </option>


              {comparisonPlayers.map(
                (player) => (

                  <option
                    key={player.id}
                    value={player.id}
                  >
                    {player.name}
                  </option>

                )
              )}

            </select>

          </div>

        </div>


        {/* EMPTY */}

        {(!playerOne ||
          !playerTwo) && (

          <div
            className="
              mt-5
              rounded-xl
              border
              border-dashed
              border-slate-700
              p-5
              text-center
              text-sm
              text-slate-500
            "
          >
            Select two players to see their comparison.
          </div>

        )}


        {/* SAME PLAYER */}

        {playerOne &&
          playerTwo &&
          playerOne.id ===
            playerTwo.id && (

          <div
            className="
              mt-5
              rounded-xl
              border
              border-amber-500/20
              bg-amber-500/5
              p-4
              text-center
              text-sm
              text-amber-400
            "
          >
            Please select two different players.
          </div>

        )}


        {/* COMPARISON */}

        {playerOne &&
          playerTwo &&
          playerOne.id !==
            playerTwo.id && (

          <div className="mt-6">

            <div
              className="
                grid
                grid-cols-2
                gap-3
                mb-5
              "
            >

              <div
                className="
                  rounded-2xl
                  bg-slate-950
                  border
                  border-slate-700
                  p-4
                  text-center
                "
              >

                <div
                  className="
                    mx-auto
                    w-12
                    h-12
                    rounded-full
                    bg-emerald-500/10
                    border
                    border-emerald-500/20
                    flex
                    items-center
                    justify-center
                    text-lg
                    font-black
                    text-emerald-400
                  "
                >
                  {playerOne.name
                    .charAt(0)
                    .toUpperCase()}
                </div>


                <div className="font-black mt-2 truncate">
                  {playerOne.name}
                </div>

              </div>


              <div
                className="
                  rounded-2xl
                  bg-slate-950
                  border
                  border-slate-700
                  p-4
                  text-center
                "
              >

                <div
                  className="
                    mx-auto
                    w-12
                    h-12
                    rounded-full
                    bg-purple-500/10
                    border
                    border-purple-500/20
                    flex
                    items-center
                    justify-center
                    text-lg
                    font-black
                    text-purple-400
                  "
                >
                  {playerTwo.name
                    .charAt(0)
                    .toUpperCase()}
                </div>


                <div className="font-black mt-2 truncate">
                  {playerTwo.name}
                </div>

              </div>

            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <ComparisonStat
                label="Runs"
                icon="🏏"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.runs
                }
                valueTwo={
                  playerTwo.runs
                }
              />


              <ComparisonStat
                label="Wickets"
                icon="🎯"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.wickets
                }
                valueTwo={
                  playerTwo.wickets
                }
              />


              <ComparisonStat
                label="Fours"
                icon="🔥"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.fours
                }
                valueTwo={
                  playerTwo.fours
                }
              />


              <ComparisonStat
                label="Sixes"
                icon="🚀"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.sixes
                }
                valueTwo={
                  playerTwo.sixes
                }
              />


              <ComparisonStat
                label="Strike Rate"
                icon="⚡"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.strike_rate
                }
                valueTwo={
                  playerTwo.strike_rate
                }
                decimals={2}
              />


              <ComparisonStat
                label="Economy"
                icon="🛡️"
                playerOne={
                  playerOne.name
                }
                playerTwo={
                  playerTwo.name
                }
                valueOne={
                  playerOne.economy
                }
                valueTwo={
                  playerTwo.economy
                }
                decimals={2}
                lowerIsBetter
              />

            </div>


            {/* SUMMARY */}

            <div
              className="
                mt-5
                rounded-2xl
                bg-emerald-500/5
                border
                border-emerald-500/20
                p-4
                text-center
              "
            >

              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Head-to-Head Summary
              </div>


              <div className="text-sm sm:text-base font-bold">

                {Number(
                  playerOne.runs || 0
                ) >
                Number(
                  playerTwo.runs || 0
                ) ? (

                  <>
                    🏏 {playerOne.name} leads by{' '}

                    <span className="text-emerald-400">

                      {Math.abs(
                        Number(
                          playerOne.runs ||
                            0
                        ) -
                        Number(
                          playerTwo.runs ||
                            0
                        )
                      )}{' '}
                      runs

                    </span>
                  </>

                ) : Number(
                    playerTwo.runs || 0
                  ) >
                  Number(
                    playerOne.runs || 0
                  ) ? (

                  <>
                    🏏 {playerTwo.name} leads by{' '}

                    <span className="text-emerald-400">

                      {Math.abs(
                        Number(
                          playerTwo.runs ||
                            0
                        ) -
                        Number(
                          playerOne.runs ||
                            0
                        )
                      )}{' '}
                      runs

                    </span>
                  </>

                ) : (

                  <>
                    🏏 Both players have equal runs
                  </>

                )}

              </div>


              <div className="text-sm sm:text-base font-bold mt-2">

                {Number(
                  playerOne.wickets || 0
                ) >
                Number(
                  playerTwo.wickets || 0
                ) ? (

                  <>
                    🎯 {playerOne.name} leads by{' '}

                    <span className="text-emerald-400">

                      {Math.abs(
                        Number(
                          playerOne.wickets ||
                            0
                        ) -
                        Number(
                          playerTwo.wickets ||
                            0
                        )
                      )}{' '}
                      wickets

                    </span>
                  </>

                ) : Number(
                    playerTwo.wickets || 0
                  ) >
                  Number(
                    playerOne.wickets || 0
                  ) ? (

                  <>
                    🎯 {playerTwo.name} leads by{' '}

                    <span className="text-emerald-400">

                      {Math.abs(
                        Number(
                          playerTwo.wickets ||
                            0
                        ) -
                        Number(
                          playerOne.wickets ||
                            0
                        )
                      )}{' '}
                      wickets

                    </span>
                  </>

                ) : (

                  <>
                    🎯 Both players have equal wickets
                  </>

                )}

              </div>

            </div>

          </div>

        )}

      </section>

    </div>

  );

}
