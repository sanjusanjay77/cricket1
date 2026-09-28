import {
  useEffect,
  useState,
  useCallback,
  memo,
  useMemo,
} from 'react';

import { Link } from 'react-router-dom';

import {
  Matches,
  getApiErrorMessage,
} from '../api/api.js';

import socket from '../socket.js';

import {
  exportMatchPdf,
} from '../utils/exportPdf.js';


const MATCHES_CACHE_KEY =
  'gcc_matches_cache_v1';

const HOME_INTRO_KEY =
  'gcc_home_intro_seen_v1';


/* =========================================================
   STATUS BADGES
========================================================= */

const statusBadge = {
  upcoming:
    'bg-amber-500/10 text-amber-400 border border-amber-500/20',

  live:
    'bg-red-500/10 text-red-400 border border-red-500/20',

  'innings-break':
    'bg-orange-500/10 text-orange-400 border border-orange-500/20',

  completed:
    'bg-slate-500/10 text-slate-400 border border-slate-600/30',
};


/* =========================================================
   ERROR HELPER
========================================================= */

function showDeleteError(error) {

  console.error(
    '❌ Delete match failed:',
    error
  );


  const message =
    getApiErrorMessage?.(error) ||
    error?.response?.data?.error ||
    error?.message ||
    'Unable to delete this match.';


  alert(
    `Delete failed:\n\n${message}`
  );

}


/* =========================================================
   CACHE
========================================================= */

