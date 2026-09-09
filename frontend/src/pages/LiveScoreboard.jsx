import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

function playerName(players, id) {
  return players.find(p => p.id === id)?.name || '—';
}

function BallPill({ ball, index }) {
  let label = String(ball.runs_batsman);
  let cls = 'bg-slate-700';
  if (ball.is_wicket) { label = 'W'; cls = 'bg-red-600'; }
  else if (ball.extra_type === 'wide') { label = `Wd${ball.extra_runs > 1 ? '+' + (ball.extra_runs - 1) : ''}`; cls = 'bg-yellow-600'; }
  else if (ball.extra_type === 'noball') { label = `Nb${ball.runs_batsman ? '+' + ball.runs_batsman : ''}`; cls = 'bg-orange-600'; }
  else if (ball.extra_type === 'bye') { label = `${ball.extra_runs}B`; cls = 'bg-blue-600'; }
  else if (ball.extra_type === 'legbye') { label = `${ball.extra_runs}Lb`; cls = 'bg-blue-800'; }
  else if (ball.runs_batsman === 4) cls = 'bg-emerald-600';
  else if (ball.runs_batsman === 6) cls = 'bg-purple-600';
  return (
    <span className={`ball-pop w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${cls}`}
      style={{ animationDelay: `${index * 25}ms` }}>
      {label}
    </span>
  );
}

export default function LiveScoreboard() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState(0);
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastBallId = useRef(null);
  const boundaryTimer = useRef(null);

  const load = useCallback(() => { Matches.get(matchId).then(d => { setDetail(d); setTab(d.innings.length - 1); }); }, [matchId]);
  useEffect(() => { load(); }, [load]);

  const detectEffects = (inningsList, activeTab) => {
    const cur = inningsList[activeTab];
    if (!cur || !cur.recentBalls?.length) return;
    const newest = cur.recentBalls[cur.recentBalls.length - 1];
    if (lastBallId.current && newest.id !== lastBallId.current) {
      if (newest.is_wicket) { setFlashWicket(true); setTimeout(() => setFlashWicket(false), 600); }
      else if (!newest.extra_type && newest.runs_batsman === 4) { clearTimeout(boundaryTimer.current); setBoundary('four'); boundaryTimer.current = setTimeout(() => setBoundary(null), 1100); }
      else if (!newest.extra_type && newest.runs_batsman === 6) { clearTimeout(boundaryTimer.current); setBoundary('six'); boundaryTimer.current = setTimeout(() => setBoundary(null), 1100); }
    }
    lastBallId.current = newest.id;
  };

  useEffect(() => {
    socket.emit('join-match', matchId);
    // Apply the pushed payload directly (no re-fetch) so updates land instantly.
    const onUpdate = ({ match, innings }) => {
      setDetail(d => {
        if (!d) return d;
        const nextTab = innings.length - 1;
        detectEffects(innings, nextTab);
        return { ...d, match, innings };
      });
      setTab(t => innings.length - 1);
    };
    socket.on('score-update', onUpdate);
    return () => { socket.emit('leave-match', matchId); socket.off('score-update', onUpdate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (!detail) return <p className="text-slate-400">Loading…</p>;
  const { match, players } = detail;
  const inningsList = detail.innings;
  const current = inningsList[tab];
  if (!current) return <p className="text-slate-400">Match not started yet.</p>;
  const { innings, battingCard, bowlingCard, recentBalls, overs, runRate } = current;

  const deleteMatch = async () => {
    if (!confirm('Delete this match permanently? This removes its full scorecard and cannot be undone.')) return;
    setDeleting(true);
    try {
      await Matches.remove(matchId);
      navigate('/');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 fade-in relative">
      {boundary && (
        <div className="boundary-overlay">
          <div className={`boundary-text boundary-${boundary}`}>{boundary === 'six' ? 'SIX! 🚀' : 'FOUR! 🔥'}</div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">{match.team1_name} vs {match.team2_name}</h1>
            <p className="text-sm text-slate-400">{match.overs_limit}-over match</p>
          </div>
          {match.status === 'live' && <Link to={`/match/${matchId}/score`} className="btn btn-primary text-sm">Scorer</Link>}
          {match.status === 'completed' && (
            <div className="flex gap-2">
              <button className="btn btn-secondary text-sm" onClick={() => exportMatchPdf({ match, innings: inningsList, players })}>
                ⬇ PDF
              </button>
              <button className="btn btn-danger text-sm" disabled={deleting} onClick={deleteMatch}>
                {deleting ? 'Deleting…' : '🗑 Delete'}
              </button>
            </div>
          )}
        </div>
        {match.result_text && <p className="text-emerald-400 font-semibold mt-2">🏆 {match.result_text}</p>}
      </div>

      {inningsList.length > 1 && (
        <div className="flex gap-2">
          {inningsList.map((i, idx) => (
            <button key={idx} onClick={() => setTab(idx)}
              className={`btn text-sm ${tab === idx ? 'btn-primary' : 'btn-secondary'}`}>
              Innings {idx + 1}
            </button>
          ))}
        </div>
      )}

      <div className={`card ${flashWicket ? 'wicket-flash' : ''}`}>
        {match.status === 'live' && tab === inningsList.length - 1 && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500 pulse-live" />
            <span className="text-xs font-bold text-red-400 tracking-wide">LIVE</span>
          </div>
        )}
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">{innings.total_runs}<span className="text-slate-400">/{innings.total_wickets}</span></div>
        <div className="text-slate-400 text-sm sm:text-base">{overs} overs · RR {runRate}{innings.target ? ` · Target ${innings.target}` : ''}</div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {recentBalls.map((b, idx) => <BallPill key={b.id} ball={b} index={idx} />)}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-2">Batting</h2>
        <table className="w-full text-sm min-w-[420px]">
          <thead className="text-slate-400 text-left">
            <tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th></tr>
          </thead>
          <tbody>
            {battingCard.map(b => (
              <tr key={b.player_id} className={`border-t border-slate-700/70 ${!b.is_out && (b.player_id === innings.striker_id || b.player_id === innings.non_striker_id) ? 'text-emerald-400' : ''}`}>
                <td className="py-1.5">{playerName(players, b.player_id)}{b.player_id === innings.striker_id ? ' *' : ''}</td>
                <td>{b.runs}</td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.strike_rate}</td>
                <td className="text-slate-400">{b.is_out ? `${b.how_out}${b.fielder_id ? ' (' + playerName(players, b.fielder_id) + ')' : ''}` : 'not out'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-sm text-slate-400 mt-2">
          Extras: {innings.extras_wide + innings.extras_noball + innings.extras_bye + innings.extras_legbye + innings.extras_penalty}
          {' '}(wd {innings.extras_wide}, nb {innings.extras_noball}, b {innings.extras_bye}, lb {innings.extras_legbye})
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-2">Bowling</h2>
        <table className="w-full text-sm min-w-[380px]">
          <thead className="text-slate-400 text-left">
            <tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>
          </thead>
          <tbody>
            {bowlingCard.map(b => (
              <tr key={b.player_id} className={`border-t border-slate-700/70 ${b.player_id === innings.current_bowler_id ? 'text-emerald-400' : ''}`}>
                <td className="py-1.5">{playerName(players, b.player_id)}</td>
                <td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs}</td><td>{b.wickets}</td><td>{b.economy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
