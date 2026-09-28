import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
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

    // Cache failure must never break the page.

  }

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
   GET VALUE
========================================================= */

function getStatValue(
  player,
  valueKey
) {

  return Number(
    player?.[valueKey] || 0
  );

}


/* =========================================================
   TOP 5 WITH TIE RANKING
=========================================================

   Rules:

   1. Ignore players with 0 stat.
   2. Sort according to sortFn.
   3. Maximum 5 displayed positions.
   4. Same statistic = same rank.
   5. Example:

      100 -> #1
      100 -> #1
       80 -> #3
       70 -> #4
       70 -> #4

   We allow all players tied at the 5th
   position to appear.
========================================================= */

function getTopFive(
  list,
  sortFn,
  valueKey,
  lowerIsBetter = false
) {

  if (!Array.isArray(list)) {
    return [];
  }


  const valid =
    list.filter(
      entry =>
        getStatValue(
          entry,
          valueKey
        ) > 0
    );


  const sorted =
    [...valid].sort(
      sortFn ||
        ((a, b) => {

          const aValue =
            getStatValue(
              a,
              valueKey
            );

          const bValue =
            getStatValue(
              b,
              valueKey
            );

          return lowerIsBetter
            ? aValue - bValue
            : bValue - aValue;

        })
    );


  if (sorted.length === 0) {
    return [];
  }


  const result = [];


  let previousValue = null;
  let currentRank = 0;


  for (
    let index = 0;
    index < sorted.length;
    index++
  ) {

    const entry =
      sorted[index];

    const value =
      getStatValue(
        entry,
        valueKey
      );


    if (
      previousValue === null ||
      value !== previousValue
    ) {

      currentRank =
        index + 1;

    }


    /*
     * Only show top 5 ranking positions.
     *
     * If rank 5 has multiple tied players,
     * all tied players at rank 5 are shown.
     */

    if (
      currentRank > 5
    ) {

      break;

    }


    result.push({
      entry,
      rank: currentRank,
    });


    previousValue =
      value;

  }


  return result;

}


/* =========================================================
   RANK BADGE
========================================================= */