function readMatchesCache() {

  try {

    const cached =
      localStorage.getItem(
        MATCHES_CACHE_KEY
      );


    if (!cached) {
      return [];
    }


    const parsed =
      JSON.parse(cached);


    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {

    console.warn(
      'Failed to read matches cache:',
      error
    );


    return [];

  }

}


function writeMatchesCache(matches) {

  try {

    localStorage.setItem(
      MATCHES_CACHE_KEY,
      JSON.stringify(matches)
    );

  } catch (error) {

    console.warn(
      'Failed to save matches cache:',
      error
    );

  }

}


/* =========================================================
   WELCOME INTRO
========================================================= */

function HomeIntro({
  onFinished,
}) {

  useEffect(() => {

    const timer =
      window.setTimeout(() => {

        try {

          sessionStorage.setItem(
            HOME_INTRO_KEY,
            '1'
          );

        } catch (error) {

          console.warn(
            'Unable to save intro state:',
            error
          );

        }


        onFinished();

      }, 700);


    return () => {

      window.clearTimeout(
        timer
      );

    };

  }, [onFinished]);


  return (

    <div
      className="
        home-intro
        fixed
        inset-0
        z-[9999]
        flex
        items-center
        justify-center
        overflow-hidden
        bg-slate-950
        px-5
      "
    >

      {/* =================================================
          BACKGROUND
      ================================================= */}

      <div className="home-intro-bg">

        <div className="home-orb home-orb-one" />

        <div className="home-orb home-orb-two" />

        <div className="home-orb home-orb-three" />

      </div>


      {/* =================================================
          CONTENT
      ================================================= */}

      <div
        className="
          relative
          flex
          w-full
          max-w-sm
          flex-col
          items-center
          text-center
        "
      >

        <div
          className="
            home-logo-animation
            flex
            h-20
            w-20
            items-center
            justify-center
            rounded-[24px]
            border
            border-emerald-400/20
            bg-emerald-500/10
            text-4xl
            shadow-2xl
            shadow-emerald-950/40
          "
        >
          🏏
        </div>


        <div
          className="
            home-intro-label
            mt-5
            text-[9px]
            font-black
            uppercase
            tracking-[0.35em]
            text-emerald-400
          "
        >
          GCC Cricket
        </div>


        <h1
          className="
            home-intro-title
            mt-2
            text-3xl
            font-black
            tracking-tight
            text-white
          "
        >
          Live Scoreboard
        </h1>


        <p
          className="
            home-intro-subtitle
            mt-2
            text-[11px]
            font-medium
            text-slate-500
          "
        >
          Your matches. Your records.
        </p>


        <div
          className="
            home-loading-line
            mt-6
            h-1
            w-28
            overflow-hidden
            rounded-full
            bg-slate-800
          "
        >

          <div className="home-loading-progress" />

        </div>

      </div>


      <style>{`

        .home-intro {
          animation:
            homeIntroExit
            0.35s
            ease-out
            0.42s
            forwards;
        }


        .home-intro-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }


        .home-orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(60px);
          opacity: 0.18;
          will-change: transform;
        }


        .home-orb-one {
          width: 220px;
          height: 220px;
          left: 15%;
          top: 25%;
          background: rgba(16,185,129,0.35);
          animation:
            homeOrbOne
            4s
            ease-in-out
            infinite;
        }


        .home-orb-two {
          width: 180px;
          height: 180px;
          right: 10%;
          bottom: 20%;
          background: rgba(20,184,166,0.25);
          animation:
            homeOrbTwo
            5s
            ease-in-out
            infinite;
        }


        .home-orb-three {
          width: 140px;
          height: 140px;
          left: 45%;
          top: 55%;
          background: rgba(59,130,246,0.12);
          animation:
            homeOrbThree
            4.5s
            ease-in-out
            infinite;
        }


        .home-logo-animation {
          animation:
            homeLogoIn
            0.55s
            cubic-bezier(.2,.8,.2,1)
            both;
        }


        .home-intro-label {
          animation:
            homeTextIn
            0.45s
            ease-out
            0.08s
            both;
        }


        .home-intro-title {
          animation:
            homeTextIn
            0.45s
            ease-out
            0.14s
            both;
        }


        .home-intro-subtitle {
          animation:
            homeTextIn
            0.45s
            ease-out
            0.2s
            both;
        }


        .home-loading-line {
          animation:
            homeTextIn
            0.4s
            ease-out
            0.25s
            both;
        }


        .home-loading-progress {
          height: 100%;
          width: 45%;
          border-radius: 9999px;
          background: rgb(16,185,129);
          animation:
            homeProgress
            0.65s
            ease-in-out
            infinite;
        }


        @keyframes homeLogoIn {

          0% {
            opacity: 0;
            transform:
              translateY(20px)
              scale(0.7)
              rotate(-10deg);
          }

          70% {
            opacity: 1;
            transform:
              translateY(-3px)
              scale(1.04)
              rotate(2deg);
          }

          100% {
            opacity: 1;
            transform:
              translateY(0)
              scale(1)
              rotate(0);
          }

        }


        @keyframes homeTextIn {

          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }

        }


        @keyframes homeProgress {

          0% {
            transform: translateX(-130%);
          }

          100% {
            transform: translateX(270%);
          }

        }


        @keyframes homeOrbOne {

          0%,
          100% {
            transform: translate3d(0,0,0) scale(1);
          }

          50% {
            transform: translate3d(20px,-15px,0) scale(1.08);
          }

        }


        @keyframes homeOrbTwo {

          0%,
          100% {
            transform: translate3d(0,0,0);
          }

          50% {
            transform: translate3d(-18px,15px,0);
          }

        }


        @keyframes homeOrbThree {

          0%,
          100% {
            transform: scale(0.9);
          }

          50% {
            transform: scale(1.1);
          }

        }


        @keyframes homeIntroExit {

          from {
            opacity: 1;
          }

          to {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
          }

        }


        @media (
          prefers-reduced-motion: reduce
        ) {

          .home-intro,
          .home-logo-animation,
          .home-intro-label,
          .home-intro-title,
          .home-intro-subtitle,
          .home-loading-line,
          .home-loading-progress,
          .home-orb {
            animation: none !important;
          }

        }

      `}</style>

    </div>

  );

}


/* =========================================================
   LOADING SKELETON
========================================================= */

function MatchSkeleton({
  index = 0,
}) {

  return (

    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-slate-800
        bg-slate-900/70
        p-3
        animate-pulse
      "
      style={{
        animationDelay:
          `${index * 50}ms`,
      }}
    >

      <div className="flex items-center justify-between gap-3">

        <div className="flex items-center gap-2 min-w-0">

          <div className="h-4 w-14 rounded bg-slate-800" />

          <div className="h-2 w-5 rounded bg-slate-800" />

          <div className="h-4 w-14 rounded bg-slate-800" />

        </div>


        <div className="h-5 w-16 rounded-full bg-slate-800" />

      </div>


      <div className="mt-4 h-7 w-28 rounded bg-slate-800" />

      <div className="mt-2 h-3 w-20 rounded bg-slate-800" />


      <div className="mt-4 h-px bg-slate-800" />


      <div className="mt-2 grid grid-cols-2 gap-2">

        <div className="h-9 rounded-lg bg-slate-800" />

        <div className="h-9 rounded-lg bg-slate-800" />

      </div>

    </div>

  );

}


/* =========================================================
   LOADING
========================================================= */

function HomeLoading() {

  return (

    <div
      className="
        mx-auto
        w-full
        max-w-3xl
        overflow-hidden
        pb-6
      "
    >

      <div className="mb-5 flex items-center justify-between gap-3">

        <div className="min-w-0">

          <div className="h-6 w-24 rounded-lg bg-slate-800 animate-pulse" />

          <div className="mt-2 h-3 w-36 rounded bg-slate-900 animate-pulse" />

        </div>


        <div className="h-9 w-28 rounded-lg bg-slate-800 animate-pulse" />

      </div>


      <div className="mb-4">

        <div className="mb-2 h-3 w-20 rounded bg-slate-800 animate-pulse" />

        <div className="h-48 rounded-2xl bg-slate-900 animate-pulse" />

      </div>


      <div className="mb-2 h-3 w-24 rounded bg-slate-800 animate-pulse" />


      <div className="grid gap-2">

        {[0, 1, 2].map(
          (index) => (

            <MatchSkeleton
              key={index}
              index={index}
            />

          )
        )}

      </div>

    </div>

  );

}


/* =========================================================
   SCORE FLASH
========================================================= */

function useScoreFlash(
  innings
) {

  const [flash, setFlash] =
    useState(false);


  useEffect(() => {

    if (!innings) {
      return undefined;
    }


    setFlash(true);


    const timer =
      window.setTimeout(() => {

        setFlash(false);

      }, 450);


    return () => {

      window.clearTimeout(
        timer
      );

    };

  }, [
    innings?.innings?.total_runs,
    innings?.innings?.total_wickets,
    innings?.overs,
  ]);


  return flash;

}


/* =========================================================
   LIVE MATCH CARD
========================================================= */

const LiveHero = memo(function LiveHero({
  match,
  onDeleted,
}) {

  const [data, setData] =
    useState(() => ({

      match,

      innings:
        Array.isArray(match?.innings)
          ? match.innings
          : [],

      players:
        Array.isArray(match?.players)
          ? match.players
          : [],

    }));


  const [deleting, setDeleting] =
    useState(false);


  const currentInnings =
    data?.innings?.[
      data.innings.length - 1
    ];


  const scoreFlash =
    useScoreFlash(
      currentInnings
    );


  /* =======================================================
     SYNC PROPS
  ======================================================= */

  useEffect(() => {

    setData({

      match,

      innings:
        Array.isArray(match?.innings)
          ? match.innings
          : [],

      players:
        Array.isArray(match?.players)
          ? match.players
          : [],

    });

  }, [match]);


  /* =======================================================
     SOCKET
  ======================================================= */

  useEffect(() => {

    if (!match?.id) {
      return undefined;
    }


    socket.emit(
      'join-match',
      match.id
    );


    const onUpdate = ({
      match: updatedMatch,
      innings,
    }) => {

      if (
        updatedMatch?.id &&
        String(updatedMatch.id) !==
          String(match.id)
      ) {
        return;
      }


      setData(
        current => ({

          ...current,

          match:
            updatedMatch ||
            current.match,

          innings:
            Array.isArray(innings)
              ? innings
              : current.innings,

        })
      );

    };


    socket.on(
      'score-update',
      onUpdate
    );


    return () => {

      socket.emit(
        'leave-match',
        match.id
      );


      socket.off(
        'score-update',
        onUpdate
      );

    };

  }, [match?.id]);


  if (!data?.match) {
    return null;
  }


  const currentMatch =
    data.match;


  const innings =
    data.innings?.[
      data.innings.length - 1
    ];


  const battingTeam =
    innings?.innings?.batting_team_id ===
    currentMatch.team1_id

      ? currentMatch.team1_name

      : innings?.innings?.batting_team_id ===
          currentMatch.team2_id

        ? currentMatch.team2_name

        : null;


  const battingShort =
    innings?.innings?.batting_team_id ===
    currentMatch.team1_id

      ? (
          innings?.innings?.batting_team_short ||
          currentMatch.team1_short ||
          currentMatch.team1_name ||
          ''
        )

      : innings?.innings?.batting_team_id ===
          currentMatch.team2_id

        ? (
            innings?.innings?.batting_team_short ||
            currentMatch.team2_short ||
            currentMatch.team2_name ||
            ''
          )

        : null;


  /* =======================================================
     PDF
  ======================================================= */

  const downloadPdf = async () => {

    try {

      const detail =
        await Matches.get(
          currentMatch.id
        );


      await exportMatchPdf({

        match:
          detail.match,

        innings:
          detail.innings || [],

        players:
          detail.players || [],

      });

    } catch (error) {

      console.error(
        'PDF export failed:',
        error
      );


      alert(
        'Unable to create PDF. Please try again.'
      );

    }

  };


  /* =======================================================
     DELETE
  ======================================================= */

  const deleteMatch = async () => {

    if (deleting) {
      return;
    }


    const ok =
      window.confirm(
        'Delete this match permanently?\n\n' +
        'This will delete the match, innings, balls and full scorecard.\n\n' +
        'This action cannot be undone.'
      );


    if (!ok) {
      return;
    }


    setDeleting(true);


    try {

      await Matches.remove(
        currentMatch.id
      );


      if (onDeleted) {

        onDeleted(
          currentMatch.id
        );

      }

    } catch (error) {

      showDeleteError(
        error
      );


      setDeleting(false);

    }

  };


  return (

    <div
      className="
        live-card
        group
        mb-4
        overflow-hidden
        rounded-2xl
        border
        border-red-500/20
        bg-slate-900
        shadow-lg
        shadow-black/20
      "
    >

      {/* =================================================
          LIVE HEADER
      ================================================= */}

      <Link
        to={`/match/${currentMatch.id}/live`}
        state={{
          match: currentMatch,
        }}
        className="
          block
          active:bg-slate-800/30
        "
      >

        <div
          className="
            flex
            items-center
            justify-between
            border-b
            border-slate-800
            px-3
            py-2.5
          "
        >

          <div className="flex items-center gap-2">

            <span className="relative flex h-2.5 w-2.5">

              <span
                className="
                  absolute
                  h-full
                  w-full
                  animate-ping
                  rounded-full
                  bg-red-400
                  opacity-60
                "
              />

              <span
                className="
                  relative
                  h-2.5
                  w-2.5
                  rounded-full
                  bg-red-500
                "
              />

            </span>


            <span
              className="
                text-[10px]
                font-black
                uppercase
                tracking-[0.18em]
                text-red-400
              "
            >
              Live Now
            </span>

          </div>


          <div
            className="
              rounded-full
              bg-slate-800
              px-2
              py-0.5
              text-[9px]
              font-semibold
              text-slate-500
            "
          >
            {currentMatch.overs_limit} overs
          </div>

        </div>


        {/* =================================================
            TEAMS
        ================================================= */}

        <div className="px-3 pt-4">

          <div
            className="
              flex
              items-center
              justify-center
              gap-3
            "
          >

            <div className="min-w-0 flex-1 text-right">

              <div
                className="
                  truncate
                  text-base
                  font-black
                  text-white
                "
              >
                {currentMatch.team1_short}
              </div>

            </div>


            <div
              className="
                flex
                h-6
                w-6
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-slate-800
                bg-slate-950
                text-[8px]
                font-black
                text-slate-600
              "
            >
              VS
            </div>


            <div className="min-w-0 flex-1 text-left">

              <div
                className="
                  truncate
                  text-base
                  font-black
                  text-white
                "
              >
                {currentMatch.team2_short}
              </div>

            </div>

          </div>

        </div>


        {/* =================================================
            SCORE
        ================================================= */}

        <div className="px-3 pb-4 pt-3 text-center">

          {innings ? (

            <>

              <div
                className="
                  mb-1
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.16em]
                  text-slate-600
                "
              >
                {battingShort} batting
              </div>


              <div
                className={`
                  inline-block
                  rounded-2xl
                  px-3
                  py-1
                  transition-transform
                  duration-200
                  ${
                    scoreFlash
                      ? 'score-pop bg-red-500/10'
                      : ''
                  }
                `}
              >

                <div
                  className={`
                    text-[42px]
                    font-black
                    leading-none
                    tracking-tight
                    transition-colors
                    duration-200
                    ${
                      scoreFlash
                        ? 'text-red-300'
                        : 'text-white'
                    }
                  `}
                >

                  {innings.innings.total_runs}

                  <span className="text-slate-500">
                    /{innings.innings.total_wickets}
                  </span>

                </div>

              </div>


              <div
                className="
                  mt-2
                  text-[11px]
                  font-medium
                  text-slate-500
                "
              >

                {innings.overs}

                <span className="mx-1.5 text-slate-700">
                  •
                </span>

                RR {innings.runRate}


                {innings.innings.target && (

                  <>

                    <span className="mx-1.5 text-slate-700">
                      •
                    </span>

                    Target {innings.innings.target}

                  </>

                )}

              </div>

            </>

          ) : (

            <div className="py-4 text-[11px] text-slate-500">
              Live match
            </div>

          )}

        </div>


        {battingTeam && (

          <div className="px-3 pb-4 text-center">

            <span
              className="
                inline-flex
                max-w-full
                items-center
                rounded-full
                border
                border-slate-800
                bg-slate-950
                px-3
                py-1
                text-[9px]
                font-semibold
                text-slate-500
              "
            >

              <span className="mr-1 text-emerald-500">
                ●
              </span>

              <span className="truncate">
                {battingTeam}
              </span>

            </span>

          </div>

        )}

      </Link>


      {/* =================================================
          ACTIONS
      ================================================= */}

      <div
        className="
          grid
          grid-cols-3
          gap-1.5
          border-t
          border-slate-800
          bg-slate-950/40
          p-2
        "
      >

        <Link
          to={`/match/${currentMatch.id}/live`}
          state={{
            match: currentMatch,
          }}
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
          "
        >
          👁 View
        </Link>


        <button
          type="button"
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            disabled:opacity-50
          "
          onClick={downloadPdf}
          disabled={deleting}
        >
          📄 PDF
        </button>


        <button
          type="button"
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-red-500/10
            text-[11px]
            font-bold
            text-red-400
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting
            ? 'Deleting...'
            : '🗑 Delete'}
        </button>

      </div>

    </div>

  );

});


