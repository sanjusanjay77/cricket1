
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);
  const [showWicket, setShowWicket] = useState(false);
  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [extraPicker, setExtraPicker] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  /*
   * =========================================================
   * OPTIMISTIC UI
   *
   * These values are only temporary.
   * They make the scoreboard change immediately when a button
   * is clicked, without waiting for Render/Turso.
   * =========================================================
   */
  const [optimistic, setOptimistic] = useState(null);
  const optimisticTimer = useRef(null);

  const boundaryTimer = useRef(null);

  const loadFull = useCallback(() => {
    Matches.get(matchId)
      .then(d => {
        setMatch(d.match);
        setPlayers(d.players);
        setInnings(d.innings);
        setOptimistic(null);
      })
      .catch(() => {});
  }, [matchId]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  const handlePlayerCreated = useCallback((player) => {
    setPlayers(prev => [...prev, player]);
  }, []);

  /*
   * =========================================================
   * SOCKET
   * =========================================================
   */
  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: m, innings: i }) => {
      setMatch(m);
      setInnings(i);

      /*
       * Server has now returned the authoritative state.
       * Remove our temporary optimistic display.
       */
      setOptimistic(null);
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
   * =========================================================
   * CLEANUP
   * =========================================================
   */
  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      clearTimeout(optimisticTimer.current);
    };
  }, []);

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
  };

  const popWicket = () => {
    setFlashWicket(true);

    setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  };

  /*
   * =========================================================
   * NORMAL BACKEND ACTION
   * =========================================================
   */
  const act = async (fn) => {
    setError('');

    try {
      await fn();
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Something went wrong'
      );

      /*
       * If backend fails, reload authoritative data.
       */
      loadFull();
    }
  };

  /*
   * =========================================================
   * INSTANT SCORE DISPLAY
   * =========================================================
   *
   * This is the important part.
   *
   * The UI is changed BEFORE Innings.ball() finishes.
   * =========================================================
   */
  const playBall = (payload) => {
    const currentInnings = innings[innings.length - 1];

    if (!currentInnings) return;

    const current = currentInnings.innings;

    /*
     * Boundary animation immediately.
     */
    if (!payload.extra_type && payload.runs === 4) {
      popBoundary('four');
    }

    if (!payload.extra_type && payload.runs === 6) {
      popBoundary('six');
    }

    /*
     * Calculate immediate score change.
     */
    let teamRuns = 0;
    let batsmanRuns = 0;
    let extraRuns = 0;
    let legal = true;

    if (payload.extra_type === 'wide') {
      extraRuns = payload.extra_runs || 1;
      teamRuns = extraRuns;
      legal = false;
    } else if (payload.extra_type === 'noball') {
      extraRuns = 1;
      batsmanRuns = payload.runs || 0;
      teamRuns = extraRuns + batsmanRuns;
      legal = false;
    } else if (
      payload.extra_type === 'bye' ||
      payload.extra_type === 'legbye'
    ) {
      extraRuns = payload.extra_runs || 1;
      teamRuns = extraRuns;
      legal = true;
    } else {
      batsmanRuns = payload.runs || 0;
      teamRuns = batsmanRuns;
      legal = true;
    }

    /*
     * Wicket.
     */
    const wicket = !!payload.is_wicket;

    /*
     * Immediate ball count.
     */
    const newTotalBalls =
      (current.total_balls || 0) +
      (legal ? 1 : 0);

    /*
     * Immediate total.
     */
    const newTotalRuns =
      (current.total_runs || 0) + teamRuns;

    /*
     * Immediate wickets.
     */
    const newTotalWickets =
      (current.total_wickets || 0) +
      (wicket ? 1 : 0);

    /*
     * Current striker stats.
     */
    const strikerId = current.striker_id;

    const oldBattingCard =
      currentInnings.battingCard || [];

    const oldStrikerStats =
      oldBattingCard.find(
        b => b.player_id === strikerId
      ) || {
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0
      };

    const newStrikerRuns =
      oldStrikerStats.runs + batsmanRuns;

    const newStrikerBalls =
      oldStrikerStats.balls +
      (
        legal &&
        payload.extra_type !== 'bye' &&
        payload.extra_type !== 'legbye'
          ? 1
          : 0
      );

    const newFours =
      oldStrikerStats.fours +
      (batsmanRuns === 4 ? 1 : 0);

    const newSixes =
      oldStrikerStats.sixes +
      (batsmanRuns === 6 ? 1 : 0);

    const newStrikeRate =
      newStrikerBalls > 0
        ? Number(
            (
              (newStrikerRuns / newStrikerBalls) *
              100
            ).toFixed(2)
          )
        : 0;

    /*
     * Immediate current over.
     */
    const oldRecentBalls =
      currentInnings.recentBalls || [];

    const oldTotalBalls =
      current.total_balls || 0;

    const currentOverNumber =
      oldRecentBalls.length > 0
        ? oldRecentBalls[
            oldRecentBalls.length - 1
          ].over_number
        : Math.max(
            0,
            Math.floor(oldTotalBalls / 6)
          );

    const optimisticBall = {
      id: `optimistic-${Date.now()}`,
      ball_sequence: oldTotalBalls + 1,
      over_number: currentOverNumber,
      runs_batsman: batsmanRuns,
      extra_type:
        payload.extra_type || null,
      extra_runs:
        payload.extra_runs || 0,
      is_wicket: wicket,
      is_legal: legal
    };

    /*
     * =======================================================
     * IMMEDIATELY UPDATE SCREEN
     * =======================================================
     */
    setOptimistic({
      total_runs: newTotalRuns,
      total_wickets: newTotalWickets,
      total_balls: newTotalBalls,

      strikerStats: {
        ...oldStrikerStats,
        runs: newStrikerRuns,
        balls: newStrikerBalls,
        fours: newFours,
        sixes: newSixes,
        strikeRate: newStrikeRate
      },

      recentBalls: [
        ...oldRecentBalls,
        optimisticBall
      ]
    });

    /*
     * Safety timeout.
     *
     * Normally Socket.IO clears this much earlier.
     * If socket is slow, keep the optimistic display briefly.
     */
    clearTimeout(optimisticTimer.current);

    optimisticTimer.current = setTimeout(() => {
      setOptimistic(null);
      loadFull();
    }, 5000);

    /*
     * =======================================================
     * DATABASE REQUEST RUNS IN BACKGROUND
     * =======================================================
     */
    Innings.ball(inn.id, payload)
      .then(() => {
        /*
         * Do NOT wait here to display the score.
         *
         * Socket.IO will send the authoritative update.
         */
      })
      .catch(e => {
        setError(
          e?.response?.data?.error ||
          e?.message ||
          'Unable to save ball'
        );

        setOptimistic(null);
        loadFull();
      });
  };

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const currentInnings =
    innings[innings.length - 1];

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">
          🏆 Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text}
        </p>

        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(`/match/${matchId}/live`)
          }
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  if (match.status === 'innings-break') {
    if (!currentInnings) {
      return (
        <p className="text-slate-400">
          Loading…
        </p>
      );
    }

    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {currentInnings.innings.total_runs}/
          {currentInnings.innings.total_wickets} in{' '}
          {currentInnings.overs} overs
        </p>

        <button
          className="btn btn-primary"
          onClick={async () => {
            await Matches.startSecondInnings(matchId);
            loadFull();
          }}
        >
          Start 2nd Innings
        </button>
      </div>
    );
  }

  if (!currentInnings) {
    return (
      <p className="text-slate-400">
        Setting up…
      </p>
    );
  }

  const inn = currentInnings.innings;

  /*
   * =========================================================
   * DISPLAY VALUES
   *
   * Use optimistic values immediately when available.
   * Otherwise use server values.
   * =========================================================
   */
  const displayTotalRuns =
    optimistic?.total_runs ??
    inn.total_runs;

  const displayTotalWickets =
    optimistic?.total_wickets ??
    inn.total_wickets;

  const displayTotalBalls =
    optimistic?.total_balls ??
    inn.total_balls ??
    0;

  const displayOvers = `${Math.floor(
    displayTotalBalls / 6
  )}.${displayTotalBalls % 6}`;

  const displayRunRate =
    displayTotalBalls > 0
      ? (
          (displayTotalRuns /
            displayTotalBalls) *
          6
        ).toFixed(2)
      : '0.00';

  const battingTeamPlayers =
    players.filter(
      p =>
        p.team_id === inn.batting_team_id &&
        p.active
    );

  const bowlingTeamPlayers =
    players.filter(
      p =>
        p.team_id === inn.bowling_team_id &&
        p.active
    );

  const outIds = new Set(
    currentInnings.battingCard
      .filter(b => b.is_out)
      .map(b => b.player_id)
  );

  const striker =
    players.find(
      p => p.id === inn.striker_id
    );

  const nonStriker =
    players.find(
      p => p.id === inn.non_striker_id
    );

  const bowler =
    players.find(
      p => p.id === inn.current_bowler_id
    );

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={inn.batting_team_id}
        onPlayerCreated={handlePlayerCreated}
        hasStriker={!!inn.striker_id}
        hasNonStriker={!!inn.non_striker_id}
        onSelect={(strikerId, nonStrikerId) =>
          act(() =>
            Innings.setBatsmen(inn.id, {
              striker_id:
                strikerId || inn.striker_id,
              non_striker_id:
                nonStrikerId ||
                inn.non_striker_id
            })
          )
        }
      />
    );
  }

  if (needBowler) {
    return (
      <SelectBowler
        team={bowlingTeamPlayers}
        teamId={inn.bowling_team_id}
        onPlayerCreated={handlePlayerCreated}
        onSelect={bowlerId =>
          act(() =>
            Innings.setBowler(inn.id, {
              bowler_id: bowlerId
            })
          )
        }
        error={error}
      />
    );
  }

  /*
   * =========================================================
   * BATSMAN STATS
   * =========================================================
   */
  const serverStrikerStats =
    currentInnings.battingCard?.find(
      b => b.player_id === inn.striker_id
    ) || {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0
    };

  const serverNonStrikerStats =
    currentInnings.battingCard?.find(
      b => b.player_id ===
        inn.non_striker_id
    ) || {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0
    };

  const strikerStats =
    optimistic?.strikerStats ||
    serverStrikerStats;

  const nonStrikerStats =
    serverNonStrikerStats;

  /*
   * =========================================================
   * BOWLER STATS
   * =========================================================
   */
  const bowlerStats =
    currentInnings.bowlingCard?.find(
      b =>
        b.player_id ===
        inn.current_bowler_id
    ) || {
      overs: '0.0',
      runs: 0,
      wickets: 0,
      maidens: 0,
      economy: 0
    };

  /*
   * =========================================================
   * CURRENT OVER
   * =========================================================
   */
  const recentBalls =
    optimistic?.recentBalls ||
    currentInnings.recentBalls ||
    [];

  const currentOverNumber =
    recentBalls.length > 0
      ? recentBalls[
          recentBalls.length - 1
        ].over_number
      : Math.max(
          0,
          Math.floor(displayTotalBalls / 6)
        );

  const currentOverBalls =
    recentBalls.filter(
      ball =>
        ball.over_number ===
        currentOverNumber
    );

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

      {/* =====================================================
          BOUNDARY
      ===================================================== */}
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
          SCORE HEADER
      ===================================================== */}
      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >

        <div className="flex justify-between items-center flex-wrap gap-2">

          <div>

            <div className="text-sm text-slate-400">
              {match.team1_short} vs{' '}
              {match.team2_short}
              {' · '}
              {match.overs_limit} overs
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">

              {displayTotalRuns}

              <span className="text-slate-400">
                /{displayTotalWickets}
              </span>

              <span className="text-lg text-slate-400 font-medium">
                {' '}
                ({displayOvers} ov)
              </span>

            </div>

          </div>

          <div className="text-right text-sm text-slate-400">

            <div>
              RR: {displayRunRate}
            </div>

            {inn.target && (
              <div>
                Target: {inn.target}
              </div>
            )}

          </div>

        </div>

        {/* ===================================================
            CURRENT PLAYERS
        =================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

          {/* STRIKER */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">

            <div className="flex justify-between items-center">

              <div className="font-semibold text-white">

                🏏 {striker?.name || '—'}

                <span className="text-emerald-400 ml-1">
                  ●
                </span>

              </div>

              <div className="text-xs text-slate-400">
                STRIKER
              </div>

            </div>

            <div className="mt-2 flex items-center gap-4">

              <Stat
                value={strikerStats.runs}
                label="Runs"
                large
              />

              <Stat
                value={strikerStats.balls}
                label="Balls"
              />

              <Stat
                value={strikerStats.fours}
                label="4s"
              />

              <Stat
                value={strikerStats.sixes}
                label="6s"
              />

              <Stat
                value={strikerStats.strikeRate ?? 0}
                label="SR"
              />

            </div>

          </div>

          {/* NON STRIKER */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">

            <div className="flex justify-between items-center">

              <div className="font-semibold text-white">
                🏏 {nonStriker?.name || '—'}
              </div>

              <div className="text-xs text-slate-400">
                NON-STRIKER
              </div>

            </div>

            <div className="mt-2 flex items-center gap-4">

              <Stat
                value={nonStrikerStats.runs}
                label="Runs"
                large
              />

              <Stat
                value={nonStrikerStats.balls}
                label="Balls"
              />

              <Stat
                value={nonStrikerStats.fours}
                label="4s"
              />

              <Stat
                value={nonStrikerStats.sixes}
                label="6s"
              />

              <Stat
                value={nonStrikerStats.strikeRate ?? 0}
                label="SR"
              />

            </div>

          </div>

          {/* BOWLER */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700 sm:col-span-2">

            <div className="flex justify-between items-center">

              <div className="font-semibold text-white">
                🎯 {bowler?.name || '—'}
              </div>

              <div className="text-xs text-slate-400">
                BOWLING
              </div>

            </div>

            <div className="mt-2 grid grid-cols-5 gap-2 text-center">

              <BowlingStat
                value={bowlerStats.overs}
                label="Overs"
              />

              <BowlingStat
                value={bowlerStats.maidens}
                label="Maidens"
              />

              <BowlingStat
                value={bowlerStats.runs}
                label="Runs"
              />

              <BowlingStat
                value={bowlerStats.wickets}
                label="Wickets"
              />

              <BowlingStat
                value={bowlerStats.economy}
                label="Econ"
              />

            </div>

          </div>

        </div>

        {/* ===================================================
            CURRENT OVER
        =================================================== */}
        <div className="mt-4 bg-slate-900/70 rounded-xl p-3">

          <div className="flex justify-between items-center mb-2">

            <h3 className="text-sm font-semibold text-slate-300">
              Current Over
            </h3>

            <span className="text-xs text-slate-500">
              Over {currentOverNumber + 1}
            </span>

          </div>

          {currentOverBalls.length === 0 ? (
            <div className="text-xs text-slate-500">
              No balls yet
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">

              {currentOverBalls.map(
                (ball, index) => (
                  <BallDisplay
                    key={
                      ball.id ||
                      `${ball.ball_sequence}-${index}`
                    }
                    ball={ball}
                  />
                )
              )}

            </div>
          )}

        </div>

      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}
      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
          {error}
        </div>
      )}

      {/* =====================================================
          RUN BUTTONS
      ===================================================== */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Runs
        </h3>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(r => (
            <button
              key={r}
              className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform"
              onClick={() =>
                playBall({
                  runs: r,
                  extra_type: null
                })
              }
            >
              {r}
            </button>
          ))}

          <button
            className="run-btn bg-gold hover:brightness-110 active:scale-95 transition-transform text-slate-900"
            onClick={() =>
              playBall({
                runs: 4,
                extra_type: null
              })
            }
          >
            4
          </button>

          <button
            className="run-btn bg-purple-600 hover:bg-purple-500 active:scale-95 transition-transform"
            onClick={() =>
              playBall({
                runs: 6,
                extra_type: null
              })
            }
          >
            6
          </button>

          <button
            className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform"
            onClick={() =>
              playBall({
                runs: 5,
                extra_type: null
              })
            }
          >
            5
          </button>

          <button
            className="run-btn bg-gradient-to-br from-red-600 to-red-800 active:scale-95 transition-transform"
            onClick={() =>
              setShowWicket(true)
            }
          >
            OUT
          </button>

        </div>

      </div>

      {/* =====================================================
          EXTRAS
      ===================================================== */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Extras
        </h3>

        {!extraPicker ? (
          <div className="grid grid-cols-4 gap-2">

            <button
              className="btn btn-secondary text-sm"
              onClick={() =>
                setExtraPicker('wide')
              }
            >
              Wide
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() =>
                setExtraPicker('noball')
              }
            >
              No Ball
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() =>
                setExtraPicker('bye')
              }
            >
              Bye
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() =>
                setExtraPicker('legbye')
              }
            >
              Leg Bye
            </button>

          </div>
        ) : (
          <div className="fade-in">

            <div className="flex items-center justify-between mb-2">

              <span className="text-sm font-medium text-slate-300">

                {extraPicker === 'wide' &&
                  'Wide — extra runs'}

                {extraPicker === 'noball' &&
                  'No Ball — runs off the bat'}

                {extraPicker === 'bye' &&
                  'Bye — runs'}

                {extraPicker === 'legbye' &&
                  'Leg Bye — runs'}

              </span>

              <button
                className="text-xs text-slate-400 hover:text-white"
                onClick={() =>
                  setExtraPicker(null)
                }
              >
                ✕ Cancel
              </button>

            </div>

            <div className="grid grid-cols-6 gap-2">

              {[0, 1, 2, 3, 4, 6].map(r => (

                <button
                  key={r}
                  className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform !text-base !py-3"
                  onClick={() => {

                    const type =
                      extraPicker;

                    setExtraPicker(null);

                    if (type === 'wide') {

                      playBall({
                        extra_type: 'wide',
                        extra_runs: 1 + r
                      });

                    } else if (
                      type === 'noball'
                    ) {

                      playBall({
                        extra_type: 'noball',
                        extra_runs: 1,
                        runs: r
                      });

                    } else {

                      playBall({
                        extra_type: type,
                        extra_runs:
                          Math.max(r, 1)
                      });

                    }

                  }}
                >
                  {r}
                </button>

              ))}

            </div>

          </div>
        )}

      </div>

      {/* =====================================================
          ACTION BUTTONS
      ===================================================== */}
      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.undo(inn.id)
            )
          }
        >
          ↺ Undo
        </button>

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.swapStrike(inn.id)
            )
          }
        >
          ⇄ Swap Batsmen
        </button>

      </div>

      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        View Full Scoreboard
      </button>

      {/* =====================================================
          WICKET MODAL
      ===================================================== */}
      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={
            bowlingTeamPlayers
          }
          fieldingTeamId={
            inn.bowling_team_id
          }
          onPlayerCreated={
            handlePlayerCreated
          }
          onClose={() =>
            setShowWicket(false)
          }
          onConfirm={({
            wicketType,
            dismissedId,
            fielderId,
            runsBeforeWicket
          }) => {

            setShowWicket(false);

            popWicket();

            playBall({
              runs:
                wicketType === 'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket: true,

              wicket_type:
                wicketType,

              dismissed_id:
                dismissedId,

              fielder_id:
                fielderId
            });

          }}
        />
      )}

    </div>
  );
}

