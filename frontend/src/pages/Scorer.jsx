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
  const [showNextBowler, setShowNextBowler] = useState(false);
  const [nextBowlerId, setNextBowlerId] = useState(null);

  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [savingBall, setSavingBall] = useState(false);
  const [pendingBall, setPendingBall] = useState(null);
  const [selectingBowler, setSelectingBowler] = useState(false);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * =========================================================
   * LOAD MATCH
   * =========================================================
   */

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
      console.error('Load match error:', err);

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

  /*
   * =========================================================
   * SOCKET
   * =========================================================
   */

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({
      match: updatedMatch,
      innings: updatedInnings,
    }) => {
      if (updatedMatch) {
        setMatch(updatedMatch);
      }

      if (Array.isArray(updatedInnings)) {
        setInnings(updatedInnings);
      }
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
   * =========================================================
   * CLEANUP TIMERS
   * =========================================================
   */

  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      clearTimeout(wicketTimer.current);
    };
  }, []);

  /*
   * =========================================================
   * PLAYER CREATED
   * =========================================================
   */

  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      if (
        prev.some(
          (p) => p.id === player.id
        )
      ) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  /*
   * =========================================================
   * VISUAL EFFECTS
   * =========================================================
   */

  const popBoundary = useCallback((kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 900);
  }, []);

  const popWicket = useCallback(() => {
    clearTimeout(wicketTimer.current);

    setFlashWicket(true);

    wicketTimer.current = setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  }, []);

  /*
   * =========================================================
   * RENDER LOADING
   * =========================================================
   */

  if (!match) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center text-slate-400">
        Loading scorer…
      </div>
    );
  }

  const currentInnings =
    innings.length > 0
      ? innings[innings.length - 1]
      : null;

  /*
   * =========================================================
   * MATCH COMPLETED
   * =========================================================
   */

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
        <div className="text-5xl">
          🏆
        </div>

        <h1 className="text-2xl font-bold">
          Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text ||
            'Match completed'}
        </p>

        <button
          className="btn btn-primary w-full"
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

  /*
   * =========================================================
   * INNINGS BREAK
   * =========================================================
   */

  if (
    match.status === 'innings-break'
  ) {
    if (!currentInnings) {
      return (
        <div className="text-center text-slate-400 py-10">
          Loading innings…
        </div>
      );
    }

    const breakInn =
      currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {breakInn.total_runs}/
          {breakInn.total_wickets}{' '}
          in{' '}
          {formatOvers(
            Number(
              breakInn.total_balls || 0
            )
          )}{' '}
          overs
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            try {
              setError('');

              await Matches.startSecondInnings(
                matchId
              );

              await loadFull();
            } catch (err) {
              setError(
                err?.response?.data?.error ||
                  err?.message ||
                  'Failed to start second innings'
              );
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <ErrorBox error={error} />
        )}
      </div>
    );
  }

  /*
   * =========================================================
   * NO INNINGS
   * =========================================================
   */

  if (!currentInnings) {
    return (
      <div className="max-w-lg mx-auto text-center text-slate-400 py-10">
        Setting up scorer…
      </div>
    );
  }

  /*
   * =========================================================
   * FROM HERE DOWN:
   *
   * NO REACT HOOKS ARE USED.
   *
   * This is important because it completely prevents
   * React error #310 from conditional hook execution.
   * =========================================================
   */

  const inn = currentInnings.innings;

  const battingTeamPlayers =
    players.filter(
      (p) =>
        p.team_id ===
          inn.batting_team_id &&
        p.active !== false
    );

  const bowlingTeamPlayers =
    players.filter(
      (p) =>
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

  const currentOver =
    Array.isArray(
      currentInnings.currentOver
    )
      ? currentInnings.currentOver
      : [];

  const recentBalls =
    Array.isArray(
      currentInnings.recentBalls
    )
      ? currentInnings.recentBalls
      : [];

  const outIds = new Set(
    battingCard
      .filter((b) => b.is_out)
      .map((b) => b.player_id)
  );

  const striker = players.find(
    (p) =>
      p.id === inn.striker_id
  );

  const nonStriker = players.find(
    (p) =>
      p.id === inn.non_striker_id
  );

  const bowler = players.find(
    (p) =>
      p.id === inn.current_bowler_id
  );

  /*
   * =========================================================
   * STATS
   * =========================================================
   */

  const getBattingStats = (
    playerId
  ) => {
    const row = battingCard.find(
      (b) =>
        b.player_id === playerId ||
        b.id === playerId
    );

    if (!row) {
      return {
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
      };
    }

    return {
      runs: Number(
        row.runs ??
          row.runs_scored ??
          row.total_runs ??
          0
      ),

      balls: Number(
        row.balls ??
          row.balls_faced ??
          0
      ),

      fours: Number(
        row.fours ??
          row.boundaries_4 ??
          0
      ),

      sixes: Number(
        row.sixes ??
          row.boundaries_6 ??
          0
      ),

      is_out: !!row.is_out,
    };
  };

  const getBowlingStats = (
    playerId
  ) => {
    const row = bowlingCard.find(
      (b) =>
        b.player_id === playerId ||
        b.id === playerId
    );

    if (!row) {
      return {
        balls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0,
        economy: '0.00',
      };
    }

    const balls = Number(
      row.balls ??
        row.balls_bowled ??
        row.total_balls ??
        0
    );

    const runs = Number(
      row.runs ??
        row.runs_conceded ??
        0
    );

    const wickets = Number(
      row.wickets ??
        row.wickets_taken ??
        0
    );

    const maidens = Number(
      row.maidens ??
        row.maidens_bowled ??
        0
    );

    return {
      balls,
      runs,
      wickets,
      maidens,
      economy:
        balls > 0
          ? (
              runs /
              (balls / 6)
            ).toFixed(2)
          : '0.00',
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

  const totalRuns = Number(
    inn.total_runs || 0
  );

  const totalWickets = Number(
    inn.total_wickets || 0
  );

  const totalBalls = Number(
    inn.total_balls || 0
  );

  const oversText =
    formatOvers(totalBalls);

  const runRate =
    totalBalls > 0
      ? (
          totalRuns /
          (totalBalls / 6)
        ).toFixed(2)
      : '0.00';

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
   * =========================================================
   * PREVIOUS BOWLER
   *
   * Used to prevent choosing the same bowler again when
   * the backend/current ball data provides the ID.
   * =========================================================
   */

  let previousBowlerId = null;

  for (
    let i = recentBalls.length - 1;
    i >= 0;
    i--
  ) {
    const b = recentBalls[i];

    if (
      b?.bowler_id ||
      b?.current_bowler_id ||
      b?.player_id
    ) {
      previousBowlerId =
        b.bowler_id ||
        b.current_bowler_id ||
        null;

      if (previousBowlerId) {
        break;
      }
    }
  }

  /*
   * =========================================================
   * LOCAL UPDATE
   * =========================================================
   */

  const updateCurrentInnings = (
    updated
  ) => {
    if (!updated) return;

    setInnings((prev) =>
      prev.map((item) => {
        if (
          item?.innings?.id !==
          updated.id
        ) {
          return item;
        }

        return {
          ...item,
          innings: {
            ...item.innings,
            ...updated,
          },
        };
      })
    );
  };

  /*
   * =========================================================
   * OPTIMISTIC SCORE
   * =========================================================
   */

  const optimisticBall = (
    payload
  ) => {
    const runs = Number(
      payload.runs || 0
    );

    const extraRuns = Number(
      payload.extra_runs || 0
    );

    const extraType =
      payload.extra_type || null;

    let teamRuns = runs;

    if (extraType === 'wide') {
      teamRuns = Math.max(
        1,
        extraRuns
      );
    } else if (
      extraType === 'noball'
    ) {
      teamRuns =
        Math.max(
          1,
          extraRuns
        ) + runs;
    } else if (
      extraType === 'bye' ||
      extraType === 'legbye' ||
      extraType === 'penalty'
    ) {
      teamRuns = extraRuns;
    }

    setPendingBall({
      payload,
      teamRuns,
    });

    setInnings((prev) =>
      prev.map((item) => {
        if (
          item?.innings?.id !==
          inn.id
        ) {
          return item;
        }

        const old = item.innings;

        const legal =
          extraType !== 'wide' &&
          extraType !== 'noball' &&
          extraType !== 'penalty';

        const nextBalls =
          Number(
            old.total_balls || 0
          ) +
          (legal ? 1 : 0);

        const nextRuns =
          Number(
            old.total_runs || 0
          ) + teamRuns;

        let nextWickets =
          Number(
            old.total_wickets || 0
          );

        if (payload.wicket) {
          nextWickets += 1;
        }

        let nextStriker =
          old.striker_id;

        let nextNonStriker =
          old.non_striker_id;

        if (
          legal &&
          runs % 2 === 1
        ) {
          const temp =
            nextStriker;

          nextStriker =
            nextNonStriker;

          nextNonStriker =
            temp;
        }

        return {
          ...item,

          innings: {
            ...old,

            total_runs:
              nextRuns,

            total_wickets:
              nextWickets,

            total_balls:
              nextBalls,

            striker_id:
              nextStriker,

            non_striker_id:
              nextNonStriker,
          },
        };
      })
    );
  };

  /*
   * =========================================================
   * RECORD BALL
   * =========================================================
   */

  const playBall = async (
    payload
  ) => {
    if (savingBall) {
      return;
    }

    if (
      !inn.striker_id ||
      !inn.non_striker_id
    ) {
      setError(
        'Select both batsmen first.'
      );
      return;
    }

    if (
      !inn.current_bowler_id
    ) {
      setError(
        'Select a bowler first.'
      );

      /*
       * Open bowler popup automatically.
       */
      setShowNextBowler(true);

      return;
    }

    setError('');

    if (
      !payload.extra_type &&
      Number(payload.runs) === 4
    ) {
      popBoundary('four');
    }

    if (
      !payload.extra_type &&
      Number(payload.runs) === 6
    ) {
      popBoundary('six');
    }

    if (payload.wicket) {
      popWicket();
    }

    /*
     * UPDATE SCREEN IMMEDIATELY.
     */
    optimisticBall(payload);

    setSavingBall(true);

    try {
      const result =
        await Innings.ball(
          inn.id,
          payload
        );

      /*
       * Backend becomes authoritative.
       */
      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      /*
       * If backend provides complete
       * scoreboard, use it.
       */
      if (
        result?.scoreboard?.innings
      ) {
        setInnings((prev) =>
          prev.map((item) =>
            item?.innings?.id ===
            inn.id
              ? result.scoreboard
              : item
          )
        );
      }

      /*
       * OVER COMPLETED
       *
       * Open popup immediately after
       * the 6th legal ball.
       */
      if (
        result?.overJustCompleted
      ) {
        setNextBowlerId(null);
        setShowNextBowler(true);
      }

      /*
       * If innings is completed,
       * reload the complete match.
       */
      if (
        result?.innings?.completed ||
        result?.match
      ) {
        await loadFull();
      }

      setPendingBall(null);
    } catch (err) {
      console.error(
        'Record ball error:',
        err
      );

      setPendingBall(null);

      /*
       * Restore real server state.
       */
      await loadFull();

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to record ball'
      );
    } finally {
      setSavingBall(false);
    }
  };

  /*
   * =========================================================
   * RUN BUTTON
   * =========================================================
   */

  const recordRuns = (
    runs
  ) => {
    playBall({
      runs,
      extra_type: null,
      extra_runs: 0,
    });
  };

  /*
   * =========================================================
   * EXTRAS
   * =========================================================
   */

  const recordExtra = (
    type
  ) => {
    if (type === 'wide') {
      playBall({
        runs: 0,
        extra_type: 'wide',
        extra_runs: 1,
      });

      return;
    }

    if (type === 'noball') {
      playBall({
        runs: 0,
        extra_type: 'noball',
        extra_runs: 1,
      });

      return;
    }

    if (type === 'bye') {
      playBall({
        runs: 0,
        extra_type: 'bye',
        extra_runs: 1,
      });

      return;
    }

    if (type === 'legbye') {
      playBall({
        runs: 0,
        extra_type: 'legbye',
        extra_runs: 1,
      });
    }
  };

  /*
   * =========================================================
   * WICKET
   * =========================================================
   */

  const handleWicket = async (
    wicketData
  ) => {
    setShowWicket(false);

    await playBall({
      runs: Number(
        wicketData?.runs_before_wicket ||
          0
      ),

      extra_type:
        wicketData?.extra_type ||
        null,

      extra_runs: Number(
        wicketData?.extra_runs || 0
      ),

      wicket: true,

      wicket_type:
        wicketData?.wicket_type ||
        'unknown',

      dismissed_player_id:
        wicketData?.dismissed_player_id ||
        inn.striker_id,

      fielder_id:
        wicketData?.fielder_id ||
        null,
    });
  };

  /*
   * =========================================================
   * BATSMEN SELECTION
   * =========================================================
   */

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
          try {
            setError('');

            const result =
              await Innings.setBatsmen(
                inn.id,
                {
                  striker_id:
                    strikerId ||
                    inn.striker_id,

                  non_striker_id:
                    nonStrikerId ||
                    inn.non_striker_id,
                }
              );

            if (result?.innings) {
              updateCurrentInnings(
                result.innings
              );
            }

            await loadFull();

            /*
             * After batsmen are selected,
             * show first bowler popup.
             */
            setNextBowlerId(null);
            setShowNextBowler(true);
          } catch (err) {
            setError(
              err?.response?.data?.error ||
                err?.message ||
                'Failed to set batsmen'
            );
          }
        }}
      />
    );
  }

  /*
   * =========================================================
   * MAIN SCORER
   * =========================================================
   */

  return (
    <div className="max-w-2xl mx-auto space-y-3 fade-in">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">

          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-slate-400">
              {inn.innings_number
                ? `Innings ${inn.innings_number}`
                : 'Live Scoring'}
            </div>

            <h1 className="text-xl font-bold mt-1 truncate">
              {match.team1_name ||
                match.team1?.name ||
                'Team'}{' '}
              vs{' '}
              {match.team2_name ||
                match.team2?.name ||
                'Team'}
            </h1>
          </div>

          <div className="text-right shrink-0">
            <div className="text-3xl font-black tabular-nums">
              {totalRuns}/
              {totalWickets}
            </div>

            <div className="text-xs text-slate-400">
              {oversText} overs
            </div>
          </div>

        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">

          <div className="bg-slate-900/70 rounded-xl p-3">
            <div className="text-xs text-slate-400">
              Run Rate
            </div>

            <div className="text-lg font-bold">
              {runRate}
            </div>
          </div>

          <div className="bg-slate-900/70 rounded-xl p-3">
            <div className="text-xs text-slate-400">
              Target
            </div>

            <div className="text-lg font-bold">
              {inn.target_runs ||
                '—'}
            </div>
          </div>

        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <ErrorBox error={error} />
      )}

      {/* =====================================================
          CURRENT PLAYERS
      ===================================================== */}

      <div className="card p-4">

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">
            Current Players
          </h2>

          {savingBall && (
            <span className="text-xs text-amber-400 animate-pulse">
              Saving…
            </span>
          )}
        </div>

        {/* BATTERS */}

        <div className="space-y-2">

          <BatterRow
            player={striker}
            stats={strikerStats}
            striker
          />

          <BatterRow
            player={nonStriker}
            stats={nonStrikerStats}
          />

        </div>

        {/* BOWLER DISPLAY */}

        <div className="mt-4 pt-4 border-t border-slate-700/60">

          <div className="flex items-center justify-between mb-2">

            <div className="text-sm font-semibold">
              🎯 Bowling
            </div>

            {bowler && (
              <div className="text-xs text-slate-400">
                {bowlerStats.maidens}{' '}
                maiden
                {bowlerStats.maidens === 1
                  ? ''
                  : 's'}
              </div>
            )}

          </div>

          {bowler ? (
            <div className="bg-slate-900/70 rounded-xl p-3">

              <div className="flex items-center justify-between">

                <div>
                  <div className="font-bold text-lg">
                    {bowler.name}
                  </div>

                  <div className="text-xs text-slate-400 mt-1">
                    {formatOvers(
                      bowlerStats.balls
                    )}{' '}
                    overs ·{' '}
                    {bowlerStats.runs}{' '}
                    runs ·{' '}
                    {bowlerStats.wickets}{' '}
                    wicket
                    {bowlerStats.wickets ===
                    1
                      ? ''
                      : 's'}
                  </div>
                </div>

                <div className="text-right">

                  <div className="text-lg font-bold">
                    {bowlerStats.economy}
                  </div>

                  <div className="text-xs text-slate-500">
                    Econ
                  </div>

                </div>

              </div>

            </div>
          ) : (
            <div className="bg-slate-900/60 rounded-xl p-3 text-center text-sm text-amber-400">
              Choose the bowler from the popup.
            </div>
          )}

        </div>

      </div>

      {/* =====================================================
          CURRENT OVER
      ===================================================== */}

      <div className="card p-4">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-bold">
            Current Over
          </h2>

          <span className="text-xs text-slate-400">
            {Math.floor(
              totalBalls / 6
            ) + 1}
          </span>

        </div>

        <div className="flex flex-wrap gap-2 min-h-[48px]">

          {currentOver.length === 0 ? (
            <div className="text-sm text-slate-500 py-2">
              No balls yet
            </div>
          ) : (
            currentOver.map(
              (ball, index) => (
                <BallChip
                  key={
                    ball.id ||
                    ball.ball_id ||
                    index
                  }
                  ball={ball}
                />
              )
            )
          )}

          {pendingBall && (
            <div className="w-10 h-10 rounded-full border border-amber-400/60 bg-amber-500/10 flex items-center justify-center text-sm font-bold animate-pulse">
              {getPendingDisplay(
                pendingBall.payload
              )}
            </div>
          )}

        </div>

      </div>

      {/* =====================================================
          SCORING CONTROLS
      ===================================================== */}

      <div className="card p-4">

        <div className="text-sm font-semibold mb-3">
          Score Runs
        </div>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(
            (run) => (
              <button
                key={run}
                type="button"
                disabled={
                  savingBall ||
                  needBowler
                }
                onClick={() =>
                  recordRuns(run)
                }
                className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition font-bold text-xl disabled:opacity-40"
              >
                {run}
              </button>
            )
          )}

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(4)
            }
            className="h-14 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition font-black text-xl disabled:opacity-40"
          >
            4
          </button>

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(6)
            }
            className="h-14 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 transition font-black text-xl disabled:opacity-40"
          >
            6
          </button>

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordExtra('wide')
            }
            className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition font-bold disabled:opacity-40"
          >
            WD
          </button>

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordExtra('noball')
            }
            className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition font-bold disabled:opacity-40"
          >
            NB
          </button>

        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordExtra('bye')
            }
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition font-semibold disabled:opacity-40"
          >
            Bye
          </button>

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordExtra('legbye')
            }
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition font-semibold disabled:opacity-40"
          >
            Leg Bye
          </button>

          <button
            type="button"
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              setShowWicket(true)
            }
            className="h-12 rounded-xl bg-red-700 hover:bg-red-600 active:scale-95 transition font-black disabled:opacity-40"
          >
            WICKET
          </button>

        </div>

      </div>

      {/* =====================================================
          RECENT BALLS
      ===================================================== */}

      {recentBalls.length > 0 && (
        <div className="card p-4">

          <h2 className="font-bold mb-3">
            Recent Balls
          </h2>

          <div className="flex flex-wrap gap-2">

            {recentBalls
              .slice(-12)
              .map(
                (ball, index) => (
                  <BallChip
                    key={
                      ball.id ||
                      ball.ball_id ||
                      `recent-${index}`
                    }
                    ball={ball}
                  />
                )
              )}

          </div>

        </div>
      )}

      {/* =====================================================
          BOUNDARY FLASH
      ===================================================== */}

      {boundary && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">

          <div className="text-7xl font-black animate-ping">
            {boundary === 'six'
              ? 'SIX! 🔥'
              : 'FOUR! 💥'}
          </div>

        </div>
      )}

      {/* =====================================================
          WICKET FLASH
      ===================================================== */}

      {flashWicket && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">

          <div className="text-7xl font-black text-red-400 animate-ping">
            WICKET! 🏏
          </div>

        </div>
      )}

      {/* =====================================================
          WICKET MODAL
      ===================================================== */}

      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          players={
            battingTeamPlayers
          }
          onClose={() =>
            setShowWicket(false)
          }
          onConfirm={
            handleWicket
          }
        />
      )}

      {/* =====================================================
          NEXT BOWLER POPUP
          
          THIS IS THE IMPORTANT NEW UI.
          
          It appears:
          - before first over
          - after every completed over
          
          It is NOT below the scorer.
      ===================================================== */}

      {showNextBowler && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">

          <div className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-3xl shadow-2xl p-5 animate-in fade-in zoom-in duration-200">

            {/* TOP ICON */}

            <div className="text-center">

              <div className="text-5xl mb-2">
                🎯
              </div>

              <h2 className="text-2xl font-black">
                {totalBalls === 0
                  ? 'SELECT BOWLER'
                  : 'OVER COMPLETED'}
              </h2>

              {totalBalls > 0 && (
                <p className="text-sm text-slate-400 mt-1">
                  Choose the bowler for
                  the next over
                </p>
              )}

            </div>

            {/* OVER SUMMARY */}

            {totalBalls > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-5">

                <div className="bg-slate-900 rounded-2xl p-3 text-center">

                  <div className="text-xs text-slate-500">
                    OVERS
                  </div>

                  <div className="text-xl font-black">
                    {oversText}
                  </div>

                </div>

                <div className="bg-slate-900 rounded-2xl p-3 text-center">

                  <div className="text-xs text-slate-500">
                    SCORE
                  </div>

                  <div className="text-xl font-black">
                    {totalRuns}/
                    {totalWickets}
                  </div>

                </div>

              </div>
            )}

            {/* BOWLER */}

            <div className="mt-5">

              <label className="block text-sm font-semibold mb-2">
                NEXT BOWLER
              </label>

              <PlayerAutocomplete
                players={
                  bowlingTeamPlayers
                }
                value={
                  nextBowlerId
                }
                onChange={
                  setNextBowlerId
                }
                teamId={
                  inn.bowling_team_id
                }
                onCreated={
                  handlePlayerCreated
                }
                excludeIds={
                  previousBowlerId
                    ? [
                        previousBowlerId,
                      ]
                    : []
                }
                placeholder="Select or type bowler…"
              />

            </div>

            {/* START BUTTON */}

            <button
              type="button"
              disabled={
                !nextBowlerId ||
                selectingBowler
              }
              onClick={async () => {
                if (
                  !nextBowlerId ||
                  selectingBowler
                ) {
                  return;
                }

                try {
                  setSelectingBowler(
                    true
                  );
                  setError('');

                  const result =
                    await Innings.setBowler(
                      inn.id,
                      {
                        bowler_id:
                          nextBowlerId,
                      }
                    );

                  if (
                    result?.innings
                  ) {
                    updateCurrentInnings(
                      result.innings
                    );
                  }

                  setShowNextBowler(
                    false
                  );

                  setNextBowlerId(
                    null
                  );

                  await loadFull();
                } catch (err) {
                  console.error(
                    'Set bowler error:',
                    err
                  );

                  setError(
                    err?.response?.data
                      ?.error ||
                      err?.message ||
                      'Failed to select bowler'
                  );
                } finally {
                  setSelectingBowler(
                    false
                  );
                }
              }}
              className="w-full mt-5 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition font-black text-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {selectingBowler
                ? 'STARTING…'
                : 'START OVER'}
            </button>

            {/* ERROR */}

            {error && (
              <div className="mt-3">
                <ErrorBox
                  error={error}
                />
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}


/* =========================================================
   BATSMEN SELECTION
========================================================= */

function SelectBatsmen({
  team,
  outIds,
  teamId,
  onPlayerCreated,
  hasStriker,
  hasNonStriker,
  onSelect,
}) {
  const [strikerId, setStrikerId] =
    useState(null);

  const [
    nonStrikerId,
    setNonStrikerId,
  ] = useState(null);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const available = team.filter(
    (p) => !outIds.has(p.id)
  );

  const submit = async () => {
    if (
      !strikerId ||
      !nonStrikerId
    ) {
      setError(
        'Select both striker and non-striker.'
      );
      return;
    }

    if (
      strikerId ===
      nonStrikerId
    ) {
      setError(
        'Striker and non-striker must be different.'
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSelect(
        strikerId,
        nonStrikerId
      );
    } catch (err) {
      setError(
        err?.message ||
          'Failed to set batsmen'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto card space-y-5 fade-in">

      <div className="text-center">

        <div className="text-5xl mb-2">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Select Batsmen
        </h1>

        <p className="text-sm text-slate-400 mt-1">
          Choose the two batsmen at
          the crease.
        </p>

      </div>

      {error && (
        <ErrorBox error={error} />
      )}

      <div>

        <label className="block text-sm font-semibold mb-2">
          Striker
        </label>

        <PlayerAutocomplete
          players={available.filter(
            (p) =>
              p.id !==
              nonStrikerId
          )}
          value={strikerId}
          onChange={setStrikerId}
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Type striker name…"
        />

      </div>

      <div>

        <label className="block text-sm font-semibold mb-2">
          Non-Striker
        </label>

        <PlayerAutocomplete
          players={available.filter(
            (p) =>
              p.id !== strikerId
          )}
          value={nonStrikerId}
          onChange={
            setNonStrikerId
          }
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Type non-striker name…"
        />

      </div>

      <button
        type="button"
        disabled={
          saving ||
          !strikerId ||
          !nonStrikerId
        }
        onClick={submit}
        className="btn btn-primary w-full"
      >
        {saving
          ? 'Starting…'
          : 'Start Scoring'}
      </button>

    </div>
  );
}


/* =========================================================
   BATTER ROW
========================================================= */

function BatterRow({
  player,
  stats,
  striker = false,
}) {
  return (
    <div
      className={[
        'flex items-center justify-between',
        'rounded-xl px-3 py-3',
        striker
          ? 'bg-emerald-900/25 border border-emerald-500/30'
          : 'bg-slate-900/60',
      ].join(' ')}
    >

      <div className="flex items-center gap-2 min-w-0">

        <span
          className={
            striker
              ? 'text-emerald-400'
              : 'text-slate-500'
          }
        >
          {striker ? '🏏' : ' '}
        </span>

        <div className="min-w-0">

          <div className="font-semibold truncate">
            {player?.name ||
              'Not selected'}
          </div>

          <div className="text-xs text-slate-400">
            {stats.fours}×4 ·{' '}
            {stats.sixes}×6
          </div>

        </div>

      </div>

      <div className="text-right">

        <div className="text-xl font-black tabular-nums">
          {stats.runs}
          <span className="text-sm text-slate-400 font-medium">
            {' '}
            ({stats.balls})
          </span>
        </div>

        {stats.is_out && (
          <div className="text-[10px] text-red-400">
            OUT
          </div>
        )}

      </div>

    </div>
  );
}


/* =========================================================
   BALL CHIP
========================================================= */

function BallChip({ ball }) {
  const display =
    ball.display ??
    ball.ball_display ??
    ball.result ??
    getBallFallback(ball);

  const isWicket =
    display === 'W' ||
    ball.wicket ||
    ball.is_wicket;

  const isBoundary =
    display === '4' ||
    display === '6';

  return (
    <div
      className={[
        'w-10 h-10 rounded-full',
        'flex items-center justify-center',
        'font-bold text-sm',
        'border',

        isWicket
          ? 'bg-red-900/50 border-red-500 text-red-300'
          : isBoundary
          ? 'bg-amber-900/40 border-amber-500 text-amber-300'
          : 'bg-slate-800 border-slate-700 text-slate-200',
      ].join(' ')}
    >
      {display}
    </div>
  );
}


/* =========================================================
   ERROR
========================================================= */

function ErrorBox({ error }) {
  return (
    <div className="bg-red-900/40 border border-red-600/60 text-red-200 rounded-xl p-3 text-sm">
      {error}
    </div>
  );
}


/* =========================================================
   HELPERS
========================================================= */

function formatOvers(balls) {
  const totalBalls =
    Number(balls || 0);

  return `${Math.floor(
    totalBalls / 6
  )}.${totalBalls % 6}`;
}

function getPendingDisplay(
  payload
) {
  if (payload?.wicket) {
    return 'W';
  }

  if (
    payload?.extra_type ===
    'wide'
  ) {
    return 'WD';
  }

  if (
    payload?.extra_type ===
    'noball'
  ) {
    return 'NB';
  }

  if (
    payload?.extra_type ===
    'bye'
  ) {
    return `B${
      payload.extra_runs || 1
    }`;
  }

  if (
    payload?.extra_type ===
    'legbye'
  ) {
    return `LB${
      payload.extra_runs || 1
    }`;
  }

  return String(
    Number(
      payload?.runs || 0
    )
  );
}

function getBallFallback(ball) {
  if (
    ball?.wicket ||
    ball?.is_wicket
  ) {
    return 'W';
  }

  if (
    ball?.extra_type ===
    'wide'
  ) {
    return `WD${
      Number(
        ball.extra_runs || 1
      ) > 1
        ? ball.extra_runs
        : ''
    }`;
  }

  if (
    ball?.extra_type ===
    'noball'
  ) {
    return 'NB';
  }

  if (
    ball?.extra_type ===
    'bye'
  ) {
    return `B${
      ball.extra_runs || 1
    }`;
  }

  if (
    ball?.extra_type ===
    'legbye'
  ) {
    return `LB${
      ball.extra_runs || 1
    }`;
  }

  return String(
    Number(
      ball?.runs ??
        ball?.batsman_runs ??
        ball?.team_runs ??
        0
    )
  );
}