/* =========================================================
   NORMAL MATCH CARD
========================================================= */

const MatchCard = memo(function MatchCard({
  match,
  onDelete,
  onDownload,
  deletingId,
  index = 0,
}) {

  const statusText =
    match.status === 'innings-break'
      ? 'Innings Break'
      : match.status;


  const isDeleting =
    deletingId === match.id;


  return (

    <div
      className="
        match-card
        group
        overflow-hidden
        rounded-2xl
        border
        border-slate-800
        bg-slate-900/70
        shadow-sm
        shadow-black/10
        animate-[homeCardIn_0.38s_ease-out_both]
      "
      style={{
        animationDelay:
          `${Math.min(index, 8) * 40}ms`,
      }}
    >

      <div className="px-3 py-3.5">

        {/* =================================================
            TOP ROW
        ================================================= */}

        <div className="flex items-center justify-between gap-2">

          <div
            className="
              flex
              min-w-0
              items-center
              gap-2
            "
          >

            <span className="truncate text-sm font-black text-white">
              {match.team1_short}
            </span>


            <span
              className="
                shrink-0
                text-[8px]
                font-black
                text-slate-700
              "
            >
              VS
            </span>


            <span className="truncate text-sm font-black text-white">
              {match.team2_short}
            </span>

          </div>


          <span
            className={`
              shrink-0
              rounded-full
              px-2
              py-1
              text-[8px]
              font-black
              uppercase
              tracking-wide
              ${
                statusBadge[match.status] ||
                statusBadge.completed
              }
            `}
          >
            {statusText}
          </span>

        </div>


        {/* =================================================
            INFO
        ================================================= */}

        <div
          className="
            mt-1.5
            flex
            items-center
            gap-2
            text-[10px]
            text-slate-600
          "
        >

          <span>
            {match.overs_limit} overs
          </span>

          <span className="text-slate-800">
            •
          </span>

          <span>
            Match #{match.id}
          </span>

        </div>


        {/* =================================================
            RESULT
        ================================================= */}

        {match.result_text && (

          <div
            className="
              mt-3
              flex
              min-w-0
              items-center
              gap-2
              rounded-xl
              border
              border-emerald-500/10
              bg-emerald-500/5
              px-3
              py-2
            "
          >

            <span className="shrink-0 text-sm">
              🏆
            </span>


            <span
              className="
                truncate
                text-[11px]
                font-semibold
                text-emerald-400
              "
            >
              {match.result_text}
            </span>

          </div>

        )}

      </div>


      {/* =================================================
          BUTTONS
      ================================================= */}

      <div
        className="
          grid
          grid-cols-2
          gap-1.5
          border-t
          border-slate-800
          bg-slate-950/30
          p-2
        "
      >

        {match.status === 'upcoming' && (

          <Link
            to={`/match/${match.id}/setup`}
            className="
              home-action
              flex
              min-h-[40px]
              items-center
              justify-center
              rounded-xl
              bg-slate-800
              text-[11px]
              font-bold
              text-slate-300
            "
          >
            🏏 Start Toss
          </Link>

        )}


        {match.status === 'innings-break' && (

          <Link
            to={`/match/${match.id}/score`}
            className="
              home-action
              flex
              min-h-[40px]
              items-center
              justify-center
              rounded-xl
              bg-slate-800
              text-[11px]
              font-bold
              text-slate-300
            "
          >
            ▶ Continue
          </Link>

        )}


        <Link
          to={`/match/${match.id}/live`}
          state={{
            match,
          }}
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
          "
        >
          👁 View
        </Link>


        <button
          type="button"
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            disabled:opacity-50
          "
          onClick={() =>
            onDownload(match.id)
          }
          disabled={isDeleting}
        >
          📄 PDF
        </button>


        <button
          type="button"
          className="
            home-action
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-red-500/10
            text-[11px]
            font-bold
            text-red-400
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
          onClick={() =>
            onDelete(match.id)
          }
          disabled={isDeleting}
        >
          {isDeleting
            ? 'Deleting...'
            : '🗑 Delete'}
        </button>

      </div>

    </div>

  );

});


