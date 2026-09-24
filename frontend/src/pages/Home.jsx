
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Matches, getApiErrorMessage } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

const MATCHES_CACHE_KEY = 'gcc_matches_cache_v1';

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
   LIVE MATCH CARD
========================================================= */

function LiveHero({
  match,
  onDeleted,
}) {
  const [data, setData] = useState({
    match,
    innings: match?.innings || [],
    players: match?.players || [],
  });

  const [deleting, setDeleting] =
    useState(false);

  /*
   * Keep Home data immediately available.
   *
   * IMPORTANT:
   * Do not call Matches.get() here.
   */
  useEffect(() => {
  let cancelled = false;

  const loadLiveMatch = async () => {
    // Show the match immediately.
    setData((current) => ({
      ...current,
      match,
      innings: match?.innings || current.innings || [],
      players: match?.players || current.players || [],
    }));

    if (!match?.id) {
      return;
    }

    try {
      const detailedMatch =
        await Matches.get(match.id);

      if (cancelled) {
        return;
      }

      setData((current) => ({
        ...current,

        match:
          detailedMatch?.match ||
          detailedMatch ||
          current.match,

        innings:
          detailedMatch?.innings ||
          detailedMatch?.match?.innings ||
          current.innings ||
          [],

        players:
          detailedMatch?.players ||
          detailedMatch?.match?.players ||
          current.players ||
          [],
      }));

    } catch (error) {
      console.error(
        'Failed to load live match details:',
        error
      );
    }
  };

  loadLiveMatch();

  return () => {
    cancelled = true;
  };
}, [match]);

  /* =======================================================
     REALTIME SOCKET
  ======================================================= */

  useEffect(() => {
    if (!match?.id) {
      return;
    }

    socket.emit(
      'join-match',
      match.id
    );

    const onUpdate = ({
      match: updatedMatch,
      innings,
    }) => {
      setData((current) => ({
        ...current,

        match:
          updatedMatch ||
          current.match,

        innings:
          Array.isArray(innings)
            ? innings
            : current.innings,
      }));
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
      ? currentMatch.team1_short ||
        currentMatch.team1_name ||
        currentMatch.team1_short
      : innings?.innings?.batting_team_id ===
          currentMatch.team2_id
        ? currentMatch.team2_short ||
          currentMatch.team2_name ||
          currentMatch.team2_short
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
      console.log(
        '🗑️ Deleting live match:',
        currentMatch.id
      );

      await Matches.remove(
        currentMatch.id
      );

      console.log(
        '✅ Live match deleted:',
        currentMatch.id
      );

      if (onDeleted) {
        onDeleted(
          currentMatch.id
        );
      }

    } catch (error) {
      showDeleteError(error);

      setDeleting(false);
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-red-500/25 bg-slate-900 shadow-md shadow-black/10">

      {/* =================================================
          LIVE HEADER
      ================================================= */}

      <Link
        to={`/match/${currentMatch.id}/live`}
        state={{
          match: currentMatch,
        }}
        className="block"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">

          <div className="flex items-center gap-1.5">

            <span className="relative flex h-2 w-2">

              <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />

              <span className="relative h-2 w-2 rounded-full bg-red-500" />

            </span>

            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
              Live
            </span>

          </div>

          <div className="text-[10px] text-slate-600">
            {currentMatch.overs_limit} overs
          </div>

        </div>

        {/* =================================================
            TEAMS
        ================================================= */}

        <div className="px-3 pt-3">

          <div className="flex items-center justify-center gap-2">

            <div className="min-w-0 flex-1 text-right">

              <div className="truncate text-sm font-bold text-white">
                {currentMatch.team1_short}
              </div>

            </div>

            <div className="shrink-0 text-[9px] font-bold text-slate-600">
              VS
            </div>

            <div className="min-w-0 flex-1 text-left">

              <div className="truncate text-sm font-bold text-white">
                {currentMatch.team2_short}
              </div>

            </div>

          </div>

        </div>

        {/* =================================================
            SCORE
        ================================================= */}

        <div className="px-3 pb-3 pt-2 text-center">

          {innings ? (
            <>
              <div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-600">
                {battingShort} batting
              </div>

              <div className="text-[38px] font-black leading-none tracking-tight text-white">

                {innings.innings.total_runs}

                <span className="text-slate-500">
                  /{innings.innings.total_wickets}
                </span>

              </div>

              <div className="mt-1 text-[11px] text-slate-500">

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
            <div className="py-3 text-[11px] text-slate-500">
              Live match
            </div>
          )}

        </div>

        {/* =================================================
            BATTING TEAM
        ================================================= */}

        {battingTeam && (
          <div className="px-3 pb-3 text-center">

            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[9px] font-medium text-slate-500">
              {battingTeam}
            </span>

          </div>
        )}

      </Link>

      {/* =================================================
          ACTION BAR
      ================================================= */}

      <div className="grid grid-cols-3 gap-1.5 border-t border-slate-800 p-2">

        <Link
          to={`/match/${currentMatch.id}/live`}
          state={{
            match: currentMatch,
          }}
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
        >
          View
        </Link>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700"
          onClick={downloadPdf}
          disabled={deleting}
        >
          PDF
        </button>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-red-500/10 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting
            ? 'Deleting...'
            : 'Delete'}
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   NORMAL MATCH CARD
========================================================= */

function MatchCard({
  match,
  onDelete,
  onDownload,
  deletingId,
}) {
  const statusText =
    match.status === 'innings-break'
      ? 'Innings Break'
      : match.status;

  const isDeleting =
    deletingId === match.id;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">

      <div className="px-3 py-3">

        {/* =================================================
            TOP ROW
        ================================================= */}

        <div className="flex items-center justify-between gap-2">

          <div className="flex min-w-0 items-center gap-2">

            <span className="text-sm font-bold text-white">
              {match.team1_short}
            </span>

            <span className="text-[9px] font-bold text-slate-600">
              VS
            </span>

            <span className="text-sm font-bold text-white">
              {match.team2_short}
            </span>

          </div>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
              statusBadge[match.status] ||
              statusBadge.completed
            }`}
          >
            {statusText}
          </span>

        </div>

        {/* =================================================
            MATCH INFO
        ================================================= */}

        <div className="mt-1 text-[10px] text-slate-600">
          {match.overs_limit} overs
        </div>

        {/* =================================================
            RESULT
        ================================================= */}

        {match.result_text && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/5 px-2 py-1.5">

            <span className="text-xs">
              🏆
            </span>

            <span className="truncate text-[11px] font-medium text-emerald-400">
              {match.result_text}
            </span>

          </div>
        )}

      </div>

      {/* =================================================
          BUTTONS
      ================================================= */}

      <div className="grid grid-cols-2 gap-1.5 border-t border-slate-800 p-2">

        {match.status === 'upcoming' && (
          <Link
            to={`/match/${match.id}/setup`}
            className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
          >
            🏏 Start Toss
          </Link>
        )}

        {match.status === 'innings-break' && (
          <Link
            to={`/match/${match.id}/score`}
            className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
          >
            ▶ Continue
          </Link>
        )}

        <Link
          to={`/match/${match.id}/live`}
          state={{
            match,
          }}
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
        >
          View
        </Link>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          onClick={() =>
            onDownload(match.id)
          }
          disabled={isDeleting}
        >
          PDF
        </button>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-red-500/10 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() =>
            onDelete(match.id)
          }
          disabled={isDeleting}
        >
          {isDeleting
            ? 'Deleting...'
            : 'Delete'}
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   HOME
========================================================= */

export default function Home() {

  /*
   * IMPORTANT:
   *
   * Read cached matches immediately.
   *
   * This allows Home to render without waiting
   * for the remote Render/Turso request.
   */
  const initialCachedMatches =
    readMatchesCache();

  const [matches, setMatches] =
    useState(initialCachedMatches);

  /*
   * Only show the full loading screen when
   * there is absolutely no cached data.
   */
  const [loading, setLoading] =
    useState(
      initialCachedMatches.length === 0
    );

  const [deletingId, setDeletingId] =
    useState(null);

  /* =======================================================
     LOAD MATCHES
  ======================================================= */

    const loadMatches =
    useCallback(async () => {

      try {

        /*
         * First load the normal match list.
         */
        const data =
          await Matches.list();

        const matchList =
          Array.isArray(data)
            ? data
            : [];

        /*
         * Load detailed score information
         * for live matches.
         *
         * Matches.list() gives the match/card data,
         * while Matches.get(id) gives the detailed
         * innings and player information.
         */
        const enrichedMatches =
          await Promise.all(
            matchList.map(
              async (match) => {

                /*
                 * Only live matches need
                 * detailed scoreboard data.
                 */
                if (
                  match?.status !== 'live'
                ) {
                  return match;
                }

                try {

                  const detail =
                    await Matches.get(
                      match.id
                    );

                  /*
                   * Some endpoints return:
                   *
                   * {
                   *   match: {...},
                   *   innings: [...]
                   * }
                   *
                   * Others may return the match
                   * object directly.
                   */
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

                    /*
                     * Keep the latest detailed
                     * match information.
                     */
                    ...detailedMatch,

                    /*
                     * IMPORTANT:
                     * Preserve the original ID/status
                     * from the match list.
                     */
                    id: match.id,

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

                  /*
                   * If detailed loading fails,
                   * keep the normal match card.
                   */
                  return match;
                }
              }
            )
          );

        /*
         * Update Home immediately.
         */
        setMatches(
          enrichedMatches
        );

        /*
         * Save enriched live matches in cache
         * so Home can display the last known score
         * while the server is loading next time.
         */
        writeMatchesCache(
          enrichedMatches
        );

      } catch (error) {

        console.error(
          'Failed to load matches:',
          error
        );

        /*
         * Keep existing cached data if
         * the server temporarily fails.
         */
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
     DELETE NORMAL MATCH
  ======================================================= */

  const deleteMatch =
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

        console.log(
          '🗑️ Deleting match:',
          matchId
        );

        await Matches.remove(
          matchId
        );

        console.log(
          '✅ Match deleted:',
          matchId
        );

        /*
         * Remove immediately from UI.
         */
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

        /*
         * Reload once from server to guarantee
         * synchronization.
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

    };

  /* =======================================================
     DOWNLOAD PDF
  ======================================================= */

  const downloadPdf =
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

    };

  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading &&
    matches.length === 0
  ) {

    return (
      <div className="flex min-h-[30vh] items-center justify-center">

        <div className="text-xs text-slate-500">
          Loading matches…
        </div>

      </div>
    );

  }

  /* =======================================================
     FILTER MATCHES
  ======================================================= */

  const liveMatches =
    matches.filter(
      (m) =>
        m.status === 'live'
    );

  const others =
    matches.filter(
      (m) =>
        m.status !== 'live'
    );

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="fade-in mx-auto w-full max-w-3xl pb-5">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="mb-4 flex items-center justify-between gap-3">

        <div className="min-w-0">

          <h1 className="text-xl font-bold tracking-tight text-white">
            Matches
          </h1>

          <p className="mt-0.5 text-[10px] text-slate-600">
            Scores & match records
          </p>

        </div>

        <Link
          to="/create-match"
          className="flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-white px-3 text-[11px] font-bold text-slate-950 transition hover:bg-slate-200"
        >
          + New Match
        </Link>

      </div>

      {/* =================================================
          LIVE SECTION
      ================================================= */}

      {liveMatches.length > 0 && (
        <section className="mb-5">

          <div className="mb-2 flex items-center gap-1.5">

            <span className="relative flex h-2 w-2">

              <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />

              <span className="relative h-2 w-2 rounded-full bg-red-500" />

            </span>

            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Live now
            </h2>

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
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-8 text-center">

          <div className="text-3xl">
            🏏
          </div>

          <h2 className="mt-2 text-sm font-semibold text-white">
            No matches yet
          </h2>

          <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-600">
            Create your first scoreboard
            to start recording a match.
          </p>

          <Link
            to="/create-match"
            className="mt-4 inline-flex min-h-[36px] items-center justify-center rounded-lg bg-white px-4 text-[11px] font-bold text-slate-950"
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

          <div className="mb-2 flex items-center justify-between">

            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              All matches
            </h2>

            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] text-slate-600">
              {others.length}
            </span>

          </div>

          <div className="grid gap-2">

            {others.map(
              (match) => (
                <MatchCard
                  key={match.id}
                  match={match}
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

