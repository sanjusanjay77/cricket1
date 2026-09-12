import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

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
   LIVE MATCH CARD
========================================================= */

function LiveHero({ matchId, onDeleted }) {
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    Matches.get(matchId)
      .then(setData)
      .catch((error) => {
        console.error('Failed to load live match:', error);
      });
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match, innings }) => {
      setData((current) =>
        current
          ? {
              ...current,
              match,
              innings,
            }
          : current
      );
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  if (!data) return null;

  const { match } = data;

  const innings =
    data.innings?.[data.innings.length - 1];

  if (!innings) return null;

  const battingTeam =
    innings.innings.batting_team_id === match.team1_id
      ? match.team1_name
      : match.team2_name;

  const battingShort =
    innings.innings.batting_team_id === match.team1_id
      ? match.team1_short
      : match.team2_short;

  const downloadPdf = () => {
    try {
      exportMatchPdf({
        match: data.match,
        innings: data.innings || [],
        players: data.players || [],
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Unable to create PDF. Please try again.');
    }
  };

  const deleteMatch = async () => {
    const ok = window.confirm(
      'Delete this match permanently? This removes its full scorecard and cannot be undone.'
    );

    if (!ok) return;

    setDeleting(true);

    try {
      await Matches.remove(matchId);
      onDeleted?.(matchId);
    } catch (error) {
      console.error('Delete match failed:', error);
      alert('Unable to delete this match.');
      setDeleting(false);
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-red-500/25 bg-slate-900 shadow-md shadow-black/10">

      {/* LIVE HEADER */}
      <Link
        to={`/match/${matchId}/live`}
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
            {match.overs_limit} overs
          </div>

        </div>

        {/* TEAMS */}
        <div className="px-3 pt-3">

          <div className="flex items-center justify-center gap-2">

            <div className="min-w-0 flex-1 text-right">

              <div className="truncate text-sm font-bold text-white">
                {match.team1_short}
              </div>

            </div>

            <div className="shrink-0 text-[9px] font-bold text-slate-600">
              VS
            </div>

            <div className="min-w-0 flex-1 text-left">

              <div className="truncate text-sm font-bold text-white">
                {match.team2_short}
              </div>

            </div>

          </div>

        </div>

        {/* SCORE AREA */}
        <div className="px-3 pb-3 pt-2 text-center">

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

        </div>

        {/* BATTING TEAM */}
        <div className="px-3 pb-3 text-center">

          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[9px] font-medium text-slate-500">
            {battingTeam}
          </span>

        </div>

      </Link>

      {/* ACTION BAR */}
      <div className="grid grid-cols-3 gap-1.5 border-t border-slate-800 p-2">

        <Link
          to={`/match/${matchId}/live`}
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700"
        >
          View
        </Link>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700"
          onClick={downloadPdf}
        >
          PDF
        </button>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-red-500/10 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting ? '...' : 'Delete'}
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
}) {
  const statusText =
    match.status === 'innings-break'
      ? 'Innings Break'
      : match.status;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">

      <div className="px-3 py-3">

        {/* TOP ROW */}
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

        {/* MATCH INFO */}
        <div className="mt-1 text-[10px] text-slate-600">
          {match.overs_limit} overs
        </div>

        {/* RESULT */}
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

      {/* BUTTONS */}
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
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
        >
          View
        </Link>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
          onClick={() => onDownload(match.id)}
        >
          PDF
        </button>

        <button
          type="button"
          className="flex min-h-[36px] items-center justify-center rounded-lg bg-red-500/10 text-[11px] font-semibold text-red-400 hover:bg-red-500/20"
          onClick={() => onDelete(match.id)}
        >
          Delete
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   HOME
========================================================= */

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(() => {
    setLoading(true);

    Matches.list()
      .then((data) => {
        setMatches(
          Array.isArray(data) ? data : []
        );
      })
      .catch((error) => {
        console.error(
          'Failed to load matches:',
          error
        );

        setMatches([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const deleteMatch = async (matchId) => {
    const ok = window.confirm(
      'Delete this match permanently? This removes its full scorecard and cannot be undone.'
    );

    if (!ok) return;

    try {
      await Matches.remove(matchId);

      setMatches((current) =>
        current.filter(
          (match) => match.id !== matchId
        )
      );
    } catch (error) {
      console.error(
        'Delete match failed:',
        error
      );

      alert('Unable to delete this match.');
    }
  };

  const downloadPdf = async (matchId) => {
    try {
      const detail =
        await Matches.get(matchId);

      exportMatchPdf({
        match: detail.match,
        innings: detail.innings || [],
        players: detail.players || [],
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

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">

        <div className="text-xs text-slate-500">
          Loading matches…
        </div>

      </div>
    );
  }

  const liveMatches = matches.filter(
    (m) => m.status === 'live'
  );

  const others = matches.filter(
    (m) => m.status !== 'live'
  );

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

          {liveMatches.map((match) => (
            <LiveHero
              key={match.id}
              matchId={match.id}
              onDeleted={(id) => {
                setMatches((current) =>
                  current.filter(
                    (match) =>
                      match.id !== id
                  )
                );
              }}
            />
          ))}

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

            {others.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onDelete={deleteMatch}
                onDownload={downloadPdf}
              />
            ))}

          </div>

        </section>
      )}

    </div>
  );
}
