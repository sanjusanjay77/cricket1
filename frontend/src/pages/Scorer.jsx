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
  const [savingBall, setSavingBall] = useState(false);

  const boundaryTimer = useRef(null);

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      setMatch(data.match);

      setPlayers(
        Array.isArray(data.players)
          ? data.players
          : []
      );

      setInnings(
        Array.isArray(data.innings)
          ? data.innings
          : []
      );

      setError('');
    } catch (err) {
      console.error(
        'Load match error:',
        err
      );

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to load match'
      );
    }
  }, [matchId]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  useEffect(() => {
    socket.emit(
      'join-match',
      matchId
    );

    const onUpdate = ({
      match: updatedMatch,
      innings: updatedInnings
    }) => {
      if (updatedMatch) {
        setMatch(updatedMatch);
      }

      if (Array.isArray(updatedInnings)) {
        setInnings(updatedInnings);
      }
    };

    socket.on(
      'score-update',
      onUpdate
    );

    return () => {
      socket.emit(
        'leave-match',
        matchId
      );

      socket.off(
        'score-update',
        onUpdate
      );
    };
  }, [matchId]);

  const handlePlayerCreated =
    useCallback((player) => {
      setPlayers(prev => {
        if (
          prev.some(
            p => p.id === player.id
          )
        ) {
          return prev;
        }

        return [...prev, player];
      });
    }, []);

  const popBoundary = useCallback(
    kind => {
      clearTimeout(
        boundaryTimer.current
      );

      setBoundary(kind);

      boundaryTimer.current =
        setTimeout(() => {
          setBoundary(null);
        }, 900);
    },
    []
  );

  const popWicket = useCallback(() => {
    setFlashWicket(true);

    setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  }, []);

  const act = async fn => {
    setError('');

    try {
      return await fn();
    } catch (err) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Something went wrong'
      );

      return null;
    }
  };

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const currentInnings =
    innings.length > 0
      ? innings[innings.length - 1]
      : null;

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">
          🏆 Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text || 'Match completed'}
        </p>

        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(
              `/match/${matchId}/live`
            )
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
          Loading innings…
        </p>
      );
    }

    const breakInn =
      currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
        <div className="text-4xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {breakInn.total_runs}/
          {breakInn.total_wickets}
          {' '}in {currentInnings.overs} overs
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            const result =
              await act(
                () =>
                  Matches.startSecondInnings(
                    matchId
                  )
              );

            if (result) {
              await loadFull();
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}
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

  const inn =
    currentInnings.innings;

  const battingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.batting_team_id &&
        p.active !== false
    );

  const bowlingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active !== false
    );

  const battingCard =
    Array.isArray(
      currentInnings.battingCard
    )
      ? currentInnings.battingCard
      : [];

  const bowlingCard =
    Array.isArray(
      currentInnings.bowlingCard
    )
      ? currentInnings.bowlingCard
      : [];

  const recentBalls =
    Array.isArray(
      currentInnings.recentBalls
    )
      ? currentInnings.recentBalls
      : [];

  const currentOver =
    Array.isArray(
      currentInnings.currentOver
    )
      ? currentInnings.currentOver
      : [];

  const outIds =
    new Set(
      battingCard
        .filter(
          b => b.is_out
        )
        .map(
          b => b.player_id
        )
    );

  const striker =
    players.find(
      p =>
        p.id ===
        inn.striker_id
    );

  const nonStriker =
    players.find(
      p =>
        p.id ===
        inn.non_striker_id
    );

  const bowler =
    players.find(
      p =>
        p.id ===
        inn.current_bowler_id
    );

  const getBattingStats =
    playerId => {
      const row =
        battingCard.find(
          b =>
            b.player_id ===
            playerId
        );

      if (!row) {
        return {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          is_out: false
        };
      }

      return {
        runs:
          Number(
            row.runs ??
            row.runs_scored ??
            0
          ),

        balls:
          Number(
            row.balls ??
            row.balls_faced ??
            0
          ),

        fours:
          Number(
            row.fours ??
            row.boundaries_4 ??
            0
          ),

        sixes:
          Number(
            row.sixes ??
            row.boundaries_6 ??
            0
          ),

        is_out:
          Boolean(
            row.is_out
          )
      };
    };

  const getBowlingStats =
    playerId => {
      const row =
        bowlingCard.find(
          b =>
            b.player_id ===
            playerId
        );

      if (!row) {
        return {
          balls: 0,
          runs: 0,
          wickets: 0,
          maidens: 0,
          economy: 0,
          overs: '0.0'
        };
      }

      return {
        balls:
          Number(
            row.balls ??
            row.legalBalls ??
            0
          ),

        runs:
          Number(
            row.runs ??
            row.runs_conceded ??
            0
          ),

        wickets:
          Number(
            row.wickets ??
            row.wickets_taken ??
            0
          ),

        maidens:
          Number(
            row.maidens ?? 0
          ),

        economy:
          Number(
            row.economy ?? 0
          ),

        overs:
          row.overs ||
          `${Math.floor(
            Number(
              row.balls ||
              row.legalBalls ||
              0
            ) / 6
          )}.${Number(
            row.balls ||
            row.legalBalls ||
            0
          ) % 6}`
      };
    };

  const strikerStats =
    getBattingStats(
      inn.striker_id
    );

  const nonStrikerStats =
    getBattingStats(
      inn.non_striker_id
    );

  const bowlerStats =
    getBowlingStats(
      inn.current_bowler_id
    );

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !inn.current_bowler_id;

  const playBall =
    async payload => {
      if (savingBall) return;

      setSavingBall(true);
      setError('');

      if (
        !payload.extra_type &&
        payload.runs === 4
      ) {
        popBoundary('four');
      }

      if (
        !payload.extra_type &&
        payload.runs === 6
      ) {
        popBoundary('six');
      }

      try {
        const result =
          await Innings.ball(
            inn.id,
            payload
          );

        /*
         * IMPORTANT:
         * Update the scorer immediately using the
         * returned lightweight innings result.
         */
        if (result?.innings) {
          setInnings(prev =>
            prev.map(item => {
              if (
                item?.innings?.id ===
                inn.id
              ) {
                return {
                  ...item,
                  innings:
                    result.innings
                };
              }

              return item;
            })
          );
        }

        /*
         * Add the newly saved ball immediately to
         * the visible current over / recent balls.
         */
        if (result?.ball) {
          setInnings(prev =>
            prev.map(item => {
              if (
                item?.innings?.id !==
                inn.id
              ) {
                return item;
              }

              const oldRecent =
                Array.isArray(
                  item.recentBalls
                )
                  ? item.recentBalls
                  : [];

              const oldOver =
                Array.isArray(
                  item.currentOver
                )
                  ? item.currentOver
                  : [];

              const ball =
                result.ball;

              const recent =
                [
                  ...oldRecent,
                  ball
                ].slice(-18);

              let over =
                oldOver;

              if (
                Number(ball.is_legal) === 1 &&
                Number(
                  ball.ball_in_over
                ) === 1
              ) {
                over = [];
              }

              over = [
                ...over,
                ball
              ];

              if (
                result.overJustCompleted
              ) {
                over = [ball];
              }

              return {
                ...item,
                recentBalls: recent,
                currentOver: over,
                currentOverBalls: over
              };
            })
          );
        }
      } catch (err) {
        console.error(
          'Record ball error:',
          err
        );

        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Failed to record ball'
        );
      } finally {
        setSavingBall(false);
      }
    };

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={
          inn.batting_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        hasStriker={
          !!inn.striker_id
        }
        hasNonStriker={
          !!inn.non_striker_id
        }
        onSelect={async (
          strikerId,
          nonStrikerId
        ) => {
          const result =
            await act(
              () =>
                Innings.setBatsmen(
                  inn.id,
                  {
                    striker_id:
                      strikerId ||
                      inn.striker_id,

                    non_striker_id:
                      nonStrikerId ||
                      inn.non_striker_id
                  }
                )
            );

          if (result) {
            await loadFull();
          }
        }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3 fade-in">

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

      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >
        <div className="flex justify-between items-center">

          <div>
            <div className="text-sm text-slate-400">
              {match.team1_short}
              {' '}vs{' '}
              {match.team2_short}
              {' '}·{' '}
              {match.overs_limit}
              {' '}overs
            </div>

            <div className="text-4xl font-extrabold tracking-tight">
              {inn.total_runs}

              <span className="text-slate-400">
                /{inn.total_wickets}
              </span>

              <span className="text-base text-slate-400 font-medium">
                {' '}({currentInnings.overs} ov)
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500">
              RUN RATE
            </div>

            <div className="text-xl font-bold text-emerald-400">
              {currentInnings.runRate ??
                '0.00'}
            </div>

            {inn.target && (
              <div className="text-xs text-slate-400">
                Target {inn.target}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =================================================
          BATTERS
      ================================================= */}

      <div className="card">

        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">
            🏏 Batters
          </h3>

          <span className="text-xs text-slate-500">
            LIVE
          </span>
        </div>

        <div className="bg-slate-900/70 rounded-xl p-3 mb-2">
          <div className="flex justify-between items-center">

            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-emerald-400">
                  ●
                </span>

                <span className="font-bold truncate">
                  {striker?.name || '—'}
                </span>
              </div>

              <div className="text-xs text-slate-500 mt-1">
                STRIKER
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold">
                {strikerStats.runs}
                <span className="text-sm text-slate-500">
                  {' '}({strikerStats.balls})
                </span>
              </div>

              <div className="text-xs text-slate-500">
                {strikerStats.fours}×4
                {' '}
                {strikerStats.sixes}×6
              </div>
            </div>

          </div>
        </div>

        <div className="bg-slate-900/70 rounded-xl p-3">
          <div className="flex justify-between items-center">

            <div className="min-w-0">
              <div className="font-semibold truncate">
                {nonStriker?.name || '—'}
              </div>

              <div className="text-xs text-slate-500 mt-1">
                NON-STRIKER
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold">
                {nonStrikerStats.runs}
                <span className="text-sm text-slate-500">
                  {' '}({nonStrikerStats.balls})
                </span>
              </div>

              <div className="text-xs text-slate-500">
                {nonStrikerStats.fours}×4
                {' '}
                {nonStrikerStats.sixes}×6
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* =================================================
          BOWLER + NEXT BOWLER
      ================================================= */}

      <div className="card">

        <div className="flex justify-between items-center">

          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">
                🎯
              </span>

              <span className="font-bold">
                {bowler?.name ||
                  (needBowler
                    ? 'Select next bowler'
                    : '—')}
              </span>
            </div>

            <div className="text-xs text-slate-500 mt-1">
              {needBowler
                ? 'NEXT BOWLER'
                : 'BOWLER'}
            </div>
          </div>

          {!needBowler && (
            <div className="text-right">
              <div className="text-xl font-bold">
                {bowlerStats.overs}
              </div>

              <div className="text-xs text-slate-400">
                {bowlerStats.runs} runs
                {' · '}
                {bowlerStats.wickets} wkts
              </div>

              <div className="text-xs text-slate-500 mt-1">
                Econ {bowlerStats.economy}
                {' · '}
                {bowlerStats.maidens} M
              </div>
            </div>
          )}
        </div>

        {/* NEXT BOWLER SELECTOR IN SAME PLACE */}

        {needBowler && (
          <div className="mt-3 pt-3 border-t border-slate-700">

            <PlayerAutocomplete
              players={
                bowlingTeamPlayers
              }
              value={null}
              onChange={async bowlerId => {
                if (!bowlerId) return;

                const result =
                  await act(
                    () =>
                      Innings.setBowler(
                        inn.id,
                        {
                          bowler_id:
                            bowlerId
                        }
                      )
                  );

                if (result) {
                  setInnings(prev =>
                    prev.map(item =>
                      item?.innings?.id ===
                      inn.id
                        ? {
                            ...item,
                            innings:
                              result
                          }
                        : item
                    )
                  );
                }
              }}
              teamId={
                inn.bowling_team_id
              }
              onCreated={
                handlePlayerCreated
              }
              placeholder={
                'Type or select next bowler…'
              }
            />
          </div>
        )}

        {/* =================================================
            THIS OVER
        ================================================= */}

        <div className="mt-3 pt-3 border-t border-slate-700">

          <div className="flex justify-between items-center mb-2">

            <span className="text-xs font-semibold text-slate-400">
              THIS OVER
            </span>

            <span className="text-xs text-slate-500">
              {currentInnings.currentOverNumber != null
                ? `Over ${Number(currentInnings.currentOverNumber) + 1}`
                : ''}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">

            {currentOver.length === 0 ? (
              <span className="text-xs text-slate-500">
                No balls yet
              </span>
            ) : (
              currentOver.map(
                (ball, index) => {
                  const display =
                    ball.display ??
                    String(
                      ball.runs_batsman ??
                      0
                    );

                  const wicket =
                    Number(
                      ball.is_wicket
                    ) === 1;

                  const boundary =
                    !ball.extra_type &&
                    (
                      Number(
                        ball.runs_batsman
                      ) === 4 ||
                      Number(
                        ball.runs_batsman
                      ) === 6
                    );

                  return (
                    <span
                      key={
                        ball.id ||
                        `${ball.ball_sequence}-${index}`
                      }
                      className={`
                        min-w-9 h-9 px-2
                        rounded-lg
                        flex items-center justify-center
                        text-sm font-bold
                        border
                        ${
                          wicket
                            ? 'bg-red-600 border-red-400 text-white'
                            : boundary
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-slate-700 border-slate-600 text-slate-100'
                        }
                      `}
                    >
                      {display}
                    </span>
                  );
                }
              )
            )}

          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* =================================================
          SCORE BUTTONS
      ================================================= */}

      {!needBowler && (
        <>
          <div className="card">

            <h3 className="font-semibold mb-2 text-sm text-slate-400">
              Score
            </h3>

            <div className="grid grid-cols-4 gap-2">

              {[0, 1, 2, 3].map(
                r => (
                  <button
                    key={r}
                    disabled={
                      savingBall
                    }
                    className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
                    onClick={() =>
                      playBall({
                        runs: r,
                        extra_type: null
                      })
                    }
                  >
                    {r}
                  </button>
                )
              )}

              <button
                disabled={
                  savingBall
                }
                className="run-btn bg-gold hover:brightness-110 text-slate-900 disabled:opacity-40"
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
                disabled={
                  savingBall
                }
                className="run-btn bg-purple-600 hover:bg-purple-500 disabled:opacity-40"
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
                disabled={
                  savingBall
                }
                className="run-btn bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
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
                disabled={
                  savingBall
                }
                className="run-btn bg-gradient-to-br from-red-600 to-red-800 disabled:opacity-40"
                onClick={() =>
                  setShowWicket(true)
                }
              >
                OUT
              </button>

            </div>

            {savingBall && (
              <div className="text-center text-xs text-emerald-400 mt-2">
                Saving…
              </div>
            )}
          </div>

          {/* =================================================
              EXTRAS
          ================================================= */}

          <div className="card">

            <h3 className="font-semibold mb-2 text-sm text-slate-400">
              Extras
            </h3>

            {!extraPicker ? (
              <div className="grid grid-cols-4 gap-2">

                <button
                  disabled={
                    savingBall
                  }
                  className="btn btn-secondary text-sm disabled:opacity-40"
                  onClick={() =>
                    setExtraPicker(
                      'wide'
                    )
                  }
                >
                  Wide
                </button>

                <button
                  disabled={
                    savingBall
                  }
                  className="btn btn-secondary text-sm disabled:opacity-40"
                  onClick={() =>
                    setExtraPicker(
                      'noball'
                    )
                  }
                >
                  No Ball
                </button>

                <button
                  disabled={
                    savingBall
                  }
                  className="btn btn-secondary text-sm disabled:opacity-40"
                  onClick={() =>
                    setExtraPicker(
                      'bye'
                    )
                  }
                >
                  Bye
                </button>

                <button
                  disabled={
                    savingBall
                  }
                  className="btn btn-secondary text-sm disabled:opacity-40"
                  onClick={() =>
                    setExtraPicker(
                      'legbye'
                    )
                  }
                >
                  Leg Bye
                </button>

              </div>
            ) : (
              <div>

                <div className="flex justify-between items-center mb-2">

                  <span className="text-sm font-medium text-slate-300">

                    {extraPicker === 'wide' &&
                      'Wide — extra runs'}

                    {extraPicker === 'noball' &&
                      'No Ball — runs off bat'}

                    {extraPicker === 'bye' &&
                      'Bye — runs'}

                    {extraPicker === 'legbye' &&
                      'Leg Bye — runs'}

                  </span>

                  <button
                    className="text-xs text-slate-400"
                    onClick={() =>
                      setExtraPicker(
                        null
                      )
                    }
                  >
                    ✕ Cancel
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-2">

                  {[0, 1, 2, 3, 4, 6].map(
                    r => (
                      <button
                        key={r}
                        disabled={
                          savingBall
                        }
                        className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3 disabled:opacity-40"
                        onClick={() => {
                          const type =
                            extraPicker;

                          setExtraPicker(
                            null
                          );

                          if (
                            type ===
                            'wide'
                          ) {
                            playBall({
                              extra_type:
                                'wide',
                              extra_runs:
                                1 + r
                            });
                          } else if (
                            type ===
                            'noball'
                          ) {
                            playBall({
                              extra_type:
                                'noball',
                              extra_runs:
                                1,
                              runs: r
                            });
                          } else {
                            playBall({
                              extra_type:
                                type,
                              extra_runs:
                                Math.max(
                                  r,
                                  1
                                )
                            });
                          }
                        }}
                      >
                        {r}
                      </button>
                    )
                  )}

                </div>
              </div>
            )}
          </div>

          {/* =================================================
              UNDO / SWAP
          ================================================= */}

          <div className="grid grid-cols-2 gap-2">

            <button
              disabled={
                savingBall
              }
              className="btn btn-secondary disabled:opacity-40"
              onClick={async () => {
                const result =
                  await act(
                    () =>
                      Innings.undo(
                        inn.id
                      )
                  );

                if (result) {
                  await loadFull();
                }
              }}
            >
              ↺ Undo
            </button>

            <button
              disabled={
                savingBall
              }
              className="btn btn-secondary disabled:opacity-40"
              onClick={async () => {
                const result =
                  await act(
                    () =>
                      Innings.swapStrike(
                        inn.id
                      )
                  );

                if (result) {
                  await loadFull();
                }
              }}
            >
              ⇄ Swap
            </button>
          </div>
        </>
      )}

      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(
            `/match/${matchId}/live`
          )
        }
      >
        View Full Scoreboard
      </button>

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
          onConfirm={async ({
            wicketType,
            dismissedId,
            fielderId,
            runsBeforeWicket
          }) => {
            setShowWicket(false);

            popWicket();

            await playBall({
              runs:
                wicketType ===
                'run-out'
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

      <div className="text-center">

        <div className="text-4xl mb-2">
          🏏
        </div>

        <h1 className="text-xl font-bold">
          Select Batsmen
        </h1>

      </div>

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
            onCreated={
              onPlayerCreated
            }
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
            onChange={
              setNonStriker
            }
            teamId={teamId}
            onCreated={
              onPlayerCreated
            }
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
          (!hasStriker &&
            !striker) ||
          (!hasNonStriker &&
            !nonStriker)
        }
        onClick={() =>
          onSelect(
            striker || null,
            nonStriker || null
          )
        }
      >
        Continue
      </button>

    </div>
  );
}
