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
   PREMIUM ANIMATION CSS
========================================================= */

const RECORDS_ANIMATION_CSS = `
  @keyframes recordsPageIn {
    0% {
      opacity: 0;
      transform: translateY(12px);
    }

    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes recordsCardIn {
    0% {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }

    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes recordsIconFloat {
    0%,
    100% {
      transform: translateY(0) rotate(0deg);
    }

    50% {
      transform: translateY(-5px) rotate(2deg);
    }
  }

  @keyframes recordsGlow {
    0%,
    100% {
      opacity: 0.25;
      transform: scale(0.95);
    }

    50% {
      opacity: 0.55;
      transform: scale(1.05);
    }
  }

  @keyframes recordsAttention {
    0%,
    100% {
      transform: translateY(0);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }

    20% {
      transform: translateY(-2px);
      box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.08);
    }

    40% {
      transform: translateY(0);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  @keyframes recordsRankPulse {
    0%,
    100% {
      transform: scale(1);
    }

    50% {
      transform: scale(1.035);
    }
  }

  @keyframes recordsLineShine {
    0% {
      transform: translateX(-120%);
      opacity: 0;
    }

    25% {
      opacity: 1;
    }

    75% {
      opacity: 1;
    }

    100% {
      transform: translateX(120%);
      opacity: 0;
    }
  }

  .records-page {
    animation: recordsPageIn 0.45s ease-out both;
  }

  .records-card {
    animation: recordsCardIn 0.42s ease-out both;
  }

  .records-float {
    animation: recordsIconFloat 2.8s ease-in-out infinite;
  }

  .records-glow {
    animation: recordsGlow 3s ease-in-out infinite;
  }

  .records-attention {
    animation: recordsAttention 2.8s ease-in-out 0.8s 3;
  }

  .records-rank-pulse {
    animation: recordsRankPulse 2.6s ease-in-out infinite;
  }

  .records-shine {
    animation: recordsLineShine 1.2s ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .records-page,
    .records-card,
    .records-float,
    .records-glow,
    .records-attention,
    .records-rank-pulse,
    .records-shine {
      animation: none !important;
    }

    .records-transition {
      transition: none !important;
    }
  }
`;


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
          records-rank-pulse
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
        transition-all
        duration-300
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
          records-card
          rounded-2xl
          border border-slate-800
          bg-slate-900/60
          p-4
          transition-all
          duration-300
          hover:-translate-y-1
          hover:border-slate-700
          hover:bg-slate-900
          active:scale-[0.985]
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              records-float
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
        records-card
        group
        relative
        overflow-hidden
        rounded-2xl
        border border-slate-800
        bg-slate-900/80
        shadow-lg
        shadow-black/10
        transition-all
        duration-300
        hover:-translate-y-1
        hover:border-slate-700
        hover:bg-slate-900
        hover:shadow-2xl
        hover:shadow-black/20
        active:scale-[0.985]
      "
    >

      {/* HOVER SHINE */}

      <div
        className="
          pointer-events-none
          absolute
          inset-x-0
          top-0
          h-px
          overflow-hidden
          opacity-0
          transition-opacity
          duration-300
          group-hover:opacity-100
        "
      >

        <div
          className="
            h-full
            w-1/3
            bg-gradient-to-r
            from-transparent
            via-emerald-400/60
            to-transparent
            translate-x-[-150%]
            transition-transform
            duration-700
            group-hover:translate-x-[450%]
          "
        />

      </div>


      {/* CARD HEADER */}

      <div
        className="
          px-4 py-4
          border-b border-slate-800
          bg-slate-900/80
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
                transition-transform
                duration-300
                group-hover:scale-110
                group-hover:-rotate-2
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
              transition-all
              duration-300
              group-hover:border-emerald-500/20
              group-hover:text-emerald-400
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
                  group/player
                  flex items-center
                  gap-3
                  px-2
                  py-3
                  rounded-xl
                  transition-all
                  duration-300
                  hover:bg-slate-800/70
                  hover:translate-x-0.5
                  active:scale-[0.99]
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

                  <div className="font-bold text-sm truncate transition-colors duration-300 group-hover/player:text-white">
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
                      transition-transform
                      duration-300
                      group-hover/player:scale-105
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
          transition-all
          duration-500
          group-hover:scale-110
          group-hover:opacity-[0.045]
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
          records-card
          rounded-2xl
          border border-slate-800
          bg-slate-900/70
          p-5
          transition-all
          duration-300
          hover:-translate-y-1
          hover:border-slate-700
          active:scale-[0.985]
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              records-float
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
        records-card
        group
        relative
        overflow-hidden
        rounded-3xl
        border border-slate-800
        bg-gradient-to-br
        from-slate-900
        via-slate-900
        to-slate-800
        shadow-xl
        shadow-black/15
        transition-all
        duration-300
        hover:-translate-y-1
        hover:border-emerald-500/20
        hover:shadow-2xl
        hover:shadow-emerald-950/10
        active:scale-[0.985]
      "
    >

      {/* PREMIUM LIGHT */}

      <div
        className="
          pointer-events-none
          absolute
          -top-24
          -right-24
          h-48
          w-48
          rounded-full
          bg-emerald-500/10
          blur-3xl
          opacity-30
          transition-all
          duration-500
          group-hover:opacity-60
          group-hover:scale-125
        "
      />


      {/* TOP */}

      <div className="relative p-5 sm:p-6">

        <div className="flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">

            <div
              className="
                records-float
                w-11 h-11
                rounded-2xl
                bg-emerald-500/10
                border border-emerald-500/20
                flex items-center
                justify-center
                text-2xl
                shrink-0
                transition-transform
                duration-300
                group-hover:scale-110
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
              transition-all
              duration-300
              group-hover:scale-110
              group-hover:rotate-3
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
              transition-transform
              duration-300
              group-hover:translate-x-1
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
          transition-all
          duration-300
          group-hover:border-slate-700
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
                    transition-all
                    duration-300
                    hover:border-slate-700
                    hover:bg-slate-950/80
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
          transition-all
          duration-500
          group-hover:scale-110
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
        group
        rounded-2xl
        border
        p-4
        transition-all
        duration-300
        hover:-translate-y-0.5
        active:scale-[0.985]
        ${
          leader
            ? 'border-slate-700 bg-slate-900/80 hover:border-emerald-500/20'
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
        }
      `}
    >

      {/* TITLE */}

      <div className="flex items-center justify-center gap-2 mb-4">

        <span
          className="
            text-base
            transition-transform
            duration-300
            group-hover:scale-110
          "
        >
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
            transition-all
            duration-300
            ${
              leader === 'one'
                ? `
                  border-emerald-500/30
                  bg-emerald-500/10
                  shadow-lg
                  shadow-emerald-950/10
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
              transition-transform
              duration-300
              group-hover:scale-105
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
            transition-all
            duration-300
            ${
              leader === 'two'
                ? `
                  border-emerald-500/30
                  bg-emerald-500/10
                  shadow-lg
                  shadow-emerald-950/10
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
              transition-transform
              duration-300
              group-hover:scale-105
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
          records-float
          w-10 h-10
          rounded-xl
          bg-slate-900
          border border-slate-800
          flex items-center
          justify-center
          text-xl
          shrink-0
          transition-all
          duration-300
          hover:border-emerald-500/20
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

      <>
        <style>
          {RECORDS_ANIMATION_CSS}
        </style>

        <div className="records-page space-y-4">

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
      </>

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

      <>
        <style>
          {RECORDS_ANIMATION_CSS}
        </style>

        <div
          className="
            records-page
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
      </>

    );

  }


  /* =======================================================
     EMPTY
  ======================================================= */

  if (!records) {

    return (

      <>
        <style>
          {RECORDS_ANIMATION_CSS}
        </style>

        <div
          className="
            records-page
            group
            relative
            overflow-hidden
            rounded-3xl
            border
            border-dashed
            border-slate-700
            bg-slate-900/60
            p-8
            text-center
          "
        >

          <div
            className="
              records-glow
              pointer-events-none
              absolute
              left-1/2
              top-1/2
              h-32
              w-32
              -translate-x-1/2
              -translate-y-1/2
              rounded-full
              bg-emerald-500/10
              blur-3xl
            "
          />


          <div
            className="
              records-float
              relative
              mx-auto
              flex
              h-16
              w-16
              items-center
              justify-center
              rounded-2xl
              border
              border-emerald-500/15
              bg-emerald-500/5
              text-4xl
            "
          >
            📜
          </div>


          <div className="relative mt-4 font-black text-white">
            No GCC records available
          </div>


          <div className="relative mt-1 text-xs text-slate-500">
            Records will appear here once matches are completed.
          </div>

        </div>
      </>

    );

  }


  /* =======================================================
     PAGE
  ======================================================= */

  return (

    <div className="records-page">

      <style>
        {RECORDS_ANIMATION_CSS}
      </style>


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
                records-float
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
                shadow-emerald-950/10
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
              group/compare
              relative
              rounded-3xl
              border border-slate-800
              bg-gradient-to-br
              from-slate-900
              to-slate-800/70
              overflow-hidden
              shadow-xl
              transition-all
              duration-300
              hover:border-slate-700
              hover:shadow-2xl
              active:scale-[0.995]
            "
          >

            {/* COMPARE GLOW */}

            <div
              className="
                pointer-events-none
                absolute
                -right-20
                -top-20
                h-56
                w-56
                rounded-full
                bg-emerald-500/5
                blur-3xl
                transition-all
                duration-500
                group-hover/compare:bg-emerald-500/10
              "
            />


            {/* COMPARE HEADER */}

            <div
              className="
                relative
                p-5
                sm:p-6
                border-b border-slate-800
              "
            >

              <div className="flex items-center gap-3">

                <div
                  className="
                    records-float
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

            <div className="relative p-5 sm:p-6">

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
                      transition-all
                      duration-200
                      focus:border-emerald-500
                      focus:ring-2
                      focus:ring-emerald-500/10
                      hover:border-slate-600
                      active:scale-[0.995]
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
                      transition-all
                      duration-200
                      focus:border-purple-500
                      focus:ring-2
                      focus:ring-purple-500/10
                      hover:border-slate-600
                      active:scale-[0.995]
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
                    records-card
                    relative
                    mt-4
                    overflow-hidden
                    rounded-2xl
                    border border-dashed
                    border-slate-700
                    bg-slate-950/30
                    p-6
                    text-center
                    transition-all
                    duration-300
                    hover:border-emerald-500/20
                  "
                >

                  <div
                    className="
                      records-glow
                      pointer-events-none
                      absolute
                      left-1/2
                      top-1/2
                      h-24
                      w-24
                      -translate-x-1/2
                      -translate-y-1/2
                      rounded-full
                      bg-emerald-500/10
                      blur-3xl
                    "
                  />


                  <div
                    className="
                      records-float
                      relative
                      text-3xl
                      mb-2
                    "
                  >
                    ⚔️
                  </div>

                  <div className="relative text-sm font-bold text-slate-300">
                    Choose two players
                  </div>

                  <div className="relative text-xs text-slate-500 mt-1">
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
                    transition-all
                    duration-300
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
                        group/player1
                        rounded-2xl
                        bg-slate-950
                        border border-emerald-500/20
                        p-4
                        text-center
                        min-w-0
                        transition-all
                        duration-300
                        hover:-translate-y-1
                        hover:border-emerald-500/40
                        active:scale-[0.985]
                      "
                    >

                      <div className="flex justify-center">

                        <PlayerAvatar
                          name={playerOne.name}
                          size="large"
                        />

                      </div>

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
                        group/player2
                        rounded-2xl
                        bg-slate-950
                        border border-purple-500/20
                        p-4
                        text-center
                        min-w-0
                        transition-all
                        duration-300
                        hover:-translate-y-1
                        hover:border-purple-500/40
                        active:scale-[0.985]
                      "
                    >

                      <div className="flex justify-center">

                        <PlayerAvatar
                          name={playerTwo.name}
                          variant="purple"
                          size="large"
                        />

                      </div>

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
                      transition-all
                      duration-300
                      hover:border-emerald-500/25
                      hover:bg-emerald-500/[0.06]
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
                transition-all
                duration-300
                hover:border-emerald-500/20
                hover:text-slate-400
              "
            >
              🏏 GCC • All-Time Records
            </div>

          </div>

        </div>

      </div>

    </div>

  );

}
