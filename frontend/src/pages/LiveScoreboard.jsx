
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

function playerName(players, id) {
  return players.find((p) => p.id === id)?.name || '—';
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

  const load = useCallback(() => {
    Matches.get(matchId)
      .then((d) => {
        setDetail(d);
        setTab(Math.max(0, d.innings.length - 1));
      })
      .catch((error) => {
        console.error('Failed to load match:', error);
      });
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  const detectEffects = useCallback((inningsList, activeTab) => {
    const cur = inningsList[activeTab];

    if (!cur || !cur.recentBalls?.length) return;

    const newest =
      cur.recentBalls[cur.recentBalls.length - 1];

    if (
      lastBallId.current &&
      newest.id !== lastBallId.current
    ) {
      if (newest.is_wicket) {
        setFlashWicket(true);

        setTimeout(() => {
          setFlashWicket(false);
        }, 600);
      } else if (
        !newest.extra_type &&
        newest.runs_batsman === 4
      ) {
        clearTimeout(boundaryTimer.current);

        setBoundary('four');

        boundaryTimer.current = setTimeout(() => {
          setBoundary(null);
        }, 1100);
      } else if (
        !newest.extra_type &&
        newest.runs_batsman === 6
      ) {
        clearTimeout(boundaryTimer.current);

        setBoundary('six');

        boundaryTimer.current = setTimeout(() => {
          setBoundary(null);
        }, 1100);
      }
    }

    lastBallId.current = newest.id;
  }, []);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match, innings }) => {
      setDetail((d) => {
        if (!d) return d;

        const nextTab = Math.max(0, innings.length - 1);

        detectEffects(innings, nextTab);

        return {
          ...d,
          match,
          innings,
        };
      });

      setTab(Math.max(0, innings.length - 1));
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId, detectEffects]);

  if (!detail) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const { match, players = [] } = detail;
  const inningsList = detail.innings || [];
  const current = inningsList[tab];

  if (!current) {
    return (
      <p className="text-slate-400">
        Match not started yet.
      </p>
    );
  }

  const {
    innings,
    battingCard = [],
    bowlingCard = [],
    partnerships = [],
    fallOfWickets = [],
    overs,
    runRate,
  } = current;

  const deleteMatch = async () => {
    if (
      !window.confirm(
        'Delete this match permanently? This removes its full scorecard and cannot be undone.'
      )
    ) {
      return;
    }

    setDeleting(true);

    try {
      await Matches.remove(matchId);
      navigate('/');
    } catch (error) {
      console.error('Delete match failed:', error);
      alert('Unable to delete this match.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 fade-in relative">

      {/* =====================================================
          BOUNDARY ANIMATION
      ====================================================== */}
      {boundary && (
        <div className="boundary-overlay">
          <div
            className={`boundary-text boundary-${boundary}`}
          >
            {boundary === 'six'
              ? 'SIX! 🚀'
              : 'FOUR! 🔥'}
          </div>
        </div>
      )}

      {/* =====================================================
          MATCH HEADER
      ====================================================== */}
      <div className="card">
        <div className="flex justify-between items-start flex-wrap gap-2">

          <div>
            <h1 className="text-lg sm:text-xl font-bold">
              {match.team1_name} vs {match.team2_name}
            </h1>

            <p className="text-sm text-slate-400">
              {match.overs_limit}-over match
            </p>
          </div>

          {match.status === 'live' && (
            <Link
              to={`/match/${matchId}/score`}
              className="btn btn-primary text-sm"
            >
              Scorer
            </Link>
          )}

          {match.status === 'completed' && (
            <div className="flex gap-2">

              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  exportMatchPdf({
                    match,
                    innings: inningsList,
                    players,
                  })
                }
              >
                ⬇ PDF
              </button>

              <button
                type="button"
                className="btn btn-danger text-sm"
                disabled={deleting}
                onClick={deleteMatch}
              >
                {deleting
                  ? 'Deleting…'
                  : '🗑 Delete'}
              </button>

            </div>
          )}
        </div>

        {match.result_text && (
          <p className="text-emerald-400 font-semibold mt-2">
            🏆 {match.result_text}
          </p>
        )}
      </div>

      {/* =====================================================
          INNINGS TABS
      ====================================================== */}
      {inningsList.length > 1 && (
        <div className="flex gap-2 flex-wrap">

          {inningsList.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setTab(index)}
              className={`btn text-sm ${
                tab === index
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              Innings {index + 1}
            </button>
          ))}

        </div>
      )}

      {/* =====================================================
          SCORE
      ====================================================== */}
      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >

        {match.status === 'live' &&
          tab === inningsList.length - 1 && (
            <div className="flex items-center gap-1.5 mb-1">

              <span className="w-2 h-2 rounded-full bg-red-500 pulse-live" />

              <span className="text-xs font-bold text-red-400 tracking-wide">
                LIVE
              </span>

            </div>
          )}

        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          {innings.total_runs}
          <span className="text-slate-400">
            /{innings.total_wickets}
          </span>
        </div>

        <div className="text-slate-400 text-sm sm:text-base">
          {overs} overs · RR {runRate}

          {innings.target
            ? ` · Target ${innings.target}`
            : ''}
        </div>

      </div>

      {/* =====================================================
          BATTING
      ====================================================== */}
      <div className="card overflow-x-auto">

        <h2 className="font-semibold mb-3">
          Batting
        </h2>

        <table className="w-full text-sm min-w-[520px]">

          <thead className="text-slate-400 text-left">

            <tr>
              <th className="py-2">Batsman</th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
              <th>SR</th>
              <th>Dismissal</th>
            </tr>

          </thead>

          <tbody>

            {battingCard.map((b) => (

              <tr
                key={b.player_id}
                className={`border-t border-slate-700/70 ${
                  !b.is_out &&
                  (
                    b.player_id === innings.striker_id ||
                    b.player_id === innings.non_striker_id
                  )
                    ? 'text-emerald-400'
                    : ''
                }`}
              >

                <td className="py-2 font-medium">

                  {playerName(
                    players,
                    b.player_id
                  )}

                  {b.player_id === innings.striker_id
                    ? ' *'
                    : ''}

                </td>

                <td>{b.runs}</td>
                <td>{b.balls}</td>
                <td>{b.fours}</td>
                <td>{b.sixes}</td>
                <td>{b.strike_rate}</td>

                <td className="text-slate-400">

                  {b.is_out
                    ? `${b.how_out || 'out'}${
                        b.fielder_id
                          ? ` (${playerName(
                              players,
                              b.fielder_id
                            )})`
                          : ''
                      }`
                    : 'not out'}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

        <div className="text-sm text-slate-400 mt-3">

          <span className="font-medium text-slate-300">
            Extras:
          </span>{' '}

          {(innings.extras_wide || 0) +
            (innings.extras_noball || 0) +
            (innings.extras_bye || 0) +
            (innings.extras_legbye || 0) +
            (innings.extras_penalty || 0)}

          {' '}(
          wd {innings.extras_wide || 0},
          nb {innings.extras_noball || 0},
          b {innings.extras_bye || 0},
          lb {innings.extras_legbye || 0}
          )

        </div>

      </div>

      {/* =====================================================
          FALL OF WICKETS
      ====================================================== */}
      <div className="card overflow-x-auto">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-semibold text-lg">
            💥 Fall of Wickets
          </h2>

          <span className="text-xs text-slate-500">
            {fallOfWickets.length}{' '}
            wicket
            {fallOfWickets.length !== 1
              ? 's'
              : ''}
          </span>

        </div>

        {fallOfWickets.length === 0 ? (

          <div className="text-sm text-slate-500 py-3">
            No wickets yet.
          </div>

        ) : (

          <table className="w-full text-sm min-w-[500px]">

            <thead className="text-slate-400 text-left">

              <tr>
                <th className="py-2">Wkt</th>
                <th>Score</th>
                <th>Over</th>
                <th>Batsman</th>
                <th>Dismissal</th>
              </tr>

            </thead>

            <tbody>

              {fallOfWickets.map((w, index) => (

                <tr
                  key={`${w.player_id}-${index}`}
                  className="border-t border-slate-700/70"
                >

                  <td className="py-2 font-bold text-red-400">
                    {w.wicket_no || index + 1}
                  </td>

                  <td className="font-semibold">
                    {w.score}
                  </td>

                  <td className="text-slate-400">
                    {w.overs}
                  </td>

                  <td>
                    {playerName(
                      players,
                      w.player_id
                    )}
                  </td>

                  <td className="text-slate-400">

                    {w.how_out || 'out'}

                    {w.fielder_id
                      ? ` (${playerName(
                          players,
                          w.fielder_id
                        )})`
                      : ''}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        )}

      </div>

      {/* =====================================================
          PARTNERSHIPS
      ====================================================== */}
      <div className="card overflow-x-auto">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-semibold text-lg">
            🤝 Partnerships
          </h2>

          <span className="text-xs text-slate-500">
            {partnerships.length}{' '}
            partnership
            {partnerships.length !== 1
              ? 's'
              : ''}
          </span>

        </div>

        {partnerships.length === 0 ? (

          <div className="text-sm text-slate-500 py-3">
            No partnership data yet.
          </div>

        ) : (

          <table className="w-full text-sm min-w-[520px]">

            <thead className="text-slate-400 text-left">

              <tr>
                <th className="py-2">No.</th>
                <th>Batters</th>
                <th>Runs</th>
                <th>Balls</th>
                <th>Status</th>
              </tr>

            </thead>

            <tbody>

              {partnerships.map((p, index) => (

                <tr
                  key={`${p.partnership_no || index + 1}-${index}`}
                  className={`border-t border-slate-700/70 ${
                    p.is_current
                      ? 'text-emerald-400'
                      : ''
                  }`}
                >

                  <td className="py-2 font-bold">
                    {p.partnership_no ||
                      index + 1}
                  </td>

                  <td>

                    {playerName(
                      players,
                      p.batsman1_id
                    )}

                    <span className="text-slate-500 mx-1">
                      &
                    </span>

                    {playerName(
                      players,
                      p.batsman2_id
                    )}

                  </td>

                  <td className="font-semibold">
                    {p.runs}
                  </td>

                  <td>
                    {p.balls}
                  </td>

                  <td>

                    {p.is_current ? (

                      <span className="text-emerald-400 font-semibold">
                        CURRENT
                      </span>

                    ) : (

                      <span className="text-slate-500">
                        Completed
                      </span>

                    )}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        )}

      </div>

      {/* =====================================================
          BOWLING
      ====================================================== */}
      <div className="card overflow-x-auto">

        <h2 className="font-semibold mb-3">
          Bowling
        </h2>

        <table className="w-full text-sm min-w-[380px]">

          <thead className="text-slate-400 text-left">

            <tr>
              <th className="py-2">Bowler</th>
              <th>O</th>
              <th>M</th>
              <th>R</th>
              <th>W</th>
              <th>Econ</th>
            </tr>

          </thead>

          <tbody>

            {bowlingCard.map((b) => (

              <tr
                key={b.player_id}
                className={`border-t border-slate-700/70 ${
                  b.player_id === innings.current_bowler_id
                    ? 'text-emerald-400'
                    : ''
                }`}
              >

                <td className="py-2">
                  {playerName(
                    players,
                    b.player_id
                  )}
                </td>

                <td>{b.overs}</td>
                <td>{b.maidens}</td>
                <td>{b.runs}</td>
                <td>{b.wickets}</td>
                <td>{b.economy}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

