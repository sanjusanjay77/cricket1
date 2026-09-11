import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

const statusBadge = {
  upcoming: 'bg-yellow-600',
  live: 'bg-red-600',
  'innings-break': 'bg-orange-600',
  completed: 'bg-slate-600',
};

/* -------------------------------------------------------
   LIVE MATCH HERO
------------------------------------------------------- */

function LiveHero({ matchId, onDelete }) {
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    Matches.get(matchId)
      .then(setData)
      .catch((err) => {
        console.error('Failed to load live match:', err);
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

  const handleDelete = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(
      'Delete this LIVE match permanently?\n\nThis will remove the match from the scoreboard.'
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await Matches.remove(matchId);
      onDelete(matchId);
    } catch (err) {
      console.error('Failed to delete live match:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to delete match'
      );

      setDeleting(false);
    }
  };

  const handleDownload = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDownloading(true);

    try {
      /*
       * Fetch the latest complete match data.
       * This is important because the Home page only has
       * a small match object initially.
       */
      const latest = await Matches.get(matchId);

      if (!latest) {
        throw new Error('Match data not available');
      }

      setData(latest);

      exportMatchPdf({
        match: latest.match,
        innings: latest.innings || [],
        players: latest.players || [],
      });
    } catch (err) {
      console.error('Failed to generate PDF:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to generate PDF'
      );
    } finally {
      setDownloading(false);
    }
  };

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

  return (
    <div className="card border-red-600/50 hover:border-red-500 fade-in mb-6 relative overflow-hidden">

      {/* CLICKABLE SCORE AREA */}
      <Link
        to={`/match/${matchId}/live`}
        className="block"
      >
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-live" />

          <span className="text-xs font-bold text-red-400 tracking-wider">
            LIVE
          </span>
        </div>

        <div className="text-sm text-slate-400 mb-1 pr-16">
          {match.team1_short} vs {match.team2_short} ·{' '}
          {match.overs_limit} overs
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">
              {battingShort} batting
            </div>

            <div className="text-4xl font-extrabold tracking-tight">
              {innings.innings.total_runs}

              <span className="text-slate-400">
                /{innings.innings.total_wickets}
              </span>
            </div>
          </div>

          <div className="text-slate-400 pb-1.5 text-sm">
            {innings.overs} overs · RR {innings.runRate}

            {innings.innings.target && (
              <span>
                {' '}
                · Target {innings.innings.target}
              </span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-2">
          {battingTeam} — tap for the full live scoreboard →
        </div>
      </Link>

      {/* LIVE MATCH ACTIONS */}
      <div className="mt-3 pt-3 border-t border-slate-700 flex justify-end gap-2 flex-wrap">

        <Link
          to={`/match/${matchId}/live`}
          className="btn btn-secondary text-sm"
        >
          View
        </Link>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn btn-secondary text-sm disabled:opacity-50"
        >
          {downloading
            ? 'Generating PDF...'
            : '⬇ PDF'}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn btn-danger text-sm disabled:opacity-50"
        >
          {deleting
            ? 'Deleting…'
            : '🗑 Delete'}
        </button>

      </div>
    </div>
  );
}

/* -------------------------------------------------------
   HOME PAGE
------------------------------------------------------- */

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    Matches.list()
      .then(setMatches)
      .catch((err) => {
        console.error('Failed to load matches:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  /* -----------------------------------------------------
     DELETE MATCH
  ----------------------------------------------------- */

  const deleteMatch = async (matchId) => {
    const confirmed = window.confirm(
      'Delete this match permanently?\n\nThis action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingId(matchId);

    try {
      await Matches.remove(matchId);

      setMatches((current) =>
        current.filter(
          (match) => match.id !== matchId
        )
      );
    } catch (err) {
      console.error('Failed to delete match:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to delete match'
      );
    } finally {
      setDeletingId(null);
    }
  };

  /* -----------------------------------------------------
     DOWNLOAD PDF
  ----------------------------------------------------- */

  const downloadMatchPdf = async (match) => {
    setDownloadingId(match.id);

    try {
      /*
       * Get the complete match data.
       * This gives exportMatchPdf the same data
       * it receives on LiveScoreboard.jsx.
       */
      const detail = await Matches.get(match.id);

      if (!detail) {
        throw new Error('Match data not available');
      }

      exportMatchPdf({
        match: detail.match,
        innings: detail.innings || [],
        players: detail.players || [],
      });
    } catch (err) {
      console.error('Failed to generate PDF:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to generate PDF'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  /* -----------------------------------------------------
     REMOVE LIVE MATCH AFTER DELETE
  ----------------------------------------------------- */

  const removeLiveMatchFromList = (matchId) => {
    setMatches((current) =>
      current.filter(
        (match) => match.id !== matchId
      )
    );
  };

  /* -----------------------------------------------------
     LOADING
  ----------------------------------------------------- */

  if (loading) {
    return (
      <p className="text-slate-400">
        Loading matches…
      </p>
    );
  }

  /* -----------------------------------------------------
     FILTER MATCHES
  ----------------------------------------------------- */

  const liveMatches = matches.filter(
    (m) => m.status === 'live'
  );

  const others = matches.filter(
    (m) => m.status !== 'live'
  );

  /* -----------------------------------------------------
     PAGE
  ----------------------------------------------------- */

  return (
    <div className="fade-in">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          Matches
        </h1>

        <Link
          to="/create-match"
          className="btn btn-primary text-sm"
        >
          + New Scoreboard
        </Link>
      </div>

      {/* LIVE MATCHES */}
      {liveMatches.map((m) => (
        <LiveHero
          key={m.id}
          matchId={m.id}
          onDelete={removeLiveMatchFromList}
        />
      ))}

      {/* NO MATCHES */}
      {matches.length === 0 && (
        <div className="card text-center text-slate-400">
          No matches yet. Create teams first, then start a new scoreboard.
        </div>
      )}

      {/* OTHER MATCHES */}
      <div className="grid gap-3">

        {others.map((m) => (
          <div
            key={m.id}
            className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >

            {/* MATCH INFORMATION */}
            <div>

              <div className="flex items-center gap-2 flex-wrap">

                <span className="font-semibold">
                  {m.team1_short}
                </span>

                <span className="text-slate-400">
                  vs
                </span>

                <span className="font-semibold">
                  {m.team2_short}
                </span>

                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    statusBadge[m.status] ||
                    'bg-slate-600'
                  }`}
                >
                  {m.status}
                </span>

              </div>

              <div className="text-sm text-slate-400">
                {m.overs_limit} overs
              </div>

              {m.result_text && (
                <div className="text-emerald-400 text-sm mt-1">
                  {m.result_text}
                </div>
              )}

            </div>

            {/* ACTION BUTTONS */}
            <div className="flex gap-2 flex-wrap">

              {/* START TOSS */}
              {m.status === 'upcoming' && (
                <Link
                  to={`/match/${m.id}/setup`}
                  className="btn btn-secondary text-sm"
                >
                  Start Toss
                </Link>
              )}

              {/* CONTINUE */}
              {m.status === 'innings-break' && (
                <Link
                  to={`/match/${m.id}/score`}
                  className="btn btn-primary text-sm"
                >
                  Continue
                </Link>
              )}

              {/* VIEW */}
              <Link
                to={`/match/${m.id}/live`}
                className="btn btn-secondary text-sm"
              >
                View
              </Link>

              {/* PDF */}
              <button
                type="button"
                onClick={() =>
                  downloadMatchPdf(m)
                }
                disabled={
                  downloadingId === m.id
                }
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                {downloadingId === m.id
                  ? 'Generating...'
                  : '⬇ PDF'}
              </button>

              {/* DELETE */}
              <button
                type="button"
                onClick={() =>
                  deleteMatch(m.id)
                }
                disabled={
                  deletingId === m.id
                }
                className="btn btn-danger text-sm disabled:opacity-50"
              >
                {deletingId === m.id
                  ? 'Deleting…'
                  : '🗑 Delete'}
              </button>

            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