/* =========================================================
   SMALL STAT COMPONENTS
========================================================= */

function Stat({
  value,
  label,
  large = false
}) {
  return (
    <div>
      <div
        className={
          large
            ? 'text-xl font-bold text-white'
            : 'text-lg font-semibold'
        }
      >
        {value}
      </div>

      <div className="text-xs text-slate-400">
        {label}
      </div>
    </div>
  );
}

function BowlingStat({
  value,
  label
}) {
  return (
    <div>
      <div className="text-lg font-bold">
        {value}
      </div>

      <div className="text-xs text-slate-400">
        {label}
      </div>
    </div>
  );
}

/* =========================================================
   BALL DISPLAY
========================================================= */

function BallDisplay({ ball }) {

  let label =
    String(ball.runs_batsman ?? 0);

  let className =
    'bg-slate-700';

  if (ball.is_wicket) {

    label = 'W';
    className = 'bg-red-600';

  } else if (
    ball.extra_type === 'wide'
  ) {

    label =
      `Wd${
        ball.extra_runs > 1
          ? `+${ball.extra_runs - 1}`
          : ''
      }`;

    className = 'bg-yellow-600';

  } else if (
    ball.extra_type === 'noball'
  ) {

    label =
      `Nb${
        ball.runs_batsman
          ? `+${ball.runs_batsman}`
          : ''
      }`;

    className = 'bg-orange-600';

  } else if (
    ball.extra_type === 'bye'
  ) {

    label =
      `${ball.extra_runs}B`;

    className = 'bg-blue-600';

  } else if (
    ball.extra_type === 'legbye'
  ) {

    label =
      `${ball.extra_runs}Lb`;

    className = 'bg-blue-800';

  } else if (
    ball.runs_batsman === 4
  ) {

    label = '4';
    className = 'bg-emerald-600';

  } else if (
    ball.runs_batsman === 6
  ) {

    label = '6';
    className = 'bg-purple-600';
  }

  return (
    <div className="flex flex-col items-center gap-1">

      <span
        className={`w-10 h-10 flex items-center justify-center rounded-full text-xs font-bold ${className}`}
      >
        {label}
      </span>

      <span className="text-[10px] text-slate-500">
        {ball.is_legal
          ? 'legal'
          : 'extra'}
      </span>

    </div>
  );
}

