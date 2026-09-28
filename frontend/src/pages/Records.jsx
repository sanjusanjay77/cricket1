import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';

import {
  Records as RecordsApi,
  CachedPlayers,
} from '../api/api.js';


/* =========================================================
   CACHE
========================================================= */

const RECORDS_CACHE_KEY =
  'gcc_records_cache_v2';


/* =========================================================
   LOCAL STORAGE READ
========================================================= */

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

    return (
      parsed &&
      typeof parsed === 'object'
    )
      ? parsed
      : null;

  } catch {

    return null;

  }

}


/* =========================================================
   LOCAL STORAGE WRITE
========================================================= */

function writeRecordsCache(records) {

  try {

    localStorage.setItem(
      RECORDS_CACHE_KEY,
      JSON.stringify(records)
    );

  } catch {

    /*
     * Cache failure must never
     * affect the Records page.
     */

  }

}


/* =========================================================
   TOP FIVE
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
          Number(b[valueKey] || 0) -
          Number(a[valueKey] || 0))
    )
    .slice(0, 5);

}


/* =========================================================
   PLAYER NAME
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
   RANK BADGE
========================================================= */

function RankBadge({ rank }) {

  if (rank === 1) {

    return (
      <div
        className="
          w-9 h-9
          rounded-xl
          bg-amber-400/10
          border border-amber-400/20
          flex items-center
          justify-center
          text-lg
          shrink-0
        "
      >
        🥇
      </div>
    );

  }

  if (rank === 2) {

    return (
      <div
        className="
          w-9 h-9
          rounded-xl
          bg-slate-400/10
          border border-slate-400/20
          flex items-center
          justify-center
          text-lg
          shrink-0
        "
      >
        🥈
      </div>
    );

  }

  if (rank === 3) {

    return (
      <div
        className="
          w-9 h-9
          rounded-xl
          bg-orange-500/10
          border border-orange-500/20
          flex items-center
          justify-center
          text-lg
          shrink-0
        "
      >
        🥉
      </div>
    );

  }

  return (
    <div
      className="
        w-9 h-9
        rounded-xl
        bg-slate-800
        border border-slate-700
        flex items-center
        justify-center
        text-xs
        font-black
        text-slate-400
        shrink-0
      "
    >
      #{rank}
    </div>
  );

}


/* =========================================================
   PLAYER AVATAR
========================================================= */

