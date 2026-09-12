import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

const statusBadge = {
  upcoming: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  live: 'bg-red-500/15 text-red-400 border border-red-500/30',
  'innings-break':
    'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  completed:
    'bg-slate-500/15 text-slate-300 border border-slate-500/30',
};

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
    <div className="mb-5 overflow-hidden rounded-2xl border border-red-500/30 bg-slate-900/90 shadow-lg shadow-red-950/20">

      {/* LIVE TOP BAR */}
      <Link
        to={`/match/${matchId}/live`}
        className="block active:scale-[0.99] transition-transform"
      >
        <div className="border-b border-slate-700/70 px-4 py-3 sm:px-5">

          <div className="flex items-center justify-between gap-3">

            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>

                <span className="text-xs font-bold uppercase tracking-widest text-red-400">
                  Live
                </span>

              </div>

            </div>

            <span className="text-xs text-slate-500">
              Tap to view →
            </span>

          </div>

        </div>

        {/* TEAMS */}
        <div className="px-4 pt-4 sm:px-5">

          <div className="flex items-center justify-center gap-3 sm:gap-5">

            <div className="min-w-0 flex-1 text-right">

              <div className="truncate text-base font-bold text-white sm:text-lg">
                {match.team1_short}
              </div>

              <div className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
                {match.team1_name}
              </div>

            </div>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-500 ring-1 ring-slate-700">
              VS
            </div>

            <div className="min-w-0 flex-1 text-left">

              <div className="truncate text-base font-bold text-white sm:text-lg">
                {match.team2_short}
              </div>

              <div className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
                {match.team2_name}
              </div>

            </div>

          </div>

        </div>

        {/* SCORE */}
        <div className="px-4 pb-5 pt-4 sm:px-5">

          <div className="text-center">

            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {battingTeam} batting
            </div>

            <div className="mt-1 text-5xl font-black tracking-tight text-white sm:text-6xl">
              {innings.innings.total_runs}
              <span className="text-slate-500">
                /{innings.innings.total_wickets}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-400">
              <span>{innings.overs} overs</span>
              <span className="text-slate-600">•</span>
              <span>RR {innings.runRate}</span>
            </div>

            {innings.innings.target && (
              <div className="mt-2 inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                Target {innings.innings.target}
              </div>
            )}

          </div>

        </div>

      </Link>

      {/* ACTION BUTTONS */}
      <div className="grid grid-cols-3 gap-2 border-t border-slate-700/70 p-3 sm:flex sm:gap-2">

        <Link
          to={`/match/${matchId}/live`}
          className="btn btn-primary min-h-[42px] justify-center text-xs sm:text-sm"
        >
          📺 View
        </Link>

        <button
          type="button"
          className="btn btn-secondary min-h-[42px] justify-center text-xs sm:text-sm"
          onClick={downloadPdf}
        >
          ⬇ PDF
        </button>

        <button
          type="button"
          className="btn btn-danger min-h-[42px] justify-center text-xs sm:text-sm"
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting ? 'Deleting…' : '🗑 Delete'}
        </button>

      </div>

    </div>
  );
}

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
    <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/70 shadow-sm transition hover:border-slate-600">

      {/* MAIN CARD */}
      <div className="p-4 sm:p-5">

        {/* TOP */}
        <div className="flex items-start justify-between gap-3">

          <div className="min-w-0 flex-1">

            <div className="flex flex-wrap items-center gap-2">

              <span className="text-base font-bold text-white sm:text-lg">
                {match.team1_short}
              </span>

              <span className="text-xs font-medium text-slate-500">
                VS
              </span>

              <span className="text-base font-bold text-white sm:text-lg">
                {match.team2_short}
              </span>

            </div>

            <div className="mt-1 text-xs text-slate-500">
              {match.overs_limit} overs
            </div>

          </div>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              statusBadge[match.status] ||
              statusBadge.completed
            }`}
          >
            {statusText}
          </span>

        </div>

        {/* RESULT */}
        {match.result_text && (
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">

            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Result
            </div>

            <div className="mt-0.5 text-sm font-semibold text-emerald-400">
              🏆 {match.result_text}
            </div>

          </div>
        )}

      </div>

      {/* ACTIONS */}
      <div className="grid grid-cols-2 gap-2 border-t border-slate-700/70 p-3 sm:flex">

        {match.status === 'upcoming' && (
          <Link
            to={`/match/${match.id}/setup`}
            className="btn btn-primary min-h-[42px] justify-center text-xs sm:text-sm"
          >
            🏏 Start Toss
          </Link>
        )}

        {match.status === 'innings-break' && (
          <Link
            to={`/match/${match.id}/score`}
            className="btn btn-primary min-h-[42px] justify-center text-xs sm:text-sm"
          >
            ▶ Continue
          </Link>
        )}

        <Link
          to={`/match/${match.id}/live`}
          className="btn btn-secondary min-h-[42px] justify-center text-xs sm:text-sm"
        >
          📺 View
        </Link>

        <button
          type="button"
          className="btn btn-secondary min-h-[42px] justify-center text-xs sm:text-sm"
          onClick={() => onDownload(match.id)}
        >
          ⬇ PDF
        </button>

        <button
          type="button"
          className="btn btn-danger min-h-[42px] justify-center text-xs sm:text-sm"
          onClick={() => onDelete(match.id)}
        >
          🗑 Delete
        </button>

      </div>

    </div>
  );
}

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(() => {
    setLoading(true);

    Matches.list()
      .then((data) => {
        setMatches(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error('Failed to load matches:', error);
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
        current.filter((match) => match.id !== matchId)
      );
    } catch (error) {
      console.error('Delete match failed:', error);
      alert('Unable to delete this match.');
    }
  };

  const downloadPdf = async (matchId) => {
    try {
      const detail = await Matches.get(matchId);

      exportMatchPdf({
        match: detail.match,
        innings: detail.innings || [],
        players: detail.players || [],
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Unable to create PDF. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">
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
    <div className="fade-in mx-auto w-full max-w-4xl pb-6">

      {/* PAGE HEADER */}
      <div className="mb-5">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Matches
            </h1>

            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Live scores and match records
            </p>

          </div>

          <Link
            to="/create-match"
            className="btn btn-primary min-h-[44px] w-full justify-center text-sm sm:w-auto"
          >
            + New Scoreboard
          </Link>

        </div>

      </div>

      {/* LIVE MATCHES */}
      {liveMatches.length > 0 && (
        <section className="mb-6">

          <div className="mb-3 flex items-center gap-2">

            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>

            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
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
                    (match) => match.id !== id
                  )
                );
              }}
            />
          ))}

        </section>
      )}

      {/* EMPTY STATE */}
      {matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-5 py-10 text-center">

          <div className="text-4xl">
            🏏
          </div>

          <h2 className="mt-3 font-semibold text-white">
            No matches yet
          </h2>

          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Create your first scoreboard to start recording a match.
          </p>

          <Link
            to="/create-match"
            className="btn btn-primary mt-5 min-h-[44px] justify-center"
          >
            + Create Scoreboard
          </Link>

        </div>
      )}

      {/* OTHER MATCHES */}
      {others.length > 0 && (
        <section>

          <div className="mb-3 flex items-center justify-between">

            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              All matches
            </h2>

            <span className="text-xs text-slate-500">
              {others.length}
            </span>

          </div>

          <div className="grid gap-3">

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
