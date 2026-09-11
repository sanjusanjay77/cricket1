import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

const statusBadge = {
  upcoming: 'bg-yellow-600',
  live: 'bg-red-600',
  'innings-break': 'bg-orange-600',
  completed: 'bg-slate-600',
};

function LiveHero({ matchId, onDeleted }) {
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    Matches.get(matchId).then(setData).catch(console.error);
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match, innings }) => {
      setData((d) => (d ? { ...d, match, innings } : d));
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  if (!data) return null;

  const { match } = data;
  const innings = data.innings?.[data.innings.length - 1];

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
    <div className="card border-red-600/50 hover:border-red-500 fade-in mb-6 relative overflow-hidden">
      <Link to={`/match/${matchId}/live`} className="block">
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-live" />
          <span className="text-xs font-bold text-red-400 tracking-wider">
            LIVE
          </span>
        </div>

        <div className="text-sm text-slate-400 mb-1">
          {match.team1_short} vs {match.team2_short} · {match.overs_limit} overs
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
              <span> · Target {innings.innings.target}</span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-2">
          {battingTeam} — tap for the full live scoreboard →
        </div>
      </Link>

      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-700">
        <Link
          to={`/match/${matchId}/live`}
          className="btn btn-secondary text-sm"
        >
          View
        </Link>

        <button
          type="button"
          className="btn btn-secondary text-sm"
          onClick={downloadPdf}
        >
          ⬇ PDF
        </button>

        <button
          type="button"
          className="btn btn-danger text-sm"
          disabled={deleting}
          onClick={deleteMatch}
        >
          {deleting ? 'Deleting…' : '🗑 Delete'}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      // Get the complete match data.
      // Matches.list() normally contains only match summary information.
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
    return <p className="text-slate-400">Loading matches…</p>;
  }

  const liveMatches = matches.filter((m) => m.status === 'live');
  const others = matches.filter((m) => m.status !== 'live');

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Matches</h1>

        <Link
          to="/create-match"
          className="btn btn-primary text-sm"
        >
          + New Scoreboard
        </Link>
      </div>

      {liveMatches.map((m) => (
        <LiveHero
          key={m.id}
          matchId={m.id}
          onDeleted={(id) => {
            setMatches((current) =>
              current.filter((match) => match.id !== id)
            );
          }}
        />
      ))}

      {matches.length === 0 && (
        <div className="card text-center text-slate-400">
          No matches yet. Create teams first, then start a new scoreboard.
        </div>
      )}

      <div className="grid gap-3">
        {others.map((m) => (
          <div
            key={m.id}
            className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">
                  {m.team1_short}
                </span>

                <span className="text-slate-400">vs</span>

                <span className="font-semibold">
                  {m.team2_short}
                </span>

                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    statusBadge[m.status] || 'bg-slate-600'
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

            <div className="flex gap-2 flex-wrap">
              {m.status === 'upcoming' && (
                <Link
                  to={`/match/${m.id}/setup`}
                  className="btn btn-secondary text-sm"
                >
                  Start Toss
                </Link>
              )}

              {m.status === 'innings-break' && (
                <Link
                  to={`/match/${m.id}/score`}
                  className="btn btn-primary text-sm"
                >
                  Continue
                </Link>
              )}

              <Link
                to={`/match/${m.id}/live`}
                className="btn btn-secondary text-sm"
              >
                View
              </Link>

              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => downloadPdf(m.id)}
              >
                ⬇ PDF
              </button>

              <button
                type="button"
                className="btn btn-danger text-sm"
                onClick={() => deleteMatch(m.id)}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