function PlayerAvatar({
  name,
  variant = 'green',
  size = 'normal',
}) {

  const isPurple =
    variant === 'purple';

  const sizeClass =
    size === 'large'
      ? 'w-14 h-14 text-xl'
      : 'w-10 h-10 text-sm';

  return (

    <div
      className={`
        ${sizeClass}
        rounded-2xl
        flex items-center
        justify-center
        font-black
        shrink-0
        border
        ${
          isPurple
            ? `
              bg-purple-500/10
              border-purple-500/20
              text-purple-400
            `
            : `
              bg-emerald-500/10
              border-emerald-500/20
              text-emerald-400
            `
        }
      `}
    >
      {name
        ?.charAt(0)
        ?.toUpperCase() || '?'}
    </div>

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
  sortFn,
}) {

  const topFive =
    getTopFive(
      list,
      sortFn,
      valueKey
    );


  if (topFive.length === 0) {

    return (

      <div
        className="
          rounded-2xl
          border border-slate-800
          bg-slate-900/60
          p-4
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-10 h-10
              rounded-xl
              bg-slate-800
              flex items-center
              justify-center
              text-xl
            "
          >
            {icon}
          </div>

          <div>

            <div className="font-bold text-sm">
              {title}
            </div>

            <div className="text-xs text-slate-500 mt-0.5">
              No record available
            </div>

          </div>

        </div>

      </div>

    );

  }


  return (

    <div
      className="
        relative
        overflow-hidden
        rounded-2xl
        border border-slate-800
        bg-slate-900/80
        shadow-lg
      "
    >

      {/* CARD HEADER */}

      <div
        className="
          px-4 py-4
          border-b border-slate-800
          bg-slate-900
        "
      >

        <div className="flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">

            <div
              className="
                w-10 h-10
                rounded-xl
                bg-emerald-500/10
                border border-emerald-500/20
                flex items-center
                justify-center
                text-xl
                shrink-0
              "
            >
              {icon}
            </div>

            <div className="min-w-0">

              <h3 className="font-black text-sm sm:text-base truncate">
                {title}
              </h3>

              {minLabel ? (

                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                  {minLabel}
                </p>

              ) : (

                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                  GCC all-time
                </p>

              )}

            </div>

          </div>


          <div
            className="
              px-2.5 py-1
              rounded-full
              bg-slate-800
              border border-slate-700
              text-[9px]
              font-black
              uppercase
              tracking-wider
              text-slate-400
              shrink-0
            "
          >
            TOP 5
          </div>

        </div>

      </div>


      {/* PLAYERS */}

      <div className="px-2 py-2">

        {topFive.map(
          (entry, index) => {

            const rank =
              index + 1;

            const playerName =
              getPlayerName(entry);


            return (

              <div
                key={
                  `${
                    getPlayerId(entry) ||
                    playerName
                  }-${index}`
                }
                className={`
                  flex items-center
                  gap-3
                  px-2
                  py-3
                  rounded-xl
                  transition
                  ${
                    rank === 1
                      ? 'bg-emerald-500/[0.04]'
                      : ''
                  }
                `}
              >

                <RankBadge
                  rank={rank}
                />


                <PlayerAvatar
                  name={playerName}
                />


                <div className="min-w-0 flex-1">

                  <div className="font-bold text-sm truncate">
                    {playerName}
                  </div>

                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Rank #{rank}
                  </div>

                </div>


                <div className="text-right shrink-0">

                  <div
                    className="
                      font-black
                      text-emerald-400
                      text-sm
                    "
                  >
                    {entry[valueKey] ?? 0}
                  </div>

                  <div
                    className="
                      text-[9px]
                      text-slate-500
                      uppercase
                      tracking-wide
                    "
                  >
                    {unit.trim()}
                  </div>

                </div>

              </div>

            );

          }
        )}

      </div>


      {/* BOTTOM ACCENT */}

      <div
        className="
          absolute
          -right-10
          -bottom-12
          text-8xl
          opacity-[0.025]
          pointer-events-none
        "
      >
        {icon}
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
  details,
}) {

  if (!entry) {

    return (

      <div
        className="
          rounded-2xl
          border border-slate-800
          bg-slate-900/70
          p-5
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-11 h-11
              rounded-xl
              bg-slate-800
              flex items-center
              justify-center
              text-2xl
            "
          >
            {icon}
          </div>

          <div>

            <div className="font-black text-sm">
              {title}
            </div>

            <div className="text-xs text-slate-500 mt-1">
              No record available yet
            </div>

          </div>

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
        rounded-3xl
        border border-slate-800
        bg-gradient-to-br
        from-slate-900
        via-slate-900
        to-slate-800
        shadow-xl
      "
    >

      {/* TOP */}

      <div className="p-5 sm:p-6">

        <div className="flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">

            <div
              className="
                w-11 h-11
                rounded-2xl
                bg-emerald-500/10
                border border-emerald-500/20
                flex items-center
                justify-center
                text-2xl
                shrink-0
              "
            >
              {icon}
            </div>

            <div className="min-w-0">

              <div className="text-[10px] uppercase tracking-widest text-slate-500">
                GCC Record
              </div>

              <div className="font-black text-sm sm:text-base truncate mt-0.5">
                {title}
              </div>

            </div>

          </div>


          <div
            className="
              w-9 h-9
              rounded-xl
              bg-amber-400/10
              border border-amber-400/20
              flex items-center
              justify-center
              shrink-0
            "
          >
            🥇
          </div>

        </div>


        {/* PLAYER */}

        <div className="mt-6 flex items-center gap-3">

          <PlayerAvatar
            name={playerName}
            size="large"
          />

          <div className="min-w-0">

            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              Record holder
            </div>

            <div className="text-xl sm:text-2xl font-black truncate mt-1">
              {playerName}
            </div>

          </div>

        </div>


        {/* MAIN VALUE */}

        <div className="mt-6">

          <div
            className="
              text-5xl
              sm:text-6xl
              font-black
              tracking-tight
              text-white
              leading-none
            "
          >
            {mainValue}
          </div>

          {subtitle && (

            <div className="text-xs sm:text-sm text-slate-400 mt-3 leading-relaxed">
              {subtitle}
            </div>

          )}

        </div>

      </div>


      {/* MATCH INFO */}

      <div
        className="
          mx-4 mb-4
          rounded-2xl
          bg-slate-950/60
          border border-slate-800
          px-4 py-3
        "
      >

        <div className="flex items-center gap-2">

          <span className="text-sm">
            📅
          </span>

          <div className="min-w-0">

            <div className="text-[9px] uppercase tracking-widest text-slate-500">
              Particular Match
            </div>

            <div className="text-xs sm:text-sm font-bold mt-1 truncate">

              {entry.match_date

                ? new Date(
                    entry.match_date
                  ).toLocaleDateString(
                    'en-IN',
                    {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }
                  )

                : entry.match_id
                ? `Match ${entry.match_id}`
                : 'Match information unavailable'}

            </div>

          </div>

        </div>

      </div>


      {/* DETAILS */}

      {details &&
        details.length > 0 && (

          <div
            className="
              grid
              grid-cols-2
              gap-2
              px-4
              pb-4
            "
          >

            {details.map(
              (item, index) => (

                <div
                  key={index}
                  className="
                    rounded-2xl
                    bg-slate-950/50
                    border border-slate-800
                    px-3 py-3
                    min-w-0
                  "
                >

                  <div
                    className="
                      text-[9px]
                      uppercase
                      tracking-widest
                      text-slate-500
                      truncate
                    "
                  >
                    {item.label}
                  </div>

                  <div
                    className="
                      text-sm
                      font-black
                      mt-1
                      truncate
                    "
                  >
                    {item.value}
                  </div>

                </div>

              )
            )}

          </div>

        )}


      <div
        className="
          absolute
          -right-10
          -bottom-10
          text-9xl
          opacity-[0.025]
          pointer-events-none
        "
      >
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
  lowerIsBetter = false,
}) {

  const one =
    Number(valueOne || 0);

  const two =
    Number(valueTwo || 0);

  const difference =
    Math.abs(one - two);


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
    value =>
      decimals > 0
        ? value.toFixed(decimals)
        : Math.round(value);


  return (

    <div
      className={`
        rounded-2xl
        border
        p-4
        ${
          leader
            ? 'border-slate-700 bg-slate-900/80'
            : 'border-slate-800 bg-slate-900/60'
        }
      `}
    >

      {/* TITLE */}

      <div className="flex items-center justify-center gap-2 mb-4">

        <span className="text-base">
          {icon}
        </span>

        <span
          className="
            text-[10px]
            uppercase
            tracking-widest
            font-black
            text-slate-400
          "
        >
          {label}
        </span>

      </div>


      {/* PLAYERS */}

      <div className="grid grid-cols-2 gap-2">

        <div
          className={`
            rounded-xl
            p-3
            text-center
            border
            min-w-0
            ${
              leader === 'one'
                ? `
                  border-emerald-500/30
                  bg-emerald-500/10
                `
                : `
                  border-slate-800
                  bg-slate-950/50
                `
            }
          `}
        >

          <div
            className="
              text-[10px]
              text-slate-500
              truncate
            "
          >
            {playerOne}
          </div>

          <div
            className={`
              text-2xl
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

            <div
              className="
                text-[8px]
                text-emerald-400
                font-black
                mt-1
                tracking-wider
              "
            >
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
            min-w-0
            ${
              leader === 'two'
                ? `
                  border-emerald-500/30
                  bg-emerald-500/10
                `
                : `
                  border-slate-800
                  bg-slate-950/50
                `
            }
          `}
        >

          <div
            className="
              text-[10px]
              text-slate-500
              truncate
            "
          >
            {playerTwo}
          </div>

          <div
            className={`
              text-2xl
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

            <div
              className="
                text-[8px]
                text-emerald-400
                font-black
                mt-1
                tracking-wider
              "
            >
              LEADS
            </div>

          )}

        </div>

      </div>


      {/* DIFFERENCE */}

      <div className="text-center mt-3">

        {one === two ? (

          <span className="text-[10px] text-slate-500 font-bold">
            EQUAL
          </span>

        ) : (

          <span className="text-[10px] text-slate-500">

            {leader === 'one'
              ? playerOne
              : playerTwo}

            <span className="mx-1">
              leads by
            </span>

            <span className="font-black text-emerald-400">

              {decimals > 0
                ? difference.toFixed(decimals)
                : Math.round(difference)}

            </span>

          </span>

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
      player?.team_name ||
      player?.team?.name ||
      player?.team ||
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
      player?.id != null
    ) {

      gccPlayerIds.add(
        String(player.id)
      );

    }


    if (
      player?.player_id != null
    ) {

      gccPlayerIds.add(
        String(player.player_id)
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
      ),

  };

}


/* =========================================================
   SECTION TITLE
========================================================= */

function SectionTitle({
  icon,
  title,
  subtitle,
}) {

  return (

    <div className="flex items-center gap-3 mb-4">

      <div
        className="
          w-10 h-10
          rounded-xl
          bg-slate-900
          border border-slate-800
          flex items-center
          justify-center
          text-xl
          shrink-0
        "
      >
        {icon}
      </div>

      <div className="min-w-0">

        <h2 className="text-lg sm:text-xl font-black truncate">
          {title}
        </h2>

        {subtitle && (

          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
            {subtitle}
          </p>

        )}

      </div>

    </div>

  );

}


/* =========================================================
   RECORDS PAGE
========================================================= */

export default function Records() {

  const memoryRecords =
    RecordsApi.getMemoryCache();


  const initialRecords =
    memoryRecords ||
    readRecordsCache();


  const [records, setRecords] =
    useState(initialRecords);


  const [loading, setLoading] =
    useState(
      initialRecords === null ||
      initialRecords === undefined
    );


  const [error, setError] =
    useState('');


  /* =======================================================
     COMPARISON
  ======================================================= */

  const [compareOne, setCompareOne] =
    useState('');

  const [compareTwo, setCompareTwo] =
    useState('');


  /* =======================================================
     LOAD
  ======================================================= */

  const loadRecords =
    useCallback(
      async () => {

        try {

          setError('');


          const recordsPromise =
            RecordsApi.get();


          const playersPromise =
            CachedPlayers.listAll();


          const [
            recordsData,
            allPlayers,
          ] = await Promise.all([
            recordsPromise,
            playersPromise,
          ]);


          const gccRecords =
            buildGccRecords(
              recordsData,
              allPlayers
            );


          setRecords(
            gccRecords
          );


          writeRecordsCache(
            gccRecords
          );


        } catch (err) {

          console.error(
            'Failed to load GCC records:',
            err
          );


          if (!records) {

            setError(
              'Failed to load GCC records.'
            );

          }

        } finally {

          setLoading(false);

        }

      },
      [records]
    );


  /* =======================================================
     LOAD PAGE
  ======================================================= */

  useEffect(() => {

    loadRecords();

  }, [loadRecords]);


  /* =======================================================
     COMPARISON PLAYERS
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

        records.bestEconomy,

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

              economy: 0,

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
            runs >
            player.runs
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
          player =>
            player.id ===
            compareOne
        ),
      [
        comparisonPlayers,
        compareOne,
      ]
    );


  const playerTwo =
    useMemo(
      () =>
        comparisonPlayers.find(
          player =>
            player.id ===
            compareTwo
        ),
      [
        comparisonPlayers,
        compareTwo,
      ]
    );


  /* =======================================================
     FIRST LOAD
  ======================================================= */

  if (
    loading &&
    !records
  ) {

    return (

      <div className="space-y-4">

        <div className="flex items-center gap-3">

          <div className="w-11 h-11 rounded-2xl bg-slate-800 animate-pulse" />

          <div className="space-y-2">

            <div className="h-5 w-48 bg-slate-800 rounded animate-pulse" />

            <div className="h-3 w-28 bg-slate-800 rounded animate-pulse" />

          </div>

        </div>


        <div className="h-64 bg-slate-800 rounded-3xl animate-pulse" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="h-64 bg-slate-800 rounded-2xl animate-pulse" />

          <div className="h-64 bg-slate-800 rounded-2xl animate-pulse" />

        </div>

      </div>

    );

  }


  /* =======================================================
     ERROR
  ======================================================= */

  if (
    error &&
    !records
  ) {

    return (

      <div
        className="
          rounded-2xl
          border border-red-500/20
          bg-red-500/5
          p-5
          text-center
          text-red-400
        "
      >
        {error}
      </div>

    );

  }


  /* =======================================================
     EMPTY
  ======================================================= */

  if (!records) {

    return (

      <div
        className="
          rounded-2xl
          border border-slate-800
          bg-slate-900/60
          p-8
          text-center
          text-slate-400
        "
      >

        <div className="text-4xl mb-3">
          📜
        </div>

        <div className="font-bold">
          No GCC records available
        </div>

      </div>

    );

  }


  /* =======================================================
     PAGE
  ======================================================= */

  return (

    <div
      className="
        fade-in
        w-full
        max-w-full
        overflow-x-hidden
        pb-8
      "
    >

      {/* ===================================================
          MOBILE / DESKTOP HEADER
      =================================================== */}

      <div
        className="
          sticky
          top-0
          z-20
          -mx-1
          px-1
          pt-1
          pb-4
          bg-slate-950/95
          backdrop-blur-md
          border-b
          border-slate-900
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-12 h-12
              rounded-2xl
              bg-gradient-to-br
              from-emerald-500/15
              to-emerald-500/5
              border border-emerald-500/20
              flex items-center
              justify-center
              text-2xl
              shrink-0
              shadow-lg
            "
          >
            📜
          </div>


          <div className="min-w-0 flex-1">

            <div className="flex items-center gap-2">

              <h1
                className="
                  text-xl
                  sm:text-2xl
                  font-black
                  tracking-tight
                  truncate
                "
              >
                GCC Records
              </h1>

              <span
                className="
                  hidden
                  sm:inline-flex
                  px-2
                  py-1
                  rounded-full
                  bg-emerald-500/10
                  border border-emerald-500/20
                  text-[9px]
                  uppercase
                  tracking-widest
                  font-black
                  text-emerald-400
                "
              >
                ALL TIME
              </span>

            </div>


            <p className="text-[11px] sm:text-sm text-slate-500 mt-0.5">
              GCC players • Career records & milestones
            </p>

          </div>

        </div>

      </div>


      <div className="space-y-7 mt-5">


        {/* =================================================
            BEST OF GCC
        ================================================= */}

        <section>

          <SectionTitle
            icon="👑"
            title="Best of GCC"
            subtitle="The biggest single-innings performances"
          />


          <div
            className="
              grid
              grid-cols-1
              lg:grid-cols-2
              gap-4
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
                      records.bestBowling.wickets || 0
                    )}/${Number(
                      records.bestBowling.runs || 0
                    )}`
                  : '—'
              }

              subtitle="Best bowling performance in a single innings"

              details={[
                {
                  label: 'Overs',
                  value:
                    records.bestBowling?.overs ||
                    '0.0',
                },
                {
                  label: 'Wickets',
                  value:
                    records.bestBowling?.wickets ||
                    0,
                },
                {
                  label: 'Runs',
                  value:
                    records.bestBowling?.runs ||
                    0,
                },
                {
                  label: 'Economy',
                  value:
                    records.bestBowling?.economy ||
                    0,
                },
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
                      records.bestBattingFigure.runs || 0
                    )} (${Number(
                      records.bestBattingFigure.balls || 0
                    )})`
                  : '—'
              }

              subtitle="Most runs scored in a particular single innings"

              details={[
                {
                  label: 'Strike Rate',
                  value:
                    records.bestBattingFigure?.strike_rate ??
                    0,
                },
                {
                  label: 'Fours',
                  value:
                    records.bestBattingFigure?.fours ??
                    0,
                },
                {
                  label: 'Sixes',
                  value:
                    records.bestBattingFigure?.sixes ??
                    0,
                },
                {
                  label: 'Balls',
                  value:
                    records.bestBattingFigure?.balls ??
                    0,
                },
              ]}

            />

          </div>

        </section>


        {/* =================================================
            BATTING RECORDS
        ================================================= */}

        <section>

          <SectionTitle
            icon="🏏"
            title="Batting Records"
            subtitle="GCC's leading batting performances"
          />


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
              list={records.mostRuns}
              valueKey="runs"
              unit="runs"
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
              unit="fours"
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
              unit="sixes"
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
              unit="SR"
              minLabel="Minimum 10 balls faced"
              sortFn={(a, b) =>
                Number(b.strike_rate || 0) -
                Number(a.strike_rate || 0)
              }
            />

          </div>

        </section>


        {/* =================================================
            BOWLING RECORDS
        ================================================= */}

        <section>

          <SectionTitle
            icon="🎯"
            title="Bowling Records"
            subtitle="GCC's leading bowling performances"
          />


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
              list={records.mostWickets}
              valueKey="wickets"
              unit="wickets"
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
              unit="Econ"
              minLabel="Minimum 2 overs bowled"
              sortFn={(a, b) =>
                Number(a.economy || 0) -
                Number(b.economy || 0)
              }
            />

          </div>

        </section>


        {/* =================================================
            COMPARE PLAYERS
        ================================================= */}

        <section
          className="
            rounded-3xl
            border border-slate-800
            bg-gradient-to-br
            from-slate-900
            to-slate-800/70
            overflow-hidden
            shadow-xl
          "
        >

          {/* COMPARE HEADER */}

          <div
            className="
              p-5
              sm:p-6
              border-b border-slate-800
            "
          >

            <div className="flex items-center gap-3">

              <div
                className="
                  w-11 h-11
                  rounded-2xl
                  bg-emerald-500/10
                  border border-emerald-500/20
                  flex items-center
                  justify-center
                  text-2xl
                  shrink-0
                "
              >
                ⚔️
              </div>


              <div className="min-w-0">

                <h2 className="text-xl font-black truncate">
                  Compare Players
                </h2>

                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Head-to-head GCC career comparison
                </p>

              </div>

            </div>

          </div>


          {/* SELECTORS */}

          <div className="p-5 sm:p-6">

            <div
              className="
                grid
                grid-cols-1
                md:grid-cols-2
                gap-3
              "
            >

              {/* PLAYER ONE */}

              <div>

                <label
                  className="
                    flex
                    items-center
                    gap-2
                    text-[10px]
                    font-black
                    uppercase
                    tracking-widest
                    text-slate-500
                    mb-2
                  "
                >
                  <span
                    className="
                      w-5 h-5
                      rounded-lg
                      bg-emerald-500/10
                      text-emerald-400
                      flex items-center
                      justify-center
                    "
                  >
                    1
                  </span>

                  Player One
                </label>


                <select
                  value={compareOne}
                  onChange={e =>
                    setCompareOne(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    min-h-[52px]
                    rounded-2xl
                    bg-slate-950
                    border border-slate-700
                    px-4
                    text-sm
                    font-bold
                    text-white
                    outline-none
                    appearance-none
                    cursor-pointer
                    focus:border-emerald-500
                    focus:ring-2
                    focus:ring-emerald-500/10
                  "
                >

                  <option value="">
                    Select Player 1
                  </option>


                  {comparisonPlayers.map(
                    player => (

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


              {/* PLAYER TWO */}

              <div>

                <label
                  className="
                    flex
                    items-center
                    gap-2
                    text-[10px]
                    font-black
                    uppercase
                    tracking-widest
                    text-slate-500
                    mb-2
                  "
                >
                  <span
                    className="
                      w-5 h-5
                      rounded-lg
                      bg-purple-500/10
                      text-purple-400
                      flex items-center
                      justify-center
                    "
                  >
                    2
                  </span>

                  Player Two
                </label>


                <select
                  value={compareTwo}
                  onChange={e =>
                    setCompareTwo(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    min-h-[52px]
                    rounded-2xl
                    bg-slate-950
                    border border-slate-700
                    px-4
                    text-sm
                    font-bold
                    text-white
                    outline-none
                    appearance-none
                    cursor-pointer
                    focus:border-purple-500
                    focus:ring-2
                    focus:ring-purple-500/10
                  "
                >

                  <option value="">
                    Select Player 2
                  </option>


                  {comparisonPlayers.map(
                    player => (

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


            {/* EMPTY STATE */}

            {(!playerOne ||
              !playerTwo) && (

              <div
                className="
                  mt-4
                  rounded-2xl
                  border border-dashed
                  border-slate-700
                  bg-slate-950/30
                  p-6
                  text-center
                "
              >

                <div className="text-3xl mb-2">
                  ⚔️
                </div>

                <div className="text-sm font-bold text-slate-300">
                  Choose two players
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  Their head-to-head statistics will appear here.
                </div>

              </div>

            )}


            {/* SAME PLAYER */}

            {playerOne &&
              playerTwo &&
              playerOne.id ===
                playerTwo.id && (

              <div
                className="
                  mt-4
                  rounded-2xl
                  border border-amber-500/20
                  bg-amber-500/5
                  p-4
                  text-center
                "
              >

                <div className="text-xl mb-1">
                  ⚠️
                </div>

                <div className="text-sm font-bold text-amber-400">
                  Please select two different players.
                </div>

              </div>

            )}


            {/* COMPARISON */}

            {playerOne &&
              playerTwo &&
              playerOne.id !==
                playerTwo.id && (

              <div className="mt-6">


                {/* PLAYER HEADER */}

                <div
                  className="
                    grid
                    grid-cols-2
                    gap-2
                    mb-4
                  "
                >

                  <div
                    className="
                      rounded-2xl
                      bg-slate-950
                      border border-emerald-500/20
                      p-4
                      text-center
                      min-w-0
                    "
                  >

                    <PlayerAvatar
                      name={playerOne.name}
                      size="large"
                    />

                    <div
                      className="
                        font-black
                        text-sm
                        mt-3
                        truncate
                      "
                    >
                      {playerOne.name}
                    </div>

                    <div
                      className="
                        text-[9px]
                        uppercase
                        tracking-widest
                        text-emerald-400
                        mt-1
                      "
                    >
                      Player 1
                    </div>

                  </div>


                  <div
                    className="
                      rounded-2xl
                      bg-slate-950
                      border border-purple-500/20
                      p-4
                      text-center
                      min-w-0
                    "
                  >

                    <PlayerAvatar
                      name={playerTwo.name}
                      variant="purple"
                      size="large"
                    />

                    <div
                      className="
                        font-black
                        text-sm
                        mt-3
                        truncate
                      "
                    >
                      {playerTwo.name}
                    </div>

                    <div
                      className="
                        text-[9px]
                        uppercase
                        tracking-widest
                        text-purple-400
                        mt-1
                      "
                    >
                      Player 2
                    </div>

                  </div>

                </div>


                {/* STATS */}

                <div
                  className="
                    grid
                    grid-cols-1
                    sm:grid-cols-2
                    gap-3
                  "
                >

                  <ComparisonStat
                    label="Runs"
                    icon="🏏"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.runs}
                    valueTwo={playerTwo.runs}
                  />


                  <ComparisonStat
                    label="Wickets"
                    icon="🎯"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.wickets}
                    valueTwo={playerTwo.wickets}
                  />


                  <ComparisonStat
                    label="Fours"
                    icon="🔥"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.fours}
                    valueTwo={playerTwo.fours}
                  />


                  <ComparisonStat
                    label="Sixes"
                    icon="🚀"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.sixes}
                    valueTwo={playerTwo.sixes}
                  />


                  <ComparisonStat
                    label="Strike Rate"
                    icon="⚡"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.strike_rate}
                    valueTwo={playerTwo.strike_rate}
                    decimals={2}
                  />


                  <ComparisonStat
                    label="Economy"
                    icon="🛡️"
                    playerOne={playerOne.name}
                    playerTwo={playerTwo.name}
                    valueOne={playerOne.economy}
                    valueTwo={playerTwo.economy}
                    decimals={2}
                    lowerIsBetter
                  />

                </div>


                {/* SUMMARY */}

                <div
                  className="
                    mt-4
                    rounded-2xl
                    bg-emerald-500/[0.04]
                    border border-emerald-500/15
                    p-4
                  "
                >

                  <div
                    className="
                      text-[9px]
                      uppercase
                      tracking-widest
                      text-slate-500
                      text-center
                      mb-3
                    "
                  >
                    Head-to-Head Summary
                  </div>


                  {/* RUNS SUMMARY */}

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      text-xs
                      sm:text-sm
                      font-bold
                    "
                  >

                    <span className="shrink-0">
                      🏏
                    </span>

                    <span className="min-w-0">

                      {Number(playerOne.runs || 0) >
                      Number(playerTwo.runs || 0) ? (

                        <>
                          {playerOne.name}
                          <span className="text-slate-500 mx-1">
                            leads by
                          </span>

                          <span className="text-emerald-400">
                            {Math.abs(
                              Number(playerOne.runs || 0) -
                              Number(playerTwo.runs || 0)
                            )}{' '}
                            runs
                          </span>
                        </>

                      ) : Number(playerTwo.runs || 0) >
                        Number(playerOne.runs || 0) ? (

                        <>
                          {playerTwo.name}
                          <span className="text-slate-500 mx-1">
                            leads by
                          </span>

                          <span className="text-emerald-400">
                            {Math.abs(
                              Number(playerTwo.runs || 0) -
                              Number(playerOne.runs || 0)
                            )}{' '}
                            runs
                          </span>
                        </>

                      ) : (

                        <span className="text-slate-400">
                          Both players have equal runs
                        </span>

                      )}

                    </span>

                  </div>


                  {/* WICKETS SUMMARY */}

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      text-xs
                      sm:text-sm
                      font-bold
                      mt-3
                    "
                  >

                    <span className="shrink-0">
                      🎯
                    </span>

                    <span className="min-w-0">

                      {Number(playerOne.wickets || 0) >
                      Number(playerTwo.wickets || 0) ? (

                        <>
                          {playerOne.name}
                          <span className="text-slate-500 mx-1">
                            leads by
                          </span>

                          <span className="text-emerald-400">
                            {Math.abs(
                              Number(playerOne.wickets || 0) -
                              Number(playerTwo.wickets || 0)
                            )}{' '}
                            wickets
                          </span>
                        </>

                      ) : Number(playerTwo.wickets || 0) >
                        Number(playerOne.wickets || 0) ? (

                        <>
                          {playerTwo.name}
                          <span className="text-slate-500 mx-1">
                            leads by
                          </span>

                          <span className="text-emerald-400">
                            {Math.abs(
                              Number(playerTwo.wickets || 0) -
                              Number(playerOne.wickets || 0)
                            )}{' '}
                            wickets
                          </span>
                        </>

                      ) : (

                        <span className="text-slate-400">
                          Both players have equal wickets
                        </span>

                      )}

                    </span>

                  </div>

                </div>

              </div>

            )}

          </div>

        </section>


        {/* =================================================
            FOOTER
        ================================================= */}

        <div
          className="
            text-center
            px-4
            pt-2
            pb-4
          "
        >

          <div
            className="
              inline-flex
              items-center
              gap-2
              px-3
              py-2
              rounded-full
              bg-slate-900
              border border-slate-800
              text-[9px]
              uppercase
              tracking-widest
              font-bold
              text-slate-500
            "
          >
            🏏 GCC • All-Time Records
          </div>

        </div>

      </div>

    </div>

  );

}
