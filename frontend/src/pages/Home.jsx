
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  memo,
} from 'react';

import { Link } from 'react-router-dom';

import {
  Matches,
  getApiErrorMessage,
} from '../api/api.js';

import socket from '../socket.js';

import { exportMatchPdf } from '../utils/exportPdf.js';

const MATCHES_CACHE_KEY = 'gcc_matches_cache_v1';
const HOME_INTRO_KEY = 'gcc_home_intro_seen_v1';
const DELETED_MATCHES_KEY = 'gcc_deleted_matches_v1';
const DELETED_MATCH_TTL = 24 * 60 * 60 * 1000;

function sameId(a, b) {
  return String(a) === String(b);
}

function readMatchesCache() {
  try {
    const data = JSON.parse(
      localStorage.getItem(MATCHES_CACHE_KEY) || '[]'
    );
    return Array.isArray(data) ? data : [];
  } catch {
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
    console.warn('Unable to cache matches:', error);
  }
}

function readDeletedMatches() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DELETED_MATCHES_KEY) || '{}'
    );
    const now = Date.now();
    const result = {};

    for (const [id, timestamp] of Object.entries(parsed)) {
      if (
        Number.isFinite(timestamp) &&
        timestamp <= now &&
        now - timestamp < DELETED_MATCH_TTL
      ) {
        result[id] = timestamp;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function rememberDeletedMatch(id) {
  try {
    const deleted = readDeletedMatches();
    deleted[String(id)] = Date.now();

    localStorage.setItem(
      DELETED_MATCHES_KEY,
      JSON.stringify(deleted)
    );
  } catch (error) {
    console.warn('Unable to save deletion protection:', error);
  }
}

function filterDeletedMatches(matches) {
  const deleted = readDeletedMatches();

  return matches.filter(
    match => !deleted[String(match?.id)]
  );
}

function showDeleteError(error) {
  console.error('Delete match failed:', error);

  const message =
    getApiErrorMessage?.(error) ||
    error?.response?.data?.error ||
    error?.message ||
    'Unable to delete this match.';

  alert(`Delete failed:\n\n${message}`);
}

async function downloadMatchPdf(matchId) {
  try {
    const detail = await Matches.get(matchId);

    await exportMatchPdf({
      match: detail.match,
      innings: detail.innings || [],
      players: detail.players || [],
    });
  } catch (error) {
    console.error('PDF export failed:', error);
    alert('Unable to create PDF. Please try again.');
  }
}

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
   WELCOME INTRO
========================================================= */

function HomeIntro({ onFinished }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(HOME_INTRO_KEY, '1');
      } catch {
        // The intro can still finish if storage is unavailable.
      }

      onFinished();
    }, 1700);

    return () => window.clearTimeout(timer);
  }, [onFinished]);

  return (
    <div className="home-intro fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950 px-5">
      <div className="home-intro-bg">
        <div className="home-orb home-orb-one" />
        <div className="home-orb home-orb-two" />
        <div className="home-orb home-orb-three" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="home-logo-animation flex h-20 w-20 items-center justify-center rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 text-4xl shadow-2xl shadow-emerald-950/40">
          🏏
        </div>

        <div className="home-intro-label mt-5 text-[9px] font-black uppercase tracking-[0.35em] text-emerald-400">
          GCC Cricket
        </div>

        <h1 className="home-intro-title mt-2 text-3xl font-black tracking-tight text-white">
          Live Scoreboard
        </h1>

        <p className="home-intro-subtitle mt-2 text-[11px] font-medium text-slate-500">
          Your matches. Your records.
        </p>

        <div className="home-loading-line mt-6 h-1 w-28 overflow-hidden rounded-full bg-slate-800">
          <div className="home-loading-progress" />
        </div>
      </div>

      <style>{`
        .home-intro {
          animation: homeIntroExit .35s ease-out .42s forwards;
        }
        .home-intro-bg {
          position:absolute; inset:0; overflow:hidden; pointer-events:none;
        }
        .home-orb {
          position:absolute; border-radius:9999px;
          filter:blur(60px); opacity:.18; will-change:transform;
        }
        .home-orb-one {
          width:220px;height:220px;left:15%;top:25%;
          background:rgba(16,185,129,.35);
          animation:homeOrbOne 4s ease-in-out infinite;
        }
        .home-orb-two {
          width:180px;height:180px;right:10%;bottom:20%;
          background:rgba(20,184,166,.25);
          animation:homeOrbTwo 5s ease-in-out infinite;
        }
        .home-orb-three {
          width:140px;height:140px;left:45%;top:55%;
          background:rgba(59,130,246,.12);
          animation:homeOrbThree 4.5s ease-in-out infinite;
        }
        .home-logo-animation {
          animation:homeLogoIn .55s cubic-bezier(.2,.8,.2,1) both;
        }
        .home-intro-label,.home-intro-title,
        .home-intro-subtitle,.home-loading-line {
          animation:homeTextIn .45s ease-out both;
        }
        .home-intro-label { animation-delay:.08s; }
        .home-intro-title { animation-delay:.14s; }
        .home-intro-subtitle { animation-delay:.2s; }
        .home-loading-line { animation-delay:.25s; }
        .home-loading-progress {
          height:100%;width:45%;border-radius:9999px;
          background:rgb(16,185,129);
          animation:homeProgress .65s ease-in-out infinite;
        }
        @keyframes homeLogoIn {
          0% {opacity:0;transform:translateY(20px) scale(.7) rotate(-10deg)}
          70% {opacity:1;transform:translateY(-3px) scale(1.04) rotate(2deg)}
          100% {opacity:1;transform:translateY(0) scale(1) rotate(0)}
        }
        @keyframes homeTextIn {
          from {opacity:0;transform:translateY(8px)}
          to {opacity:1;transform:translateY(0)}
        }
        @keyframes homeProgress {
          0% {transform:translateX(-130%)}
          100% {transform:translateX(270%)}
        }
        @keyframes homeOrbOne {
          0%,100% {transform:translate3d(0,0,0) scale(1)}
          50% {transform:translate3d(20px,-15px,0) scale(1.08)}
        }
        @keyframes homeOrbTwo {
          0%,100% {transform:translate3d(0,0,0)}
          50% {transform:translate3d(-18px,15px,0)}
        }
        @keyframes homeOrbThree {
          0%,100% {transform:scale(.9)}
          50% {transform:scale(1.1)}
        }
        @keyframes homeIntroExit {
          from {opacity:1}
          to {opacity:0;visibility:hidden;pointer-events:none}
        }
        @media (prefers-reduced-motion:reduce) {
          .home-intro,.home-logo-animation,.home-intro-label,
          .home-intro-title,.home-intro-subtitle,
          .home-loading-line,.home-loading-progress,.home-orb {
            animation:none!important;
          }
        }
      `}</style>
    </div>
  );
}