/* =========================================================
   HOME
========================================================= */

export default function Home() {

  /* =======================================================
     INTRO
  ======================================================= */

  const [showIntro, setShowIntro] =
    useState(() => {

      try {

        return (
          sessionStorage.getItem(
            HOME_INTRO_KEY
          ) !== '1'
        );

      } catch (error) {

        return false;

      }

    });


  const finishIntro =
    useCallback(() => {

      setShowIntro(false);

    }, []);


  /* =======================================================
     CACHE
  ======================================================= */

  const [matches, setMatches] =
    useState(() =>
      readMatchesCache()
    );


  const [loading, setLoading] =
    useState(() => {

      const cached =
        readMatchesCache();

      return cached.length === 0;

    });


  const [deletingId, setDeletingId] =
    useState(null);


  /* =======================================================
     LOAD MATCHES
  ======================================================= */

  const loadMatches =
    useCallback(async () => {

      try {

        const data =
          await Matches.list();


        const matchList =
          Array.isArray(data)
            ? data
            : [];


        /*
         * Only fetch detailed information
         * for live matches.
         */

        const liveMatches =
          matchList.filter(
            match =>
              match?.status === 'live'
          );


        if (
          liveMatches.length === 0
        ) {

          setMatches(
            matchList
          );


          writeMatchesCache(
            matchList
          );


          return;

        }


        /*
         * Fetch live match details
         * in parallel.
         */

        const liveDetails =
          await Promise.all(
            liveMatches.map(
              async match => {

                try {

                  const detail =
                    await Matches.get(
                      match.id
                    );


                  const detailedMatch =
                    detail?.match ||
                    detail ||
                    {};


                  const detailedInnings =
                    Array.isArray(
                      detail?.innings
                    )
                      ? detail.innings
                      : Array.isArray(
                          detailedMatch?.innings
                        )
                        ? detailedMatch.innings
                        : [];


                  const detailedPlayers =
                    Array.isArray(
                      detail?.players
                    )
                      ? detail.players
                      : Array.isArray(
                          detailedMatch?.players
                        )
                        ? detailedMatch.players
                        : [];


                  return {

                    ...match,

                    ...detailedMatch,

                    id:
                      match.id,

                    status:
                      match.status,

                    innings:
                      detailedInnings,

                    players:
                      detailedPlayers,

                  };

                } catch (error) {

                  console.error(
                    `Failed to load live match details for ${match.id}:`,
                    error
                  );


                  return match;

                }

              }
            )
          );


        const liveDetailMap =
          new Map(
            liveDetails.map(
              match => [
                match.id,
                match,
              ]
            )
          );


        const enrichedMatches =
          matchList.map(
            match =>
              match?.status === 'live'
                ? (
                    liveDetailMap.get(
                      match.id
                    ) || match
                  )
                : match
          );


        setMatches(
          enrichedMatches
        );


        writeMatchesCache(
          enrichedMatches
        );

      } catch (error) {

        console.error(
          'Failed to load matches:',
          error
        );


        /*
         * Cached matches remain visible.
         */

        setMatches(
          current =>
            current.length > 0
              ? current
              : []
        );

      } finally {

        setLoading(
          false
        );

      }

    }, []);


  /* =======================================================
     LOAD ON MOUNT
  ======================================================= */

  useEffect(() => {

    loadMatches();

  }, [loadMatches]);


  /* =======================================================
     DELETE
  ======================================================= */

  const deleteMatch =
    useCallback(
      async matchId => {

        if (!matchId) {

          alert(
            'Invalid match ID.'
          );

          return;

        }


        if (deletingId) {
          return;
        }


        const ok =
          window.confirm(
            'Delete this match permanently?\n\n' +
            'This will delete the match, innings, balls and full scorecard.\n\n' +
            'This action cannot be undone.'
          );


        if (!ok) {
          return;
        }


        setDeletingId(
          matchId
        );


        try {

          await Matches.remove(
            matchId
          );


          /*
           * Remove immediately.
           */

          setMatches(
            current => {

              const next =
                current.filter(
                  match =>
                    match.id !==
                    matchId
                );


              writeMatchesCache(
                next
              );


              return next;

            }
          );


          /*
           * Refresh in background.
           */

          try {

            const latest =
              await Matches.list();


            const latestMatches =
              Array.isArray(latest)
                ? latest
                : [];


            setMatches(
              latestMatches
            );


            writeMatchesCache(
              latestMatches
            );

          } catch (reloadError) {

            console.warn(
              'Match deleted but refresh failed:',
              reloadError
            );

          }

        } catch (error) {

          showDeleteError(
            error
          );

        } finally {

          setDeletingId(
            null
          );

        }

      },
      [deletingId]
    );


  /* =======================================================
     PDF
  ======================================================= */

  const downloadPdf =
    useCallback(
      async matchId => {

        try {

          const detail =
            await Matches.get(
              matchId
            );


          await exportMatchPdf({

            match:
              detail.match,

            innings:
              detail.innings || [],

            players:
              detail.players || [],

          });

        } catch (error) {

          console.error(
            'PDF export failed:',
            error
          );


          alert(
            'Unable to create PDF. Please try again.'
          );

        }

      },
      []
    );


  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading &&
    matches.length === 0
  ) {

    return (
      <>
        {showIntro && (

          <HomeIntro
            onFinished={
              finishIntro
            }
          />

        )}

        <HomeLoading />

      </>
    );

  }


  /* =======================================================
     SPLIT MATCHES
  ======================================================= */

  const liveMatches = [];
  const others = [];


  for (
    const match of matches
  ) {

    if (
      match.status === 'live'
    ) {

      liveMatches.push(
        match
      );

    } else {

      others.push(
        match
      );

    }

  }


  /* =======================================================
     MEMOIZED COUNTS
  ======================================================= */

  const totalMatches =
    matches.length;

  const liveCount =
    liveMatches.length;


  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <>

      {showIntro && (

        <HomeIntro
          onFinished={
            finishIntro
          }
        />

      )}


      <div
        className="
          home-page
          fade-in
          mx-auto
          w-full
          max-w-3xl
          min-w-0
          overflow-hidden
          pb-8
        "
      >

        {/* =================================================
            BACKGROUND DECORATION
        ================================================= */}

        <div
          className="
            pointer-events-none
            fixed
            left-1/2
            top-20
            -z-10
            h-64
            w-64
            -translate-x-1/2
            rounded-full
            bg-emerald-500/[0.025]
            blur-3xl
          "
        />


        {/* =================================================
            HEADER
        ================================================= */}

        <div
          className="
            home-header
            mb-5
            flex
            items-center
            justify-between
            gap-3
          "
        >

          <div className="min-w-0">

            <div className="flex items-center gap-2.5">

              <div
                className="
                  home-header-icon
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-emerald-500/15
                  bg-emerald-500/10
                  text-lg
                "
              >
                🏏
              </div>


              <div className="min-w-0">

                <div className="flex items-center gap-2">

                  <h1
                    className="
                      truncate
                      text-xl
                      font-black
                      tracking-tight
                      text-white
                    "
                  >
                    Matches
                  </h1>


                  {liveCount > 0 && (

                    <span
                      className="
                        hidden
                        xs:inline-flex
                        items-center
                        gap-1
                        rounded-full
                        border
                        border-red-500/15
                        bg-red-500/5
                        px-2
                        py-0.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-wider
                        text-red-400
                      "
                    >

                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />

                      LIVE

                    </span>

                  )}

                </div>


                <p
                  className="
                    mt-0.5
                    truncate
                    text-[10px]
                    font-medium
                    text-slate-600
                  "
                >
                  {totalMatches === 0
                    ? 'Start your first match'
                    : `${totalMatches} match${totalMatches === 1 ? '' : 'es'} • Scores & records`}
                </p>

              </div>

            </div>

          </div>


          {/* =================================================
              NEW MATCH
          ================================================= */}

          <Link
            to="/create-match"
            className="
              home-new-match
              group/new
              relative
              flex
              min-h-[40px]
              shrink-0
              items-center
              justify-center
              overflow-hidden
              rounded-xl
              bg-white
              px-3.5
              text-[11px]
              font-black
              text-slate-950
            "
          >

            <span
              className="
                pointer-events-none
                absolute
                inset-y-0
                -left-10
                w-6
                rotate-[20deg]
                bg-white/70
                blur-sm
                transition-transform
                duration-500
                group-hover/new:translate-x-32
              "
            />


            <span className="relative z-10">
              + New Match
            </span>

          </Link>

        </div>


        {/* =================================================
            LIVE SECTION
        ================================================= */}

        {liveMatches.length > 0 && (

          <section
            className="
              mb-6
              animate-[homeSectionIn_0.4s_ease-out_both]
            "
          >

            <div
              className="
                mb-2.5
                flex
                items-center
                justify-between
              "
            >

              <div className="flex items-center gap-2">

                <span className="relative flex h-2.5 w-2.5">

                  <span
                    className="
                      absolute
                      h-full
                      w-full
                      animate-ping
                      rounded-full
                      bg-red-400
                      opacity-60
                    "
                  />

                  <span
                    className="
                      relative
                      h-2.5
                      w-2.5
                      rounded-full
                      bg-red-500
                    "
                  />

                </span>


                <h2
                  className="
                    text-[10px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-500
                  "
                >
                  Live now
                </h2>

              </div>


              <span
                className="
                  rounded-full
                  border
                  border-red-500/10
                  bg-red-500/5
                  px-2
                  py-0.5
                  text-[9px]
                  font-bold
                  text-red-400
                "
              >
                {liveMatches.length}
              </span>

            </div>


            {liveMatches.map(
              match => (

                <LiveHero
                  key={match.id}
                  match={match}
                  onDeleted={id => {

                    setMatches(
                      current => {

                        const next =
                          current.filter(
                            item =>
                              item.id !== id
                          );


                        writeMatchesCache(
                          next
                        );


                        return next;

                      }
                    );

                  }}
                />

              )
            )}

          </section>

        )}


        {/* =================================================
            EMPTY STATE
        ================================================= */}

        {matches.length === 0 && (

          <div
            className="
              group/empty
              relative
              overflow-hidden
              rounded-2xl
              border
              border-dashed
              border-slate-800
              bg-slate-900/40
              px-4
              py-10
              text-center
              animate-[homeSectionIn_0.45s_ease-out_both]
            "
          >

            <div
              className="
                pointer-events-none
                absolute
                left-1/2
                top-8
                h-28
                w-28
                -translate-x-1/2
                rounded-full
                bg-emerald-500/5
                blur-3xl
              "
            />


            <div
              className="
                relative
                mx-auto
                flex
                h-16
                w-16
                items-center
                justify-center
                rounded-2xl
                border
                border-emerald-500/10
                bg-emerald-500/5
                text-4xl
                animate-[homeFloat_2.5s_ease-in-out_infinite]
              "
            >
              🏏
            </div>


            <h2
              className="
                relative
                mt-4
                text-base
                font-black
                text-white
              "
            >
              No matches yet
            </h2>


            <p
              className="
                relative
                mx-auto
                mt-1.5
                max-w-xs
                text-[11px]
                leading-relaxed
                text-slate-600
              "
            >
              Create your first scoreboard
              to start recording a match.
            </p>


            <Link
              to="/create-match"
              className="
                home-new-match
                group/create
                relative
                mt-5
                inline-flex
                min-h-[42px]
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                bg-white
                px-5
                text-[11px]
                font-black
                text-slate-950
              "
            >

              <span
                className="
                  pointer-events-none
                  absolute
                  inset-y-0
                  -left-8
                  w-6
                  rotate-[20deg]
                  bg-white/70
                  blur-sm
                  transition-transform
                  duration-500
                  group-hover/create:translate-x-32
                "
              />


              <span className="relative z-10">
                + Create Match
              </span>

            </Link>

          </div>

        )}


        {/* =================================================
            OTHER MATCHES
        ================================================= */}

        {others.length > 0 && (

          <section>

            <div
              className="
                mb-2.5
                flex
                items-center
                justify-between
                animate-[homeSectionIn_0.4s_ease-out_both]
              "
            >

              <div>

                <h2
                  className="
                    text-[10px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-500
                  "
                >
                  All matches
                </h2>

              </div>


              <span
                className="
                  rounded-full
                  border
                  border-slate-800
                  bg-slate-900
                  px-2.5
                  py-1
                  text-[9px]
                  font-bold
                  text-slate-500
                "
              >
                {others.length}
              </span>

            </div>


            <div className="grid gap-2">

              {others.map(
                (match, index) => (

                  <MatchCard
                    key={match.id}
                    match={match}
                    index={index}
                    onDelete={
                      deleteMatch
                    }
                    onDownload={
                      downloadPdf
                    }
                    deletingId={
                      deletingId
                    }
                  />

                )
              )}

            </div>

          </section>

        )}


        {/* =================================================
            FOOTER
        ================================================= */}

        {matches.length > 0 && (

          <div
            className="
              mt-6
              flex
              items-center
              justify-center
              gap-2
              text-[8px]
              font-bold
              uppercase
              tracking-[0.2em]
              text-slate-700
            "
          >

            <span>
              🏏
            </span>

            GCC Cricket

            <span>
              •
            </span>

            Live scoring

          </div>

        )}

      </div>


      {/* ===================================================
          HOME EFFECTS
      =================================================== */}

      <style>{`

        .home-page {
          position: relative;
        }


        .home-header {
          animation:
            homeSectionIn
            0.35s
            ease-out
            both;
        }


        .home-header-icon {
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            background-color 220ms ease;
        }


        .home-header-icon:hover {
          transform:
            translateY(-2px)
            rotate(4deg)
            scale(1.04);

          border-color:
            rgba(16,185,129,0.35);

          background-color:
            rgba(16,185,129,0.15);
        }


        .home-new-match {
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            background-color 180ms ease;
        }


        .home-new-match:hover {
          transform:
            translateY(-2px);

          box-shadow:
            0 10px 25px
            rgba(255,255,255,0.07);
        }


        .home-new-match:active {
          transform:
            translateY(0)
            scale(0.96);
        }


        .home-action {
          transition:
            transform 150ms ease,
            background-color 150ms ease,
            color 150ms ease,
            border-color 150ms ease;
        }


        .home-action:hover {
          transform:
            translateY(-1px);

          background-color:
            rgb(51,65,85);

          color:
            white;
        }


        .home-action:active {
          transform:
            scale(0.96);
        }


        .match-card {
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            background-color 220ms ease,
            box-shadow 220ms ease;
        }


        .match-card:hover {
          transform:
            translateY(-2px);

          border-color:
            rgb(51,65,85);

          background-color:
            rgba(15,23,42,0.95);

          box-shadow:
            0 12px 28px
            rgba(0,0,0,0.18);
        }


        .live-card {
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            box-shadow 220ms ease;
        }


        .live-card:hover {
          transform:
            translateY(-2px);

          border-color:
            rgba(239,68,68,0.38);

          box-shadow:
            0 14px 32px
            rgba(127,29,29,0.18);
        }


        .score-pop {
          animation:
            scorePop
            0.42s
            cubic-bezier(.2,.8,.2,1);
        }


        @keyframes scorePop {

          0% {
            transform: scale(1);
          }

          45% {
            transform: scale(1.06);
          }

          100% {
            transform: scale(1);
          }

        }


        @keyframes homeCardIn {

          from {
            opacity: 0;
            transform:
              translateY(10px);
          }

          to {
            opacity: 1;
            transform:
              translateY(0);
          }

        }


        @keyframes homeSectionIn {

          from {
            opacity: 0;
            transform:
              translateY(8px);
          }

          to {
            opacity: 1;
            transform:
              translateY(0);
          }

        }


        @keyframes homeFloat {

          0%,
          100% {
            transform:
              translateY(0);
          }

          50% {
            transform:
              translateY(-5px);
          }

        }


        @media (
          prefers-reduced-motion: reduce
        ) {

          .home-header,
          .match-card,
          .live-card,
          .score-pop,
          .home-page *,
          .home-page::before,
          .home-page::after {
            animation: none !important;
            transition: none !important;
          }

        }


        @media (max-width: 420px) {

          .home-new-match {
            padding-left: 11px;
            padding-right: 11px;
          }

        }

      `}</style>

    </>

  );

}