/* =========================================================
   SELECT BATSMEN
========================================================= */

function SelectBatsmen({
  team,
  outIds,
  hasStriker,
  hasNonStriker,
  teamId,
  onPlayerCreated,
  onSelect
}) {

  const [striker, setStriker] =
    useState(null);

  const [nonStriker, setNonStriker] =
    useState(null);

  const available =
    team.filter(
      p => !outIds.has(p.id)
    );

  return (
    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <h1 className="text-xl font-bold">
        Select Batsmen
      </h1>

      {!hasStriker && (
        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            On strike
          </label>

          <PlayerAutocomplete
            players={available}
            value={striker}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              nonStriker
                ? [nonStriker]
                : []
            }
            placeholder="Type or add striker's name…"
          />

        </div>
      )}

      {!hasNonStriker && (
        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            Non-striker
          </label>

          <PlayerAutocomplete
            players={available}
            value={nonStriker}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              striker
                ? [striker]
                : []
            }
            placeholder="Type or add non-striker's name…"
          />

        </div>
      )}

      <button
        className="btn btn-primary w-full"
        disabled={
          (!hasStriker && !striker) ||
          (!hasNonStriker && !nonStriker)
        }
        onClick={() =>
          onSelect(
            striker,
            nonStriker
          )
        }
      >
        Confirm
      </button>

    </div>
  );
}