/* =========================================================
   LOADING
========================================================= */

function MatchSkeleton({ index = 0 }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-3 animate-pulse"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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

function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden pb-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
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
        {[0, 1, 2].map(index => (
          <MatchSkeleton key={index} index={index} />
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   SCORE FLASH
========================================================= */

function useScoreFlash(innings) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!innings) return undefined;

    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 450);

    return () => window.clearTimeout(timer);
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

const LiveHero = memo(function LiveHero({ match, onDeleted }) {
  const [data, setData] = useState(() => ({
    match,
    innings: Array.isArray(match?.innings) ? match.innings : [],
    players: Array.isArray(match?.players) ? match.players : [],
  }));

  const [deleting, setDeleting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const deleteInProgressRef = useRef(false);
  const matchRef = useRef(match);
  const inningsRef = useRef(data.innings);

  // Keep socket handlers aligned with the latest card data.
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    inningsRef.current = data.innings;
  }, [data.innings]);

  // Synchronize parent changes without discarding newer socket scores.
  useEffect(() => {
    setData(current => ({
      ...current,
      match: {
        ...current.match,
        ...match,
      },
      innings:
        Array.isArray(match?.innings) &&
        match.innings.length > 0
          ? match.innings
          : current.innings,
      players: Array.isArray(match?.players)
        ? match.players
        : current.players,
    }));
  }, [match]);

  useEffect(() => {
    const matchId = match?.id;
    if (matchId == null) return undefined;

    const onUpdate = payload => {
      const updatedMatch = payload?.match;
      const eventId = updatedMatch?.id ?? payload?.matchId;

      if (eventId != null && !sameId(eventId, matchId)) {
        return;
      }

      setData(current => {
        const nextMatch = updatedMatch
          ? { ...current.match, ...updatedMatch }
          : current.match;

        const nextInnings = Array.isArray(payload?.innings)
          ? payload.innings
          : current.innings;

        inningsRef.current = nextInnings;
        matchRef.current = nextMatch;

        return {
          ...current,
          match: nextMatch,
          innings: nextInnings,
        };
      });
    };

    const join = () => {
      socket.emit('join-match', matchId);
    };

    // Subscribe before joining so a quick first update is not missed.
    socket.on('score-update', onUpdate);

    if (socket.connected) {
      join();
    }

    socket.on('connect', join);

    return () => {
      socket.off('score-update', onUpdate);
      socket.off('connect', join);

      if (socket.connected) {
        socket.emit('leave-match', matchId);
      }
    };
  }, [match?.id]);

  const currentMatch = data.match;
  const innings = data.innings?.[data.innings.length - 1];
  const scoreFlash = useScoreFlash(innings);

  if (!currentMatch) return null;

  const battingTeam =
    innings?.innings?.batting_team_id === currentMatch.team1_id
      ? currentMatch.team1_name
      : innings?.innings?.batting_team_id === currentMatch.team2_id
        ? currentMatch.team2_name
        : null;

  const battingShort =
    innings?.innings?.batting_team_id === currentMatch.team1_id
      ? (
          innings?.innings?.batting_team_short ||
          currentMatch.team1_short ||
          currentMatch.team1_name ||
          ''
        )
      : innings?.innings?.batting_team_id === currentMatch.team2_id
        ? (
            innings?.innings?.batting_team_short ||
            currentMatch.team2_short ||
            currentMatch.team2_name ||
            ''
          )
        : null;

  const downloadPdf = async () => {
    if (pdfLoading || deleting) return;

    setPdfLoading(true);
    try {
      await downloadMatchPdf(currentMatch.id);
    } finally {
      setPdfLoading(false);
    }
  };

  const deleteMatch = async () => {
    if (deleteInProgressRef.current || deleting) return;

    const ok = window.confirm(
      'Delete this match permanently?\n\n' +
      'This will delete the match, innings, balls and full scorecard.\n\n' +
      'This action cannot be undone.'
    );

    if (!ok) return;

    deleteInProgressRef.current = true;
    setDeleting(true);

    try {
      await Matches.remove(currentMatch.id);
      rememberDeletedMatch(currentMatch.id);
      onDeleted?.(currentMatch.id);
    } catch (error) {
      showDeleteError(error);
      setDeleting(false);
    } finally {
      deleteInProgressRef.current = false;
    }
  };

  return (
    <div className="live-card group mb-4 overflow-hidden rounded-2xl border border-red-500/20 bg-slate-900 shadow-lg shadow-black/20">
      <Link
        to={`/match/${currentMatch.id}/live`}
        state={{ match: currentMatch }}
        className="block active:bg-slate-800/30"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
              Live Now
            </span>
          </div>
          <div className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
            {currentMatch.overs_limit} overs
          </div>
        </div>

        <div className="px-3 pt-4">
          <div className="flex items-center justify-center gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-base font-black text-white">
                {currentMatch.team1_short}
              </div>
            </div>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-[8px] font-black text-slate-600">
              VS
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-base font-black text-white">
                {currentMatch.team2_short}
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 pb-4 pt-3 text-center">
          {innings ? (
            <>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
                {battingShort} batting
              </div>
              <div className={`inline-block rounded-2xl px-3 py-1 transition-transform duration-200 ${scoreFlash ? 'score-pop bg-red-500/10' : ''}`}>
                <div className={`text-[42px] font-black leading-none tracking-tight transition-colors duration-200 ${scoreFlash ? 'text-red-300' : 'text-white'}`}>
                  {innings.innings?.total_runs ?? 0}
                  <span className="text-slate-500">
                    /{innings.innings?.total_wickets ?? 0}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">
                {innings.overs}
                <span className="mx-1.5 text-slate-700">•</span>
                RR {innings.runRate}
                {innings.innings?.target != null && (
                  <>
                    <span className="mx-1.5 text-slate-700">•</span>
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
            <span className="inline-flex max-w-full items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[9px] font-semibold text-slate-500">
              <span className="mr-1 text-emerald-500">●</span>
              <span className="truncate">{battingTeam}</span>
            </span>
          </div>
        )}
      </Link>

      <div className="grid grid-cols-3 gap-1.5 border-t border-slate-800 bg-slate-950/40 p-2">
        <Link
          to={`/match/${currentMatch.id}/live`}
          state={{ match: currentMatch }}
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300"
        >
          👁 View
        </Link>

        <button
          type="button"
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300 disabled:opacity-50"
          onClick={downloadPdf}
          disabled={deleting || pdfLoading}
        >
          {pdfLoading ? 'Loading...' : '📄 PDF'}
        </button>

        <button
          type="button"
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-red-500/10 text-[11px] font-bold text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting ? 'Deleting...' : '🗑 Delete'}
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

  const isDeleting = sameId(deletingId, match.id);

  return (
    <div
      className="match-card group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-sm shadow-black/10 animate-[homeCardIn_0.38s_ease-out_both]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="px-3 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-black text-white">
              {match.team1_short}
            </span>
            <span className="shrink-0 text-[8px] font-black text-slate-700">
              VS
            </span>
            <span className="truncate text-sm font-black text-white">
              {match.team2_short}
            </span>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wide ${statusBadge[match.status] || statusBadge.completed}`}>
            {statusText}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-600">
          <span>{match.overs_limit} overs</span>
          <span className="text-slate-800">•</span>
          <span>Match #{match.id}</span>
        </div>

        {match.result_text && (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
            <span className="shrink-0 text-sm">🏆</span>
            <span className="truncate text-[11px] font-semibold text-emerald-400">
              {match.result_text}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-slate-800 bg-slate-950/30 p-2">
        {match.status === 'upcoming' && (
          <Link
            to={`/match/${match.id}/setup`}
            className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300"
          >
            🏏 Start Toss
          </Link>
        )}

        {match.status === 'innings-break' && (
          <Link
            to={`/match/${match.id}/score`}
            className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300"
          >
            ▶ Continue
          </Link>
        )}

        <Link
          to={`/match/${match.id}/live`}
          state={{ match }}
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300"
        >
          👁 View
        </Link>

        <button
          type="button"
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-slate-800 text-[11px] font-bold text-slate-300 disabled:opacity-50"
          onClick={() => onDownload(match.id)}
          disabled={isDeleting}
        >
          📄 PDF
        </button>

        <button
          type="button"
          className="home-action flex min-h-[40px] items-center justify-center rounded-xl bg-red-500/10 text-[11px] font-bold text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onDelete(match.id)}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : '🗑 Delete'}
        </button>
      </div>
    </div>
  );
});

/* =========================================================
   HOME PAGE
========================================================= */

export default function Home() {
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(HOME_INTRO_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const finishIntro = useCallback(() => {
    setShowIntro(false);
  }, []);

  const [matches, setMatches] = useState(() =>
    filterDeletedMatches(readMatchesCache())
  );

  const [loading, setLoading] = useState(() =>
    filterDeletedMatches(readMatchesCache()).length === 0
  );

  const [deletingId, setDeletingId] = useState(null);

  const loadRequestRef = useRef(0);
  const deletingIdRef = useRef(null);
  const deletedIdsRef = useRef(
    new Set(Object.keys(readDeletedMatches()))
  );

  // Keep the local deletion filter and cache consistent.
  const applyMatches = useCallback(nextMatches => {
    const filtered = filterDeletedMatches(nextMatches).filter(
      match => !deletedIdsRef.current.has(String(match.id))
    );

    setMatches(filtered);
    writeMatchesCache(filtered);

    return filtered;
  }, []);

  const loadMatches = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    try {
      const data = await Matches.list();

      if (requestId !== loadRequestRef.current) return;

      const matchList = filterDeletedMatches(
        Array.isArray(data) ? data : []
      ).filter(
        match => !deletedIdsRef.current.has(String(match.id))
      );

      // Render the list immediately; do not wait for live details.
      applyMatches(matchList);

      const liveMatches = matchList.filter(
        match => match.status === 'live'
      );

      if (!liveMatches.length) return;

      const liveDetails = await Promise.all(
        liveMatches.map(async match => {
          try {
            const detail = await Matches.get(match.id);
            const detailedMatch = detail?.match || detail || {};

            return {
              ...match,
              ...detailedMatch,
              id: match.id,
              innings: Array.isArray(detail?.innings)
                ? detail.innings
                : Array.isArray(detailedMatch?.innings)
                  ? detailedMatch.innings
                  : Array.isArray(match.innings)
                    ? match.innings
                    : [],
              players: Array.isArray(detail?.players)
                ? detail.players
                : Array.isArray(detailedMatch?.players)
                  ? detailedMatch.players
                  : [],
            };
          } catch (error) {
            console.warn(
              `Unable to load details for match ${match.id}:`,
              error
            );
            return match;
          }
        })
      );

      if (requestId !== loadRequestRef.current) return;

      const detailMap = new Map(
        liveDetails.map(match => [String(match.id), match])
      );

      setMatches(current => {
        const updated = filterDeletedMatches(current)
          .filter(
            match => !deletedIdsRef.current.has(String(match.id))
          )
          .map(match => {
            const detail = detailMap.get(String(match.id));

            // Never let an old detail request revive a match
            // or overwrite its latest status.
            if (!detail || match.status !== 'live') return match;

            return {
              ...detail,
              ...match,
              innings:
                Array.isArray(match.innings) &&
                match.innings.length > 0
                  ? match.innings
                  : detail.innings,
              players:
                Array.isArray(match.players)
                  ? match.players
                  : detail.players,
            };
          });

        writeMatchesCache(updated);
        return updated;
      });
    } catch (error) {
      console.error('Failed to load matches:', error);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [applyMatches]);

  useEffect(() => {
    void loadMatches();

    return () => {
      // Invalidate outstanding list/detail requests on unmount.
      ++loadRequestRef.current;
    };
  }, [loadMatches]);

  // Listen for match-level changes so status transitions can
  // trigger a refresh. Score cards themselves update by socket.
  useEffect(() => {
    const refresh = () => {
      void loadMatches();
    };

    socket.on('match-update', refresh);
    socket.on('match-created', refresh);
    socket.on('match-deleted', refresh);

    return () => {
      socket.off('match-update', refresh);
      socket.off('match-created', refresh);
      socket.off('match-deleted', refresh);
    };
  }, [loadMatches]);

  const deleteMatch = useCallback(async matchId => {
    if (
      matchId == null ||
      deletingIdRef.current != null
    ) {
      return;
    }

    const ok = window.confirm(
      'Delete this match permanently?\n\n' +
      'This will delete the match, innings, balls and full scorecard.\n\n' +
      'This action cannot be undone.'
    );

    if (!ok) return;

    deletingIdRef.current = matchId;
    setDeletingId(matchId);

    try {
      await Matches.remove(matchId);

      // Invalidate older requests before changing the cache.
      ++loadRequestRef.current;

      rememberDeletedMatch(matchId);
      deletedIdsRef.current.add(String(matchId));

      setMatches(current => {
        const next = current.filter(
          match => !sameId(match.id, matchId)
        );

        writeMatchesCache(next);
        return next;
      });

      // Reload after deletion without blocking the UI.
      void loadMatches();
    } catch (error) {
      showDeleteError(error);
    } finally {
      deletingIdRef.current = null;
      setDeletingId(null);
    }
  }, [loadMatches]);

  const downloadPdf = useCallback(async matchId => {
    await downloadMatchPdf(matchId);
  }, []);

  if (loading && matches.length === 0) {
    return (
      <>
        {showIntro && <HomeIntro onFinished={finishIntro} />}
        <HomeLoading />
      </>
    );
  }

  const liveMatches = matches.filter(
    match => match.status === 'live'
  );

  const others = matches.filter(
    match => match.status !== 'live'
  );

  const totalMatches = matches.length;
  const liveCount = liveMatches.length;

  const handleLiveDeleted = id => {
    ++loadRequestRef.current;

    rememberDeletedMatch(id);
    deletedIdsRef.current.add(String(id));

    setMatches(current => {
      const next = current.filter(
        match => !sameId(match.id, id)
      );

      writeMatchesCache(next);
      return next;
    });

    void loadMatches();
  };

  return (
    <>
      {showIntro && <HomeIntro onFinished={finishIntro} />}

      <div className="home-page fade-in mx-auto w-full max-w-3xl min-w-0 overflow-hidden pb-8">
        <div className="pointer-events-none fixed left-1/2 top-20 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-500/[0.025] blur-3xl" />

        {/* HEADER */}
        <div className="home-header mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="home-header-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-lg">
                🏏
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-black tracking-tight text-white">
                    Matches
                  </h1>

                  {liveCount > 0 && (
                    <span className="hidden xs:inline-flex items-center gap-1 rounded-full border border-red-500/15 bg-red-500/5 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      LIVE
                    </span>
                  )}
                </div>

                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-600">
                  {totalMatches === 0
                    ? 'Start your first match'
                    : `${totalMatches} match${totalMatches === 1 ? '' : 'es'} • Scores & records`}
                </p>
              </div>
            </div>
          </div>

          <Link
            to="/create-match"
            className="home-new-match group/new relative flex min-h-[40px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white px-3.5 text-[11px] font-black text-slate-950"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-10 w-6 rotate-[20deg] bg-white/70 blur-sm transition-transform duration-500 group-hover/new:translate-x-32" />
            <span className="relative z-10">+ New Match</span>
          </Link>
        </div>

        {/* LIVE MATCHES */}
        {liveMatches.length > 0 && (
          <section className="mb-6 animate-[homeSectionIn_0.4s_ease-out_both]">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Live now
                </h2>
              </div>

              <span className="rounded-full border border-red-500/10 bg-red-500/5 px-2 py-0.5 text-[9px] font-bold text-red-400">
                {liveCount}
              </span>
            </div>

            {liveMatches.map(match => (
              <LiveHero
                key={match.id}
                match={match}
                onDeleted={handleLiveDeleted}
              />
            ))}
          </section>
        )}

        {/* EMPTY STATE */}
        {matches.length === 0 && (
          <div className="group/empty relative overflow-hidden rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-10 text-center animate-[homeSectionIn_0.45s_ease-out_both]">
            <div className="pointer-events-none absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl" />

            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/10 bg-emerald-500/5 text-4xl animate-[homeFloat_2.5s_ease-in-out_infinite]">
              🏏
            </div>

            <h2 className="relative mt-4 text-base font-black text-white">
              No matches yet
            </h2>

            <p className="relative mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-slate-600">
              Create your first scoreboard to start recording a match.
            </p>

            <Link
              to="/create-match"
              className="home-new-match group/create relative mt-5 inline-flex min-h-[42px] items-center justify-center overflow-hidden rounded-xl bg-white px-5 text-[11px] font-black text-slate-950"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-8 w-6 rotate-[20deg] bg-white/70 blur-sm transition-transform duration-500 group-hover/create:translate-x-32" />
              <span className="relative z-10">+ Create Match</span>
            </Link>
          </div>
        )}

        {/* OTHER MATCHES */}
        {others.length > 0 && (
          <section>
            <div className="mb-2.5 flex items-center justify-between animate-[homeSectionIn_0.4s_ease-out_both]">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                All matches
              </h2>

              <span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[9px] font-bold text-slate-500">
                {others.length}
              </span>
            </div>

            <div className="grid gap-2">
              {others.map((match, index) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={index}
                  onDelete={deleteMatch}
                  onDownload={downloadPdf}
                  deletingId={deletingId}
                />
              ))}
            </div>
          </section>
        )}

        {/* FOOTER */}
        {matches.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-2 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-700">
            <span>🏏</span>
            GCC Cricket
            <span>•</span>
            Live scoring
          </div>
        )}
      </div>

      {/* HOME EFFECTS */}
      <style>{`
        .home-page {position:relative}
        .home-header {animation:homeSectionIn .35s ease-out both}
        .home-header-icon {
          transition:transform 220ms ease,border-color 220ms ease,
          background-color 220ms ease;
        }
        .home-header-icon:hover {
          transform:translateY(-2px) rotate(4deg) scale(1.04);
          border-color:rgba(16,185,129,.35);
          background-color:rgba(16,185,129,.15);
        }
        .home-new-match {
          transition:transform 180ms ease,box-shadow 180ms ease,
          background-color 180ms ease;
        }
        .home-new-match:hover {
          transform:translateY(-2px);
          box-shadow:0 10px 25px rgba(255,255,255,.07);
        }
        .home-new-match:active {transform:translateY(0) scale(.96)}
        .home-action {
          transition:transform 150ms ease,background-color 150ms ease,
          color 150ms ease,border-color 150ms ease;
        }
        .home-action:hover {
          transform:translateY(-1px);
          background-color:rgb(51,65,85);
          color:white;
        }
        .home-action:active {transform:scale(.96)}
        .match-card {
          transition:transform 220ms ease,border-color 220ms ease,
          background-color 220ms ease,box-shadow 220ms ease;
        }
        .match-card:hover {
          transform:translateY(-2px);
          border-color:rgb(51,65,85);
          background-color:rgba(15,23,42,.95);
          box-shadow:0 12px 28px rgba(0,0,0,.18);
        }
        .live-card {
          transition:transform 220ms ease,border-color 220ms ease,
          box-shadow 220ms ease;
        }
        .live-card:hover {
          transform:translateY(-2px);
          border-color:rgba(239,68,68,.38);
          box-shadow:0 14px 32px rgba(127,29,29,.18);
        }
        .score-pop {animation:scorePop .42s cubic-bezier(.2,.8,.2,1)}
        @keyframes scorePop {
          0% {transform:scale(1)}
          45% {transform:scale(1.06)}
          100% {transform:scale(1)}
        }
        @keyframes homeCardIn {
          from {opacity:0;transform:translateY(10px)}
          to {opacity:1;transform:translateY(0)}
        }
        @keyframes homeSectionIn {
          from {opacity:0;transform:translateY(8px)}
          to {opacity:1;transform:translateY(0)}
        }
        @keyframes homeFloat {
          0%,100% {transform:translateY(0)}
          50% {transform:translateY(-5px)}
        }
        @media (prefers-reduced-motion:reduce) {
          .home-header,.match-card,.live-card,.score-pop,
          .home-page *,.home-page::before,.home-page::after {
            animation:none!important;
            transition:none!important;
          }
        }
        @media (max-width:420px) {
          .home-new-match {padding-left:11px;padding-right:11px}
        }
      `}</style>
    </>
  );
}
