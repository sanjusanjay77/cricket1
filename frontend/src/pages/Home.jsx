import {
  useEffect,
  useState,
  useCallback,
  memo,
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
   CACHE HELPERS
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
          `${index * 70}ms`,
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
   LOADING SCREEN
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
   SCORE UPDATE EFFECT
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

      }, 550);


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


  /* =======================================================
     SCORE FLASH
  ======================================================= */

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
     REALTIME SOCKET
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

      setData(
        (current) => ({

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
     DOWNLOAD PDF
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
     DELETE LIVE MATCH
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
        group
        mb-4
        overflow-hidden
        rounded-2xl
        border
        border-red-500/25
        bg-slate-900
        shadow-lg
        shadow-black/20
        transition-all
        duration-300
        hover:border-red-500/40
        hover:shadow-red-950/20
        active:scale-[0.99]
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
          transition
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
                  opacity-70
                "
              />

              <span
                className="
                  relative
                  h-2.5
                  w-2.5
                  rounded-full
                  bg-red-500
                  shadow-sm
                  shadow-red-500
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
                  transition-all
                  duration-300
                  ${
                    scoreFlash
                      ? 'scale-105 bg-red-500/10'
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
                    transition-all
                    duration-300
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


        {/* =================================================
            BATTING TEAM
        ================================================= */}

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
          ACTION BAR
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
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            transition
            active:scale-95
            active:bg-slate-700
            hover:bg-slate-700
          "
        >
          👁 View
        </Link>


        <button
          type="button"
          className="
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            transition
            active:scale-95
            active:bg-slate-700
            hover:bg-slate-700
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
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-red-500/10
            text-[11px]
            font-bold
            text-red-400
            transition
            active:scale-95
            active:bg-red-500/20
            hover:bg-red-500/20
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
        group
        overflow-hidden
        rounded-2xl
        border
        border-slate-800
        bg-slate-900/70
        shadow-sm
        shadow-black/10
        transition-all
        duration-300
        hover:border-slate-700
        hover:bg-slate-900
        hover:shadow-lg
        active:scale-[0.99]
        animate-[fadeSlideUp_0.35s_ease-out_both]
      "
      style={{
        animationDelay:
          `${Math.min(index, 8) * 45}ms`,
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
            MATCH INFO
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
              flex
              min-h-[40px]
              items-center
              justify-center
              rounded-xl
              bg-slate-800
              text-[11px]
              font-bold
              text-slate-300
              transition
              active:scale-95
              active:bg-slate-700
              hover:bg-slate-700
            "
          >
            🏏 Start Toss
          </Link>

        )}


        {match.status === 'innings-break' && (

          <Link
            to={`/match/${match.id}/score`}
            className="
              flex
              min-h-[40px]
              items-center
              justify-center
              rounded-xl
              bg-slate-800
              text-[11px]
              font-bold
              text-slate-300
              transition
              active:scale-95
              active:bg-slate-700
              hover:bg-slate-700
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
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            transition
            active:scale-95
            active:bg-slate-700
            hover:bg-slate-700
          "
        >
          👁 View
        </Link>


        <button
          type="button"
          className="
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-slate-800
            text-[11px]
            font-bold
            text-slate-300
            transition
            active:scale-95
            active:bg-slate-700
            hover:bg-slate-700
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
            flex
            min-h-[40px]
            items-center
            justify-center
            rounded-xl
            bg-red-500/10
            text-[11px]
            font-bold
            text-red-400
            transition
            active:scale-95
            active:bg-red-500/20
            hover:bg-red-500/20
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


        const liveMatches =
          matchList.filter(
            (match) =>
              match?.status === 'live'
          );


        let enrichedMatches;


        if (liveMatches.length === 0) {

          enrichedMatches =
            matchList;

        } else {

          const liveDetails =
            await Promise.all(
              liveMatches.map(
                async (match) => {

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
                (match) => [
                  match.id,
                  match,
                ]
              )
            );


          enrichedMatches =
            matchList.map(
              (match) =>
                match?.status === 'live'
                  ? (
                      liveDetailMap.get(
                        match.id
                      ) || match
                    )
                  : match
            );

        }


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


        setMatches((current) =>
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
     DELETE NORMAL MATCH
  ======================================================= */

  const deleteMatch =
    useCallback(
      async (matchId) => {

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


          /* ---------------------------------------------
             REMOVE IMMEDIATELY
          --------------------------------------------- */

          setMatches((current) => {

            const next =
              current.filter(
                (match) =>
                  match.id !== matchId
              );


            writeMatchesCache(
              next
            );


            return next;

          });


          /* ---------------------------------------------
             BACKGROUND SYNC
          --------------------------------------------- */

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
     DOWNLOAD PDF
  ======================================================= */

  const downloadPdf =
    useCallback(
      async (matchId) => {

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
      <HomeLoading />
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
     RENDER
  ======================================================= */

  return (

    <div
      className="
        fade-in
        mx-auto
        w-full
        max-w-3xl
        min-w-0
        overflow-hidden
        pb-6
      "
    >

      {/* =================================================
          HEADER
      ================================================= */}

      <div
        className="
          mb-5
          flex
          items-center
          justify-between
          gap-3
          animate-[fadeSlideUp_0.35s_ease-out_both]
        "
      >

        <div className="min-w-0">

          <div className="flex items-center gap-2">

            <div
              className="
                flex
                h-9
                w-9
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


              <p
                className="
                  mt-0.5
                  text-[10px]
                  font-medium
                  text-slate-600
                "
              >
                Scores & match records
              </p>

            </div>

          </div>

        </div>


        <Link
          to="/create-match"
          className="
            flex
            min-h-[40px]
            shrink-0
            items-center
            justify-center
            rounded-xl
            bg-white
            px-3.5
            text-[11px]
            font-black
            text-slate-950
            shadow-sm
            shadow-white/5
            transition-all
            duration-200
            hover:bg-slate-200
            active:scale-95
          "
        >
          + New Match
        </Link>

      </div>


      {/* =================================================
          LIVE SECTION
      ================================================= */}

      {liveMatches.length > 0 && (

        <section
          className="
            mb-6
            animate-[fadeSlideUp_0.4s_ease-out_both]
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
            (match) => (

              <LiveHero
                key={match.id}
                match={match}
                onDeleted={(id) => {

                  setMatches(
                    (current) => {

                      const next =
                        current.filter(
                          (match) =>
                            match.id !== id
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
            overflow-hidden
            rounded-2xl
            border
            border-dashed
            border-slate-800
            bg-slate-900/40
            px-4
            py-10
            text-center
            animate-[fadeSlideUp_0.4s_ease-out_both]
          "
        >

          <div
            className="
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
              animate-[floatBall_2.5s_ease-in-out_infinite]
            "
          >
            🏏
          </div>


          <h2
            className="
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
              mt-5
              inline-flex
              min-h-[42px]
              items-center
              justify-center
              rounded-xl
              bg-white
              px-5
              text-[11px]
              font-black
              text-slate-950
              transition
              active:scale-95
              hover:bg-slate-200
            "
          >
            + Create Match
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
              animate-[fadeSlideUp_0.4s_ease-out_both]
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

    </div>

  );

}