function RankBadge({
  rank,
}) {

  if (rank === 1) {

    return (
      <div
        className="
          w-7 h-7
          rounded-lg
          bg-amber-400/10
          border border-amber-400/20
          flex items-center
          justify-center
          text-sm
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
          w-7 h-7
          rounded-lg
          bg-slate-400/10
          border border-slate-400/20
          flex items-center
          justify-center
          text-sm
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
          w-7 h-7
          rounded-lg
          bg-orange-500/10
          border border-orange-500/20
          flex items-center
          justify-center
          text-sm
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
        w-7 h-7
        rounded-lg
        bg-slate-800
        border border-slate-700
        flex items-center
        justify-center
        text-[9px]
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
      ? 'w-10 h-10 text-sm'
      : 'w-8 h-8 text-xs';


  return (

    <div
      className={`
        ${sizeClass}
        rounded-xl
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
   COMPACT LEADERBOARD CARD
========================================================= */

function LeaderboardCard({
  title,
  icon,
  list,
  valueKey,
  unit = '',
  minLabel,
  sortFn,
  lowerIsBetter = false,
}) {

  const topFive =
    getTopFive(
      list,
      sortFn,
      valueKey,
      lowerIsBetter
    );


  if (topFive.length === 0) {

    return (

      <div
        className="
          rounded-xl
          border border-slate-800
          bg-slate-900/50
          px-3
          py-3
        "
      >

        <div className="flex items-center gap-2">

          <div
            className="
              w-8 h-8
              rounded-lg
              bg-slate-800
              flex items-center
              justify-center
              text-sm
              shrink-0
            "
          >
            {icon}
          </div>

          <div className="min-w-0">

            <div className="font-black text-xs">
              {title}
            </div>

            <div className="text-[9px] text-slate-600">
              No scored record yet
            </div>

          </div>

        </div>

      </div>

    );

  }


  return (

    <div
      className="
        rounded-xl
        border border-slate-800
        bg-slate-900/60
        overflow-hidden
      "
    >

      {/* HEADER */}

      <div
        className="
          flex items-center
          justify-between
          gap-2
          px-3
          py-2.5
          border-b border-slate-800
        "
      >

        <div className="flex items-center gap-2 min-w-0">

          <div
            className="
              w-7 h-7
              rounded-lg
              bg-emerald-500/10
              border border-emerald-500/15
              flex items-center
              justify-center
              text-sm
              shrink-0
            "
          >
            {icon}
          </div>

          <div className="min-w-0">

            <div
              className="
                text-xs
                font-black
                truncate
              "
            >
              {title}
            </div>

            <div
              className="
                text-[8px]
                text-slate-600
                truncate
              "
            >
              {minLabel || 'GCC all-time'}
            </div>

          </div>

        </div>


        <div
          className="
            text-[8px]
            font-black
            uppercase
            tracking-wider
            text-slate-500
            shrink-0
          "
        >
          TOP 5
        </div>

      </div>


      {/* PLAYERS */}

      <div className="px-1.5 py-1">

        {topFive.map(
          ({
            entry,
            rank,
          }, index) => {

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
                  gap-2
                  px-1.5
                  py-1.5
                  rounded-lg
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


                <div
                  className="
                    min-w-0
                    flex-1
                  "
                >

                  <div
                    className="
                      text-xs
                      font-bold
                      truncate
                    "
                  >
                    {playerName}
                  </div>

                </div>


                <div
                  className="
                    text-right
                    shrink-0
                    min-w-[42px]
                  "
                >

                  <div
                    className="
                      text-xs
                      font-black
                      text-emerald-400
                    "
                  >
                    {entry[valueKey] ?? 0}
                  </div>

                  <div
                    className="
                      text-[7px]
                      uppercase
                      tracking-wide
                      text-slate-600
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

    </div>

  );

}


/* =========================================================
   COMPACT BEST RECORD CARD
========================================================= */

function BestRecordCard({
  title,
  icon,
  entry,
  mainValue,
  details = [],
}) {

  if (!entry) {

    return (

      <div
        className="
          rounded-xl
          border border-slate-800
          bg-slate-900/50
          px-3
          py-3
        "
      >

        <div className="flex items-center gap-2">

          <div
            className="
              w-8 h-8
              rounded-lg
              bg-slate-800
              flex items-center
              justify-center
              text-sm
              shrink-0
            "
          >
            {icon}
          </div>

          <div>

            <div className="text-xs font-black">
              {title}
            </div>

            <div className="text-[9px] text-slate-600">
              No record yet
            </div>

          </div>

        </div>

      </div>

    );

  }


  const playerName =
    getPlayerName(entry);


  const matchDate =
    entry.match_date
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
      : 'Match unavailable';


  return (

    <div
      className="
        rounded-xl
        border border-slate-800
        bg-slate-900/70
        overflow-hidden
      "
    >

      <div className="p-3">

        {/* TOP */}

        <div
          className="
            flex items-center
            justify-between
            gap-2
          "
        >

          <div className="flex items-center gap-2 min-w-0">

            <div
              className="
                w-8 h-8
                rounded-lg
                bg-emerald-500/10
                border border-emerald-500/15
                flex items-center
                justify-center
                text-sm
                shrink-0
              "
            >
              {icon}
            </div>

            <div className="min-w-0">

              <div
                className="
                  text-[8px]
                  uppercase
                  tracking-widest
                  text-slate-600
                "
              >
                Best Record
              </div>

              <div
                className="
                  text-xs
                  font-black
                  truncate
                "
              >
                {title}
              </div>

            </div>

          </div>


          <div
            className="
              text-sm
              shrink-0
            "
          >
            🥇
          </div>

        </div>


        {/* PLAYER + VALUE */}

        <div
          className="
            mt-3
            flex
            items-center
            justify-between
            gap-3
          "
        >

          <div
            className="
              flex items-center
              gap-2
              min-w-0
            "
          >

            <PlayerAvatar
              name={playerName}
              size="normal"
            />

            <div className="min-w-0">

              <div
                className="
                  text-[8px]
                  uppercase
                  tracking-widest
                  text-slate-600
                "
              >
                Holder
              </div>

              <div
                className="
                  text-xs
                  font-black
                  truncate
                "
              >
                {playerName}
              </div>

            </div>

          </div>


          <div
            className="
              text-right
              shrink-0
            "
          >

            <div
              className="
                text-2xl
                font-black
                leading-none
                text-white
              "
            >
              {mainValue}
            </div>

          </div>

        </div>


        {/* DETAILS */}

        <div
          className="
            grid
            grid-cols-4
            gap-1.5
            mt-3
          "
        >

          {details.map(
            (item, index) => (

              <div
                key={index}
                className="
                  rounded-lg
                  bg-slate-950/60
                  border border-slate-800
                  px-1.5
                  py-1.5
                  text-center
                  min-w-0
                "
              >

                <div
                  className="
                    text-[7px]
                    uppercase
                    tracking-wide
                    text-slate-600
                    truncate
                  "
                >
                  {item.label}
                </div>

                <div
                  className="
                    text-[10px]
                    font-black
                    mt-0.5
                    truncate
                  "
                >
                  {item.value}
                </div>

              </div>

            )
          )}

        </div>


        {/* DATE */}

        <div
          className="
            mt-2
            text-[8px]
            text-slate-600
            text-right
          "
        >
          📅 {matchDate}
        </div>

      </div>

    </div>

  );

}


/* =========================================================
   COMPACT COMPARISON STAT
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


  let leader =
    null;


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


  const difference =
    Math.abs(
      one - two
    );


  return (

    <div
      className="
        rounded-xl
        border border-slate-800
        bg-slate-900/55
        px-2.5
        py-2
      "
    >

      {/* TITLE */}

      <div
        className="
          flex items-center
          justify-center
          gap-1
          mb-1.5
        "
      >

        <span className="text-xs">
          {icon}
        </span>

        <span
          className="
            text-[8px]
            uppercase
            tracking-widest
            font-black
            text-slate-500
          "
        >
          {label}
        </span>

      </div>


      {/* VALUES */}

      <div
        className="
          grid
          grid-cols-2
          gap-1
        "
      >

        {/* PLAYER ONE */}

        <div
          className={`
            rounded-lg
            px-1.5
            py-1.5
            text-center
            border
            min-w-0
            ${
              leader === 'one'
                ? `
                  border-emerald-500/25
                  bg-emerald-500/10
                `
                : `
                  border-slate-800
                  bg-slate-950/40
                `
            }
          `}
        >

          <div
            className="
              text-[7px]
              text-slate-600
              truncate
            "
          >
            {playerOne}
          </div>

          <div
            className={`
              text-lg
              font-black
              leading-none
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

        </div>


        {/* PLAYER TWO */}

        <div
          className={`
            rounded-lg
            px-1.5
            py-1.5
            text-center
            border
            min-w-0
            ${
              leader === 'two'
                ? `
                  border-purple-500/25
                  bg-purple-500/10
                `
                : `
                  border-slate-800
                  bg-slate-950/40
                `
            }
          `}
        >

          <div
            className="
              text-[7px]
              text-slate-600
              truncate
            "
          >
            {playerTwo}
          </div>

          <div
            className={`
              text-lg
              font-black
              leading-none
              mt-1
              ${
                leader === 'two'
                  ? 'text-purple-400'
                  : 'text-white'
              }
            `}
          >
            {formatValue(two)}
          </div>

        </div>

      </div>


      {/* DIFFERENCE */}

      <div
        className="
          text-center
          mt-1.5
          min-h-[12px]
        "
      >

        {one === two ? (

          <span
            className="
              text-[7px]
              font-black
              text-slate-600
              uppercase
            "
          >
            Equal
          </span>

        ) : (

          <span
            className="
              text-[7px]
              text-slate-600
            "
          >

            {leader === 'one'
              ? 'P1'
              : 'P2'}

            {' + '}

            <span className="text-emerald-400 font-black">

              {decimals > 0
                ? difference.toFixed(
                    decimals
                  )
                : Math.round(
                    difference
                  )}

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

    <div
      className="
        flex items-center
        gap-2.5
        mb-2.5
      "
    >

      <div
        className="
          w-8 h-8
          rounded-lg
          bg-slate-900
          border border-slate-800
          flex items-center
          justify-center
          text-sm
          shrink-0
        "
      >
        {icon}
      </div>

      <div className="min-w-0">

        <h2
          className="
            text-sm
            sm:text-base
            font-black
            truncate
          "
        >
          {title}
        </h2>

        {subtitle && (

          <p
            className="
              text-[8px]
              sm:text-[9px]
              text-slate-600
              truncate
            "
          >
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
    useState(
      initialRecords
    );


  const recordsRef =
    useRef(
      initialRecords
    );


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
     KEEP RECORD REF UPDATED
  ======================================================= */

  useEffect(() => {

    recordsRef.current =
      records;

  }, [records]);


  /* =======================================================
     LOAD RECORDS
  ======================================================= */

  const loadRecords =
    useCallback(
      async () => {

        try {

          setError('');


          const [
            recordsData,
            allPlayers,
          ] = await Promise.all([

            RecordsApi.get(),

            CachedPlayers.listAll(),

          ]);


          const gccRecords =
            buildGccRecords(
              recordsData,
              allPlayers
            );


          recordsRef.current =
            gccRecords;


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


          if (
            !recordsRef.current
          ) {

            setError(
              'Failed to load GCC records.'
            );

          }

        } finally {

          setLoading(false);

        }

      },
      []
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

      <div className="space-y-3">

        <div className="flex items-center gap-2">

          <div
            className="
              w-9 h-9
              rounded-xl
              bg-slate-800
              animate-pulse
            "
          />

          <div className="space-y-1.5">

            <div
              className="
                h-4
                w-36
                bg-slate-800
                rounded
                animate-pulse
              "
            />

            <div
              className="
                h-2.5
                w-24
                bg-slate-800
                rounded
                animate-pulse
              "
            />

          </div>

        </div>


        <div
          className="
            h-32
            bg-slate-800
            rounded-xl
            animate-pulse
          "
        />


        <div
          className="
            grid
            grid-cols-1
            sm:grid-cols-2
            gap-2
          "
        >

          <div
            className="
              h-48
              bg-slate-800
              rounded-xl
              animate-pulse
            "
          />

          <div
            className="
              h-48
              bg-slate-800
              rounded-xl
              animate-pulse
            "
          />

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
          rounded-xl
          border border-red-500/20
          bg-red-500/5
          p-4
          text-center
          text-red-400
          text-sm
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
          rounded-xl
          border border-slate-800
          bg-slate-900/60
          p-6
          text-center
          text-slate-400
        "
      >

        <div className="text-3xl mb-2">
          📜
        </div>

        <div className="text-sm font-bold">
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
        pb-5
      "
    >

      {/* ===================================================
          COMPACT HEADER
      =================================================== */}

      <div
        className="
          flex
          items-center
          gap-2.5
          mb-4
        "
      >

        <div
          className="
            w-10 h-10
            rounded-xl
            bg-emerald-500/10
            border border-emerald-500/20
            flex items-center
            justify-center
            text-lg
            shrink-0
          "
        >
          📜
        </div>


        <div className="min-w-0">

          <div className="flex items-center gap-2">

            <h1
              className="
                text-lg
                sm:text-xl
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
                px-1.5
                py-0.5
                rounded-full
                bg-emerald-500/10
                border border-emerald-500/15
                text-[7px]
                uppercase
                tracking-widest
                font-black
                text-emerald-400
              "
            >
              ALL TIME
            </span>

          </div>

          <p
            className="
              text-[9px]
              sm:text-[10px]
              text-slate-600
            "
          >
            GCC players • Career records & milestones
          </p>

        </div>

      </div>


      <div className="space-y-5">


        {/* =================================================
            BEST OF GCC
        ================================================= */}

        <section>

          <SectionTitle
            icon="👑"
            title="Best of GCC"
            subtitle="Best single-innings performances"
          />


          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              gap-2
            "
          >

            {/* BEST BOWLING */}

            <BestRecordCard

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

              details={[
                {
                  label: 'Overs',
                  value:
                    records.bestBowling?.overs ||
                    '0.0',
                },
                {
                  label: 'Wkts',
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
                  label: 'Econ',
                  value:
                    records.bestBowling?.economy ||
                    0,
                },
              ]}

            />


            {/* BEST BATTING */}

            <BestRecordCard

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

              details={[
                {
                  label: 'SR',
                  value:
                    records.bestBattingFigure?.strike_rate ??
                    0,
                },
                {
                  label: '4s',
                  value:
                    records.bestBattingFigure?.fours ??
                    0,
                },
                {
                  label: '6s',
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
            subtitle="Players with runs only • tied stats share rank"
          />


          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              lg:grid-cols-4
              gap-2
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
              minLabel="Minimum 10 balls"
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
            subtitle="Players with wickets/economy only • tied stats share rank"
          />


          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              gap-2
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
              minLabel="Minimum 2 overs"
              lowerIsBetter
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
            rounded-2xl
            border border-slate-800
            bg-slate-900/50
            overflow-hidden
          "
        >

          {/* HEADER */}

          <div
            className="
              flex
              items-center
              gap-2.5
              px-3
              py-3
              border-b border-slate-800
            "
          >

            <div
              className="
                w-8 h-8
                rounded-lg
                bg-emerald-500/10
                border border-emerald-500/15
                flex items-center
                justify-center
                text-sm
                shrink-0
              "
            >
              ⚔️
            </div>

            <div className="min-w-0">

              <h2
                className="
                  text-sm
                  sm:text-base
                  font-black
                "
              >
                Compare Players
              </h2>

              <p
                className="
                  text-[8px]
                  sm:text-[9px]
                  text-slate-600
                "
              >
                GCC head-to-head statistics
              </p>

            </div>

          </div>


          {/* CONTENT */}

          <div className="p-3">


            {/* SELECTORS */}

            <div
              className="
                grid
                grid-cols-2
                gap-2
              "
            >

              {/* PLAYER ONE */}

              <div>

                <div
                  className="
                    flex
                    items-center
                    gap-1
                    mb-1
                  "
                >

                  <span
                    className="
                      w-5 h-5
                      rounded-md
                      bg-emerald-500/10
                      text-emerald-400
                      flex items-center
                      justify-center
                      text-[8px]
                      font-black
                    "
                  >
                    1
                  </span>

                  <span
                    className="
                      text-[8px]
                      uppercase
                      tracking-widest
                      font-black
                      text-slate-600
                    "
                  >
                    Player
                  </span>

                </div>


                <select
                  value={compareOne}
                  onChange={e =>
                    setCompareOne(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    h-10
                    rounded-lg
                    bg-slate-950
                    border border-slate-700
                    px-2.5
                    text-xs
                    font-bold
                    text-white
                    outline-none
                    appearance-none
                    cursor-pointer
                    focus:border-emerald-500
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

                <div
                  className="
                    flex
                    items-center
                    gap-1
                    mb-1
                  "
                >

                  <span
                    className="
                      w-5 h-5
                      rounded-md
                      bg-purple-500/10
                      text-purple-400
                      flex items-center
                      justify-center
                      text-[8px]
                      font-black
                    "
                  >
                    2
                  </span>

                  <span
                    className="
                      text-[8px]
                      uppercase
                      tracking-widest
                      font-black
                      text-slate-600
                    "
                  >
                    Player
                  </span>

                </div>


                <select
                  value={compareTwo}
                  onChange={e =>
                    setCompareTwo(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    h-10
                    rounded-lg
                    bg-slate-950
                    border border-slate-700
                    px-2.5
                    text-xs
                    font-bold
                    text-white
                    outline-none
                    appearance-none
                    cursor-pointer
                    focus:border-purple-500
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


            {/* EMPTY */}

            {(!playerOne ||
              !playerTwo) && (

              <div
                className="
                  mt-3
                  rounded-xl
                  border border-dashed
                  border-slate-800
                  bg-slate-950/30
                  px-3
                  py-4
                  text-center
                "
              >

                <div
                  className="
                    text-lg
                    mb-1
                  "
                >
                  ⚔️
                </div>

                <div
                  className="
                    text-xs
                    font-bold
                    text-slate-400
                  "
                >
                  Select two players
                </div>

                <div
                  className="
                    text-[9px]
                    text-slate-600
                    mt-0.5
                  "
                >
                  Comparison statistics will appear here.
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
                  mt-3
                  rounded-xl
                  border border-amber-500/20
                  bg-amber-500/5
                  px-3
                  py-3
                  text-center
                "
              >

                <div
                  className="
                    text-xs
                    font-bold
                    text-amber-400
                  "
                >
                  ⚠️ Select two different players
                </div>

              </div>

            )}


            {/* COMPARISON */}

            {playerOne &&
              playerTwo &&
              playerOne.id !==
                playerTwo.id && (

              <div className="mt-3">


                {/* PLAYER HEADERS */}

                <div
                  className="
                    grid
                    grid-cols-2
                    gap-2
                    mb-2
                  "
                >

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-xl
                      bg-slate-950
                      border border-emerald-500/20
                      px-2.5
                      py-2
                      min-w-0
                    "
                  >

                    <PlayerAvatar
                      name={playerOne.name}
                    />

                    <div className="min-w-0">

                      <div
                        className="
                          text-xs
                          font-black
                          truncate
                        "
                      >
                        {playerOne.name}
                      </div>

                      <div
                        className="
                          text-[7px]
                          uppercase
                          tracking-widest
                          text-emerald-400
                        "
                      >
                        Player 1
                      </div>

                    </div>

                  </div>


                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-xl
                      bg-slate-950
                      border border-purple-500/20
                      px-2.5
                      py-2
                      min-w-0
                    "
                  >

                    <PlayerAvatar
                      name={playerTwo.name}
                      variant="purple"
                    />

                    <div className="min-w-0">

                      <div
                        className="
                          text-xs
                          font-black
                          truncate
                        "
                      >
                        {playerTwo.name}
                      </div>

                      <div
                        className="
                          text-[7px]
                          uppercase
                          tracking-widest
                          text-purple-400
                        "
                      >
                        Player 2
                      </div>

                    </div>

                  </div>

                </div>


                {/* STATS */}

                <div
                  className="
                    grid
                    grid-cols-2
                    sm:grid-cols-3
                    gap-2
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


                {/* COMPACT SUMMARY */}

                <div
                  className="
                    grid
                    grid-cols-2
                    gap-2
                    mt-2
                  "
                >

                  {/* RUNS */}

                  <div
                    className="
                      rounded-xl
                      bg-slate-950/60
                      border border-slate-800
                      px-2.5
                      py-2
                    "
                  >

                    <div
                      className="
                        text-[7px]
                        uppercase
                        tracking-widest
                        text-slate-600
                        mb-1
                      "
                    >
                      🏏 Runs
                    </div>

                    {Number(playerOne.runs || 0) ===
                    Number(playerTwo.runs || 0) ? (

                      <div
                        className="
                          text-[9px]
                          font-bold
                          text-slate-500
                        "
                      >
                        Equal
                      </div>

                    ) : (

                      <div
                        className="
                          text-[9px]
                          font-bold
                        "
                      >

                        <span className="text-slate-400">
                          {Number(playerOne.runs || 0) >
                          Number(playerTwo.runs || 0)
                            ? playerOne.name
                            : playerTwo.name}
                        </span>

                        <span className="text-slate-600">
                          {' + '}
                        </span>

                        <span className="text-emerald-400">
                          {Math.abs(
                            Number(playerOne.runs || 0) -
                            Number(playerTwo.runs || 0)
                          )}
                        </span>

                      </div>

                    )}

                  </div>


                  {/* WICKETS */}

                  <div
                    className="
                      rounded-xl
                      bg-slate-950/60
                      border border-slate-800
                      px-2.5
                      py-2
                    "
                  >

                    <div
                      className="
                        text-[7px]
                        uppercase
                        tracking-widest
                        text-slate-600
                        mb-1
                      "
                    >
                      🎯 Wickets
                    </div>

                    {Number(playerOne.wickets || 0) ===
                    Number(playerTwo.wickets || 0) ? (

                      <div
                        className="
                          text-[9px]
                          font-bold
                          text-slate-500
                        "
                      >
                        Equal
                      </div>

                    ) : (

                      <div
                        className="
                          text-[9px]
                          font-bold
                        "
                      >

                        <span className="text-slate-400">
                          {Number(playerOne.wickets || 0) >
                          Number(playerTwo.wickets || 0)
                            ? playerOne.name
                            : playerTwo.name}
                        </span>

                        <span className="text-slate-600">
                          {' + '}
                        </span>

                        <span className="text-emerald-400">
                          {Math.abs(
                            Number(playerOne.wickets || 0) -
                            Number(playerTwo.wickets || 0)
                          )}
                        </span>

                      </div>

                    )}

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
            pt-1
            pb-2
          "
        >

          <span
            className="
              inline-flex
              items-center
              gap-1.5
              px-2.5
              py-1.5
              rounded-full
              bg-slate-900
              border border-slate-800
              text-[7px]
              uppercase
              tracking-widest
              font-bold
              text-slate-600
            "
          >
            🏏 GCC • All-Time Records
          </span>

        </div>

      </div>

    </div>

  );

}