/* =========================================================
   SELECT BOWLER
========================================================= */

function SelectBowler({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error
}) {

  const [bowler, setBowler] =
    useState(null);

  return (
    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <h1 className="text-xl font-bold">
        Select Bowler
      </h1>

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
          {error}
        </div>
      )}

      <PlayerAutocomplete
        players={team}
        value={bowler}
        onChange={setBowler}
        teamId={teamId}
        onCreated={onPlayerCreated}
        placeholder="Type or add bowler's name…"
      />

      <button
        className="btn btn-primary w-full"
        disabled={!bowler}
        onClick={() =>
          onSelect(bowler)
        }
      >
        Confirm
      </button>

    </div>
  );
}
```
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

export default function Scorer() {
  const { matchId } = useParams();
  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);
  const [showWicket, setShowWicket] = useState(false);
  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [extraPicker, setExtraPicker] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const boundaryTimer = useRef(null);
  const navigate = useNavigate();

  const loadFull = useCallback(() => {
    Matches.get(matchId)
      .then(d => {
        setMatch(d.match);
        setPlayers(d.players);
        setInnings(d.innings);
      })
      .catch(() => {});
  }, [matchId]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  const handlePlayerCreated = useCallback((player) => {
    setPlayers(prev => [...prev, player]);
  }, []);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: m, innings: i }) => {
      setMatch(m);
      setInnings(i);
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);
    setBoundary(kind);
    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
  };

  const popWicket = () => {
    setFlashWicket(true);
    setTimeout(() => setFlashWicket(false), 600);
  };

  if (!match) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const currentInnings = innings[innings.length - 1];

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">🏆 Match Completed</h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text}
        </p>

        <button
          className="btn btn-primary"
          onClick={() => navigate(`/match/${matchId}/live`)}
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  if (match.status === 'innings-break') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">Innings Break</h1>

        <p className="text-slate-300 text-lg">
          {currentInnings.innings.total_runs}/
          {currentInnings.innings.total_wickets} in{' '}
          {currentInnings.overs} overs
        </p>

        <button
          className="btn btn-primary"
          onClick={async () => {
            await Matches.startSecondInnings(matchId);
            loadFull();
          }}
        >
          Start 2nd Innings
        </button>
      </div>
    );
  }

  if (!currentInnings) {
    return <p className="text-slate-400">Setting up…</p>;
  }

  const inn = currentInnings.innings;

  const battingTeamPlayers = players.filter(
    p => p.team_id === inn.batting_team_id && p.active
  );

  const bowlingTeamPlayers = players.filter(
    p => p.team_id === inn.bowling_team_id && p.active
  );

  const outIds = new Set(
    currentInnings.battingCard
      .filter(b => b.is_out)
      .map(b => b.player_id)
  );

  const striker = players.find(p => p.id === inn.striker_id);
  const nonStriker = players.find(p => p.id === inn.non_striker_id);
  const bowler = players.find(p => p.id === inn.current_bowler_id);

  const needBatsmen =
    !inn.striker_id || !inn.non_striker_id;

  const needBowler =
    !needBatsmen && !inn.current_bowler_id;

  const act = async (fn) => {
    setError('');

    try {
      await fn();
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Something went wrong'
      );
    }
  };

  const playBall = (payload) => {
    if (!payload.extra_type && payload.runs === 4) {
      popBoundary('four');
    }

    if (!payload.extra_type && payload.runs === 6) {
      popBoundary('six');
    }

    return act(() => Innings.ball(inn.id, payload));
  };

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={inn.batting_team_id}
        onPlayerCreated={handlePlayerCreated}
        hasStriker={!!inn.striker_id}
        hasNonStriker={!!inn.non_striker_id}
        onSelect={(strikerId, nonStrikerId) =>
          act(() =>
            Innings.setBatsmen(inn.id, {
              striker_id: strikerId || inn.striker_id,
              non_striker_id:
                nonStrikerId || inn.non_striker_id,
            })
          )
        }
      />
    );
  }

  if (needBowler) {
    return (
      <SelectBowler
        team={bowlingTeamPlayers}
        teamId={inn.bowling_team_id}
        onPlayerCreated={handlePlayerCreated}
        onSelect={(bowlerId) =>
          act(() =>
            Innings.setBowler(inn.id, {
              bowler_id: bowlerId,
            })
          )
        }
        error={error}
      />
    );
  }

  /*
   * Find current batsman statistics
   */
  const strikerStats =
    currentInnings.battingCard?.find(
      b => b.player_id === inn.striker_id
    ) || {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
    };

  const nonStrikerStats =
    currentInnings.battingCard?.find(
      b => b.player_id === inn.non_striker_id
    ) || {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
    };

  /*
   * Find current bowler statistics
   */
  const bowlerStats =
    currentInnings.bowlingCard?.find(
      b => b.player_id === inn.current_bowler_id
    ) || {
      overs: '0.0',
      runs: 0,
      wickets: 0,
      maidens: 0,
      economy: 0,
    };

  /*
   * Current over balls
   */
  const recentBalls = currentInnings.recentBalls || [];

  const currentOverNumber =
    recentBalls.length > 0
      ? recentBalls[recentBalls.length - 1].over_number
      : Math.max(
          0,
          Math.floor((inn.total_balls || 0) / 6)
        );

  const currentOverBalls = recentBalls.filter(
    ball => ball.over_number === currentOverNumber
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

      {/* Boundary animation */}
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

      {/* ================= SCORE HEADER ================= */}
      <div
        className={`card ${
          flashWicket ? 'wicket-flash' : ''
        }`}
      >
        <div className="flex justify-between items-center flex-wrap gap-2">

          <div>
            <div className="text-sm text-slate-400">
              {match.team1_short} vs {match.team2_short}
              {' · '}
              {match.overs_limit} overs
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {inn.total_runs}
              <span className="text-slate-400">
                /{inn.total_wickets}
              </span>

              <span className="text-lg text-slate-400 font-medium">
                {' '}
                ({currentInnings.overs} ov)
              </span>
            </div>
          </div>

          <div className="text-right text-sm text-slate-400">
            <div>
              RR: {currentInnings.runRate}
            </div>

            {inn.target && (
              <div>
                Target: {inn.target}
              </div>
            )}
          </div>
        </div>

        {/* ================= CURRENT PLAYERS ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

          {/* Striker */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">

            <div className="flex justify-between items-center">
              <div className="font-semibold text-white">
                🏏 {striker?.name || '—'}
                <span className="text-emerald-400 ml-1">
                  ●
                </span>
              </div>

              <div className="text-xs text-slate-400">
                STRIKER
              </div>
            </div>

            <div className="mt-2 flex items-center gap-4">

              <div>
                <div className="text-xl font-bold text-white">
                  {strikerStats.runs}
                </div>
                <div className="text-xs text-slate-400">
                  Runs
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {strikerStats.balls}
                </div>
                <div className="text-xs text-slate-400">
                  Balls
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {strikerStats.fours}
                </div>
                <div className="text-xs text-slate-400">
                  4s
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {strikerStats.sixes}
                </div>
                <div className="text-xs text-slate-400">
                  6s
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {strikerStats.strikeRate ?? 0}
                </div>
                <div className="text-xs text-slate-400">
                  SR
                </div>
              </div>

            </div>
          </div>

          {/* Non-striker */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">

            <div className="flex justify-between items-center">
              <div className="font-semibold text-white">
                🏏 {nonStriker?.name || '—'}
              </div>

              <div className="text-xs text-slate-400">
                NON-STRIKER
              </div>
            </div>

            <div className="mt-2 flex items-center gap-4">

              <div>
                <div className="text-xl font-bold text-white">
                  {nonStrikerStats.runs}
                </div>
                <div className="text-xs text-slate-400">
                  Runs
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nonStrikerStats.balls}
                </div>
                <div className="text-xs text-slate-400">
                  Balls
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nonStrikerStats.fours}
                </div>
                <div className="text-xs text-slate-400">
                  4s
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nonStrikerStats.sixes}
                </div>
                <div className="text-xs text-slate-400">
                  6s
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nonStrikerStats.strikeRate ?? 0}
                </div>
                <div className="text-xs text-slate-400">
                  SR
                </div>
              </div>

            </div>
          </div>

          {/* Current Bowler */}
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700 sm:col-span-2">

            <div className="flex justify-between items-center">
              <div className="font-semibold text-white">
                🎯 {bowler?.name || '—'}
              </div>

              <div className="text-xs text-slate-400">
                BOWLING
              </div>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-2 text-center">

              <div>
                <div className="text-lg font-bold">
                  {bowlerStats.overs}
                </div>
                <div className="text-xs text-slate-400">
                  Overs
                </div>
              </div>

              <div>
                <div className="text-lg font-bold">
                  {bowlerStats.maidens}
                </div>
                <div className="text-xs text-slate-400">
                  Maidens
                </div>
              </div>

              <div>
                <div className="text-lg font-bold">
                  {bowlerStats.runs}
                </div>
                <div className="text-xs text-slate-400">
                  Runs
                </div>
              </div>

              <div>
                <div className="text-lg font-bold">
                  {bowlerStats.wickets}
                </div>
                <div className="text-xs text-slate-400">
                  Wickets
                </div>
              </div>

              <div>
                <div className="text-lg font-bold">
                  {bowlerStats.economy}
                </div>
                <div className="text-xs text-slate-400">
                  Econ
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ================= CURRENT OVER ================= */}
        <div className="mt-4 bg-slate-900/70 rounded-xl p-3">

          <div className="flex justify-between items-center mb-2">

            <h3 className="text-sm font-semibold text-slate-300">
              Current Over
            </h3>

            <span className="text-xs text-slate-500">
              Over {currentOverNumber + 1}
            </span>

          </div>

          {currentOverBalls.length === 0 ? (
            <div className="text-xs text-slate-500">
              No balls yet
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">

              {currentOverBalls.map((ball, index) => (
                <BallDisplay
                  key={ball.id || `${ball.ball_sequence}-${index}`}
                  ball={ball}
                />
              ))}

            </div>
          )}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
          {error}
        </div>
      )}

      {/* ================= RUN BUTTONS ================= */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Runs
        </h3>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(r => (
            <button
              key={r}
              className="run-btn bg-slate-700 hover:bg-slate-600"
              onClick={() =>
                playBall({
                  runs: r,
                  extra_type: null
                })
              }
            >
              {r}
            </button>
          ))}

          <button
            className="run-btn bg-gold hover:brightness-110 text-slate-900"
            onClick={() =>
              playBall({
                runs: 4,
                extra_type: null
              })
            }
          >
            4
          </button>

          <button
            className="run-btn bg-purple-600 hover:bg-purple-500"
            onClick={() =>
              playBall({
                runs: 6,
                extra_type: null
              })
            }
          >
            6
          </button>

          <button
            className="run-btn bg-slate-700 hover:bg-slate-600"
            onClick={() =>
              playBall({
                runs: 5,
                extra_type: null
              })
            }
          >
            5
          </button>

          <button
            className="run-btn bg-gradient-to-br from-red-600 to-red-800"
            onClick={() => setShowWicket(true)}
          >
            OUT
          </button>

        </div>
      </div>

      {/* ================= EXTRAS ================= */}
      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          Extras
        </h3>

        {!extraPicker ? (
          <div className="grid grid-cols-4 gap-2">

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('wide')}
            >
              Wide
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('noball')}
            >
              No Ball
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('bye')}
            >
              Bye
            </button>

            <button
              className="btn btn-secondary text-sm"
              onClick={() => setExtraPicker('legbye')}
            >
              Leg Bye
            </button>

          </div>
        ) : (
          <div className="fade-in">

            <div className="flex items-center justify-between mb-2">

              <span className="text-sm font-medium text-slate-300">

                {extraPicker === 'wide' &&
                  'Wide — extra runs'}

                {extraPicker === 'noball' &&
                  'No Ball — runs off the bat'}

                {extraPicker === 'bye' &&
                  'Bye — runs'}

                {extraPicker === 'legbye' &&
                  'Leg Bye — runs'}

              </span>

              <button
                className="text-xs text-slate-400 hover:text-white"
                onClick={() => setExtraPicker(null)}
              >
                ✕ Cancel
              </button>

            </div>

            <div className="grid grid-cols-6 gap-2">

              {[0, 1, 2, 3, 4, 6].map(r => (

                <button
                  key={r}
                  className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3"
                  onClick={() => {

                    setExtraPicker(null);

                    if (extraPicker === 'wide') {

                      playBall({
                        extra_type: 'wide',
                        extra_runs: 1 + r
                      });

                    } else if (extraPicker === 'noball') {

                      playBall({
                        extra_type: 'noball',
                        extra_runs: 1,
                        runs: r
                      });

                    } else {

                      playBall({
                        extra_type: extraPicker,
                        extra_runs: Math.max(r, 1)
                      });

                    }

                  }}
                >
                  {r}
                </button>

              ))}

            </div>
          </div>
        )}

      </div>

      {/* ================= ACTION BUTTONS ================= */}
      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() => Innings.undo(inn.id))
          }
        >
          ↺ Undo
        </button>

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() => Innings.swapStrike(inn.id))
          }
        >
          ⇄ Swap Batsmen
        </button>

      </div>

      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        View Full Scoreboard
      </button>

      {/* ================= WICKET MODAL ================= */}
      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingTeamPlayers}
          fieldingTeamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
          onClose={() => setShowWicket(false)}
          onConfirm={({
            wicketType,
            dismissedId,
            fielderId,
            runsBeforeWicket
          }) => {

            setShowWicket(false);
            popWicket();

            playBall({
              runs:
                wicketType === 'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket: true,
              wicket_type: wicketType,
              dismissed_id: dismissedId,
              fielder_id: fielderId
            });

          }}
        />
      )}

    </div>
  );
}

/* =========================================================
   BALL DISPLAY
========================================================= */

function BallDisplay({ ball }) {

  let label = String(ball.runs_batsman ?? 0);
  let className = 'bg-slate-700';

  if (ball.is_wicket) {

    label = 'W';
    className = 'bg-red-600';

  } else if (ball.extra_type === 'wide') {

    label =
      `Wd${
        ball.extra_runs > 1
          ? `+${ball.extra_runs - 1}`
          : ''
      }`;

    className = 'bg-yellow-600';

  } else if (ball.extra_type === 'noball') {

    label =
      `Nb${
        ball.runs_batsman
          ? `+${ball.runs_batsman}`
          : ''
      }`;

    className = 'bg-orange-600';

  } else if (ball.extra_type === 'bye') {

    label = `${ball.extra_runs}B`;
    className = 'bg-blue-600';

  } else if (ball.extra_type === 'legbye') {

    label = `${ball.extra_runs}Lb`;
    className = 'bg-blue-800';

  } else if (ball.runs_batsman === 4) {

    label = '4';
    className = 'bg-emerald-600';

  } else if (ball.runs_batsman === 6) {

    label = '6';
    className = 'bg-purple-600';

  }

  return (
    <div className="flex flex-col items-center gap-1">

      <span
        className={`w-10 h-10 flex items-center justify-center rounded-full text-xs font-bold ${className}`}
      >
        {label}
      </span>

      <span className="text-[10px] text-slate-500">
        {ball.is_legal ? 'legal' : 'extra'}
      </span>

    </div>
  );
}

/* =========================================================
   SELECT BATSMEN
========================================================= */

function SelectBatsmen({
  team,
  outIds,
  hasStriker,
  hasNonStriker,
  teamId,
  onPlayerCreated,
  onSelect
}) {

  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);

  const available = team.filter(
    p => !outIds.has(p.id)
  );

  return (
    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <h1 className="text-xl font-bold">
        Select Batsmen
      </h1>

      {!hasStriker && (
        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            On strike
          </label>

          <PlayerAutocomplete
            players={available}
            value={striker}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              nonStriker
                ? [nonStriker]
                : []
            }
            placeholder="Type or add striker's name…"
          />

        </div>
      )}

      {!hasNonStriker && (
        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            Non-striker
          </label>

          <PlayerAutocomplete
            players={available}
            value={nonStriker}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              striker
                ? [striker]
                : []
            }
            placeholder="Type or add non-striker's name…"
          />

        </div>
      )}

      <button
        className="btn btn-primary w-full"
        disabled={
          (!hasStriker && !striker) ||
          (!hasNonStriker && !nonStriker)
        }
        onClick={() =>
          onSelect(striker, nonStriker)
        }
      >
        Confirm
      </button>

    </div>
  );
}

/* =========================================================
   SELECT BOWLER
========================================================= */

function SelectBowler({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error
}) {

  const [bowler, setBowler] = useState(null);

  return (
    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <h1 className="text-xl font-bold">
        Select Bowler
      </h1>

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
          {error}
        </div>
      )}

      <PlayerAutocomplete
        players={team}
        value={bowler}
        onChange={setBowler}
        teamId={teamId}
        onCreated={onPlayerCreated}
        placeholder="Type or add bowler's name…"
      />

      <button
        className="btn btn-primary w-full"
        disabled={!bowler}
        onClick={() => onSelect(bowler)}
      >
        Confirm
      </button>

    </div>
  );
}
