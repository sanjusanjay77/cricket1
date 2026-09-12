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

  /*
   * null     = no extra selector
   * 'wide'   = WIDE number row
   * 'noball' = NO BALL number row
   */
  const [showExtraPicker, setShowExtraPicker] = useState(null);

  const [error, setError] = useState('');
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [savingBall, setSavingBall] = useState(false);
  const [pendingBall, setPendingBall] = useState(null);
  const [selectingBowler, setSelectingBowler] = useState(false);

  /*
   * FULL SCOREBOARD
   * Hidden by default.
   */
  const [showFullScoreboard, setShowFullScoreboard] = useState(false);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /* =====================================================
     LOAD
  ===================================================== */

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

  /* =====================================================
     SOCKET
  ===================================================== */

  useEffect(() => {
    socket.emit('join-match', matchId);

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

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /* =====================================================
     CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      clearTimeout(wicketTimer.current);
    };
  }, []);

  /* =====================================================
     PLAYER CREATED
  ===================================================== */

  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  /* =====================================================
     FLASHES
  ===================================================== */

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

  /* =====================================================
     UPDATE INNINGS
  ===================================================== */

  const updateCurrentInnings = (updated) => {
    if (!updated) return;

    setInnings((prev) =>
      prev.map((item) => {
        if (item?.innings?.id !== updated.id) {
          return item;
        }

        return {
          ...item,

          innings: {
            ...item.innings,
            ...updated
          }
        };
      })
    );
  };

  /* =====================================================
     LOADING
  ===================================================== */

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

  /* =====================================================
     MATCH COMPLETED
  ===================================================== */

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-4">
        <div className="text-5xl">
          🏆
        </div>

        <h1 className="text-2xl font-bold">
          Match Completed
        </h1>

        <p className="text-emerald-400 font-bold">
          {match.result_text || 'Match completed'}
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={() =>
            navigate(`/match/${matchId}/live`)
          }
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  /* =====================================================
     INNINGS BREAK
  ===================================================== */

  if (match.status === 'innings-break') {
    if (!currentInnings) {
      return (
        <div className="text-center py-10">
          Loading…
        </div>
      );
    }

    const breakInn = currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4">
        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-lg">
          {breakInn.total_runs}/
          {breakInn.total_wickets}
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            try {
              await Matches.startSecondInnings(matchId);
              await loadFull();
            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.message ||
                'Failed to start innings'
              );
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && <ErrorBox error={error} />}
      </div>
    );
  }

  /* =====================================================
     NO INNINGS
  ===================================================== */

  if (!currentInnings) {
    return (
      <div className="text-center py-10 text-slate-400">
        Setting up scorer…
      </div>
    );
  }

  const inn = currentInnings.innings;

  /* =====================================================
     PLAYERS
  ===================================================== */

  const battingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.batting_team_id &&
      p.active !== false
  );

  const bowlingTeamPlayers = players.filter(
    (p) =>
      p.team_id === inn.bowling_team_id &&
      p.active !== false
  );

  const battingCard = Array.isArray(
    currentInnings.battingCard
  )
    ? currentInnings.battingCard
    : [];

  const bowlingCard = Array.isArray(
    currentInnings.bowlingCard
  )
    ? currentInnings.bowlingCard
    : [];

  const currentOver = Array.isArray(
    currentInnings.currentOver
  )
    ? currentInnings.currentOver
    : [];

  const recentBalls = Array.isArray(
    currentInnings.recentBalls
  )
    ? currentInnings.recentBalls
    : [];

  /* =====================================================
     EXTRAS
  ===================================================== */

  const extras = currentInnings.extras || {
    wide: Number(inn.extras_wide || 0),
    noball: Number(inn.extras_noball || 0),
    bye: Number(inn.extras_bye || 0),
    legbye: Number(inn.extras_legbye || 0),
    penalty: Number(inn.extras_penalty || 0)
  };

  const totalExtras = Number(
    extras.total ??
      (
        Number(extras.wide || 0) +
        Number(extras.noball || 0) +
        Number(extras.bye || 0) +
        Number(extras.legbye || 0) +
        Number(extras.penalty || 0)
      )
  );

  /* =====================================================
     BATSMEN
  ===================================================== */

  const outIds = new Set(
    battingCard
      .filter((b) => b.is_out)
      .map((b) => b.player_id)
  );

  const striker = players.find(
    (p) => p.id === inn.striker_id
  );

  const nonStriker = players.find(
    (p) => p.id === inn.non_striker_id
  );

  const bowler = players.find(
    (p) => p.id === inn.current_bowler_id
  );

  /* =====================================================
     STATS
  ===================================================== */

  const getBattingStats = (playerId) => {
    const row = battingCard.find(
      (b) => b.player_id === playerId
    );

    return {
      runs: Number(row?.runs || 0),
      balls: Number(row?.balls || 0),
      fours: Number(row?.fours || 0),
      sixes: Number(row?.sixes || 0),
      is_out: !!row?.is_out
    };
  };

  const getBowlingStats = (playerId) => {
    const row = bowlingCard.find(
      (b) => b.player_id === playerId
    );

    return {
      balls: Number(
        row?.balls ||
        row?.legalBalls ||
        0
      ),

      runs: Number(row?.runs || 0),

      wickets: Number(
        row?.wickets || 0
      ),

      maidens: Number(
        row?.maidens || 0
      ),

      economy:
        row?.economy ??
        '0.00'
    };
  };

  const strikerStats = getBattingStats(
    inn.striker_id
  );

  const nonStrikerStats = getBattingStats(
    inn.non_striker_id
  );

  const bowlerStats = getBowlingStats(
    inn.current_bowler_id
  );

  /* =====================================================
     TOTALS
  ===================================================== */

  const totalRuns = Number(
    inn.total_runs || 0
  );

  const totalWickets = Number(
    inn.total_wickets || 0
  );

  const totalBalls = Number(
    inn.total_balls || 0
  );

  const oversText = formatOvers(
    totalBalls
  );

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

  /* =====================================================
     OPTIMISTIC BALL
  ===================================================== */

  const optimisticBall = (payload) => {
    const runs = Number(
      payload.runs || 0
    );

    const extraRunsValue = Number(
      payload.extra_runs || 0
    );

    let teamRuns = runs;

    if (
      payload.extra_type === 'wide'
    ) {
      /*
       * For WIDE:
       *
       * extra_runs is TOTAL wide runs.
       *
       * WD + 0 = extra_runs 1
       * WD + 1 = extra_runs 2
       * WD + 2 = extra_runs 3
       *
       * runs must remain 0.
       */
      teamRuns = Math.max(
        1,
        extraRunsValue
      );
    } else if (
      payload.extra_type === 'noball'
    ) {
      /*
       * NO BALL:
       *
       * extra_runs = 1
       * runs = additional batsman runs
       *
       * NB     = 1
       * NB + 1 = 2
       * NB + 2 = 3
       */
      teamRuns =
        Math.max(
          1,
          extraRunsValue
        ) + runs;
    } else if (
      payload.extra_type === 'bye' ||
      payload.extra_type === 'legbye' ||
      payload.extra_type === 'penalty'
    ) {
      teamRuns = extraRunsValue;
    }

    setPendingBall({
      payload,
      teamRuns
    });

    setInnings((prev) =>
      prev.map((item) => {
        if (
          item?.innings?.id !== inn.id
        ) {
          return item;
        }

        return {
          ...item,

          innings: {
            ...item.innings,

            total_runs:
              Number(
                item.innings.total_runs || 0
              ) + teamRuns
          }
        };
      })
    );
  };

  /* =====================================================
     PLAY BALL
  ===================================================== */

  const playBall = async (payload) => {
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

    if (!inn.current_bowler_id) {
      setError(
        'Select a bowler first.'
      );

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

    optimisticBall(payload);

    setSavingBall(true);

    try {
      const result = await Innings.ball(
        inn.id,
        payload
      );

      if (result?.innings) {
        updateCurrentInnings(
          result.innings
        );
      }

      if (
        result?.scoreboard?.innings
      ) {
        setInnings((prev) =>
          prev.map((item) =>
            item?.innings?.id === inn.id
              ? result.scoreboard
              : item
          )
        );
      }

      if (result?.overJustCompleted) {
        setNextBowlerId(null);
        setShowNextBowler(true);
      }

      if (
        result?.innings?.is_completed
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

  /* =====================================================
     NORMAL RUNS
  ===================================================== */

  const recordRuns = (runs) => {
    playBall({
      runs,
      extra_type: null,
      extra_runs: 0
    });
  };

  /* =====================================================
     INLINE EXTRA PICKER
  ===================================================== */

  const openExtraPicker = (type) => {
    /*
     * Clicking the same button again closes it.
     *
     * Only one selector can be open.
     */
    setShowExtraPicker((previous) =>
      previous === type
        ? null
        : type
    );
  };

  /*
   * WIDE:
   *
   * User sees:
   *
   * 0 1 2 3 4 5 6
   *
   * These numbers mean additional runs.
   *
   * 0 -> WD       -> 1 total
   * 1 -> WD+1     -> 2 total
   * 2 -> WD+2     -> 3 total
   *
   * Therefore backend receives:
   *
   * runs: 0
   * extra_runs: number + 1
   *
   * NO BALL:
   *
   * 0 -> NB       -> 1 total
   * 1 -> NB+1     -> 2 total
   * 2 -> NB+2     -> 3 total
   *
   * Backend receives:
   *
   * runs: number
   * extra_runs: 1
   */
  const confirmExtraNumber = (number) => {
    if (!showExtraPicker) {
      return;
    }

    if (
      showExtraPicker === 'wide'
    ) {
      playBall({
        runs: 0,
        extra_type: 'wide',
        extra_runs: number + 1
      });
    }

    if (
      showExtraPicker === 'noball'
    ) {
      playBall({
        runs: number,
        extra_type: 'noball',
        extra_runs: 1
      });
    }

    setShowExtraPicker(null);
  };

  /* =====================================================
     WICKET
  ===================================================== */

  const handleWicket = async (data) => {
    setShowWicket(false);

    await playBall({
      runs: Number(
        data?.runs_before_wicket || 0
      ),

      extra_type:
        data?.extra_type || null,

      extra_runs: Number(
        data?.extra_runs || 0
      ),

      wicket: true,

      wicket_type:
        data?.wicket_type ||
        'unknown',

      dismissed_player_id:
        data?.dismissed_player_id ||
        inn.striker_id,

      fielder_id:
        data?.fielder_id || null
    });
  };

  /* =====================================================
     BATSMEN SETUP
  ===================================================== */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={inn.batting_team_id}
        onPlayerCreated={
          handlePlayerCreated
        }
        onSelect={async (
          strikerId,
          nonStrikerId
        ) => {
          try {
            const result =
              await Innings.setBatsmen(
                inn.id,
                {
                  striker_id:
                    strikerId,

                  non_striker_id:
                    nonStrikerId
                }
              );

            if (result?.innings) {
              updateCurrentInnings(
                result.innings
              );
            }

            await loadFull();

            setNextBowlerId(null);
            setShowNextBowler(true);
          } catch (err) {
            setError(
              err?.response?.data
                ?.error ||
              err?.message ||
              'Failed to set batsmen'
            );
          }
        }}
      />
    );
  }

  /* =====================================================
     MAIN UI
  ===================================================== */

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-10">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="card p-4">

        <div className="flex justify-between gap-3">

          <div>
            <div className="text-xs text-slate-400 uppercase">
              Live Scoring
            </div>

            <h1 className="text-xl font-black mt-1">
              {match.team1_name ||
                match.team1?.name ||
                'Team'}{' '}
              vs{' '}
              {match.team2_name ||
                match.team2?.name ||
                'Team'}
            </h1>
          </div>

          <div className="text-right">

            <div className="text-3xl font-black">
              {totalRuns}/
              {totalWickets}
            </div>

            <div className="text-xs text-slate-400">
              {oversText} overs
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">

          <div className="bg-slate-900 rounded-xl p-3">
            <div className="text-xs text-slate-400">
              RUN RATE
            </div>

            <div className="text-lg font-bold">
              {runRate}
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-3">
            <div className="text-xs text-slate-400">
              TARGET
            </div>

            <div className="text-lg font-bold">
              {inn.target || '—'}
            </div>
          </div>

        </div>

      </div>

      {/* ERROR */}

      {error && (
        <ErrorBox error={error} />
      )}

      {/* =================================================
          CURRENT BATTERS
      ================================================= */}

      <div className="card p-4">

        <h2 className="font-bold mb-3">
          Current Players
        </h2>

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

        <div className="border-t border-slate-700/60 mt-4 pt-4">

          <div className="text-sm font-semibold mb-2">
            🎯 Bowling
          </div>

          {bowler ? (
            <div className="bg-slate-900 rounded-xl p-3 flex justify-between">

              <div>

                <div className="font-bold text-lg">
                  {bowler.name}
                </div>

                <div className="text-xs text-slate-400">
                  {formatOvers(
                    bowlerStats.balls
                  )}{' '}
                  overs ·{' '}
                  {bowlerStats.runs}{' '}
                  runs ·{' '}
                  {bowlerStats.wickets}{' '}
                  wickets
                </div>

              </div>

              <div className="text-right">

                <div className="font-bold">
                  {bowlerStats.economy}
                </div>

                <div className="text-xs text-slate-500">
                  ECON
                </div>

              </div>

            </div>
          ) : (
            <div className="text-center text-amber-400 bg-slate-900 rounded-xl p-3">
              Select bowler from popup
            </div>
          )}

        </div>

      </div>

      {/* =================================================
          CURRENT OVER
      ================================================= */}

      <div className="card p-4">

        <div className="flex justify-between mb-3">

          <h2 className="font-bold">
            Current Over
          </h2>

          <span className="text-xs text-slate-400">
            {Math.floor(totalBalls / 6) + 1}
          </span>

        </div>

        <div className="flex flex-wrap gap-2">

          {currentOver.length === 0 ? (
            <span className="text-sm text-slate-500">
              No balls yet
            </span>
          ) : (
            currentOver.map(
              (ball, index) => (
                <BallChip
                  key={
                    ball.id ||
                    index
                  }
                  ball={ball}
                />
              )
            )
          )}

          {pendingBall && (
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center font-bold animate-pulse">
              {getPendingDisplay(
                pendingBall.payload
              )}
            </div>
          )}

        </div>

      </div>

      {/* =================================================
          SCORING CONTROLS
      ================================================= */}

      <div className="card p-4">

        <div className="text-sm font-semibold mb-3">
          Score Runs
        </div>

        {/* NORMAL RUN BUTTONS */}

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(
            (run) => (
              <button
                key={run}
                disabled={
                  savingBall ||
                  needBowler
                }
                onClick={() =>
                  recordRuns(run)
                }
                className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 font-black text-xl disabled:opacity-40"
              >
                {run}
              </button>
            )
          )}

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(4)
            }
            className="h-14 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 font-black text-xl disabled:opacity-40"
          >
            4
          </button>

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              recordRuns(6)
            }
            className="h-14 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 font-black text-xl disabled:opacity-40"
          >
            6
          </button>

          {/* WIDE */}

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              openExtraPicker('wide')
            }
            className={[
              'h-14 rounded-xl font-bold',
              showExtraPicker ===
              'wide'
                ? 'bg-amber-600 ring-2 ring-amber-300'
                : 'bg-slate-700 hover:bg-slate-600',
              'disabled:opacity-40'
            ].join(' ')}
          >
            WIDE
          </button>

          {/* NO BALL */}

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              openExtraPicker('noball')
            }
            className={[
              'h-14 rounded-xl font-bold',
              showExtraPicker ===
              'noball'
                ? 'bg-amber-600 ring-2 ring-amber-300'
                : 'bg-slate-700 hover:bg-slate-600',
              'disabled:opacity-40'
            ].join(' ')}
          >
            NO BALL
          </button>

        </div>

        {/* =================================================
            INLINE WIDE / NO BALL NUMBER ROW
        ================================================= */}

        {showExtraPicker && (
          <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl p-3">

            <div className="text-center text-xs text-slate-400 mb-2">
              {showExtraPicker === 'wide'
                ? 'WIDE — SELECT ADDITIONAL RUNS'
                : 'NO BALL — SELECT ADDITIONAL RUNS'}
            </div>

            <div className="grid grid-cols-7 gap-1.5">

              {[0, 1, 2, 3, 4, 5, 6].map(
                (number) => (
                  <button
                    key={number}
                    disabled={savingBall}
                    onClick={() =>
                      confirmExtraNumber(
                        number
                      )
                    }
                    className="h-12 rounded-xl bg-slate-800 hover:bg-emerald-600 active:scale-95 font-black text-lg border border-slate-700 hover:border-emerald-400 disabled:opacity-40"
                  >
                    {number}
                  </button>
                )
              )}

            </div>

            <div className="text-center text-xs text-slate-500 mt-2">
              {showExtraPicker === 'wide'
                ? '0 = WD · 1 = WD+1 · 2 = WD+2 · … · 6 = WD+6'
                : '0 = NB · 1 = NB+1 · 2 = NB+2 · … · 6 = NB+6'}
            </div>

          </div>
        )}

        {/* OTHER EXTRAS / WICKET */}

        <div className="grid grid-cols-3 gap-2 mt-3">

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              playBall({
                runs: 0,
                extra_type: 'bye',
                extra_runs: 1
              })
            }
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold disabled:opacity-40"
          >
            Bye
          </button>

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              playBall({
                runs: 0,
                extra_type: 'legbye',
                extra_runs: 1
              })
            }
            className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold disabled:opacity-40"
          >
            Leg Bye
          </button>

          <button
            disabled={
              savingBall ||
              needBowler
            }
            onClick={() =>
              setShowWicket(true)
            }
            className="h-12 rounded-xl bg-red-700 hover:bg-red-600 font-black disabled:opacity-40"
          >
            WICKET
          </button>

        </div>

      </div>

      {/* =================================================
          FULL SCOREBOARD BUTTON
      ================================================= */}

      <button
        onClick={() =>
          setShowFullScoreboard(
            (previous) => !previous
          )
        }
        className="w-full h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 font-black text-lg transition active:scale-[0.99]"
      >
        {showFullScoreboard
          ? '▲  HIDE SCOREBOARD'
          : '▼  FULL SCOREBOARD'}
      </button>

      {/* =================================================
          FULL SCOREBOARD
          HIDDEN BY DEFAULT
      ================================================= */}

      {showFullScoreboard && (
        <div className="card p-4">

          {/* SCORE HEADER */}

          <div className="flex justify-between items-center mb-4">

            <div>

              <div className="text-xs text-slate-500 uppercase">
                Full Scoreboard
              </div>

              <h2 className="text-2xl font-black mt-1">
                {totalRuns}/
                {totalWickets}
              </h2>

              <div className="text-xs text-slate-400 mt-1">
                {oversText} overs · RR {runRate}
              </div>

            </div>

            <div className="text-right">

              <div className="text-2xl font-black">
                {totalRuns}/
                {totalWickets}
              </div>

              <div className="text-xs text-slate-500">
                {oversText} OV
              </div>

            </div>

          </div>

          {/* =================================================
              EXTRAS
          ================================================= */}

          <div className="border-t border-slate-700 pt-4 mb-6">

            <div className="flex justify-between items-center mb-3">

              <h3 className="font-bold text-lg">
                Extras
              </h3>

              <div className="font-black text-xl text-amber-400">
                {totalExtras}
              </div>

            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

              <ExtraBox
                label="WD"
                value={extras.wide}
              />

              <ExtraBox
                label="NB"
                value={extras.noball}
              />

              <ExtraBox
                label="B"
                value={extras.bye}
              />

              <ExtraBox
                label="LB"
                value={extras.legbye}
              />

              <ExtraBox
                label="P"
                value={extras.penalty}
              />

            </div>

            <div className="mt-3 bg-slate-900 rounded-xl p-3 flex justify-between">

              <span className="text-slate-400">
                Total Extras
              </span>

              <span className="font-black">
                {totalExtras}
              </span>

            </div>

          </div>

          {/* =================================================
              BATTING
          ================================================= */}

          <div className="mb-6">

            <h3 className="font-bold mb-2">
              🏏 BATTING
            </h3>

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="text-slate-500 border-b border-slate-700">

                    <th className="text-left py-2 pr-2">
                      Batter
                    </th>

                    <th className="text-right py-2 px-1">
                      R
                    </th>

                    <th className="text-right py-2 px-1">
                      B
                    </th>

                    <th className="text-right py-2 px-1">
                      4s
                    </th>

                    <th className="text-right py-2 px-1">
                      6s
                    </th>

                    <th className="text-right py-2 pl-1">
                      SR
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {battingCard.map(
                    (row) => {

                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            row.player_id
                        );

                      const runs =
                        Number(
                          row.runs || 0
                        );

                      const balls =
                        Number(
                          row.balls || 0
                        );

                      const sr =
                        balls > 0
                          ? (
                              (runs /
                                balls) *
                              100
                            ).toFixed(1)
                          : '0.0';

                      return (
                        <tr
                          key={
                            row.player_id
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-3 font-semibold pr-2">

                            {player?.name ||
                              row.player_id}

                            {row.is_out && (
                              <span className="text-red-400 text-xs ml-2">
                                OUT
                              </span>
                            )}

                            {row.player_id ===
                              inn.striker_id && (
                              <span className="text-emerald-400 ml-1">
                                ●
                              </span>
                            )}

                            {row.player_id ===
                              inn.non_striker_id && (
                              <span className="text-slate-500 ml-1">
                                ○
                              </span>
                            )}

                          </td>

                          <td className="text-right font-bold px-1">
                            {runs}
                          </td>

                          <td className="text-right px-1">
                            {balls}
                          </td>

                          <td className="text-right px-1">
                            {row.fours || 0}
                          </td>

                          <td className="text-right px-1">
                            {row.sixes || 0}
                          </td>

                          <td className="text-right pl-1">
                            {sr}
                          </td>

                        </tr>
                      );
                    }
                  )}

                  {/* EXTRAS ROW */}

                  <tr className="border-b border-slate-700">

                    <td className="py-3 font-semibold text-amber-400">
                      Extras
                    </td>

                    <td className="text-right font-bold text-amber-400">
                      {totalExtras}
                    </td>

                    <td
                      colSpan="4"
                      className="text-right"
                    >

                      <div className="text-xs text-slate-400 whitespace-nowrap">

                        WD {extras.wide || 0}
                        {' · '}
                        NB {extras.noball || 0}
                        {' · '}
                        B {extras.bye || 0}
                        {' · '}
                        LB {extras.legbye || 0}
                        {' · '}
                        P {extras.penalty || 0}

                      </div>

                    </td>

                  </tr>

                </tbody>

              </table>

            </div>

            {/* TOTAL */}

            <div className="flex justify-between mt-3 bg-slate-900 rounded-xl p-3">

              <span className="font-bold">
                TOTAL
              </span>

              <span className="font-black text-xl">
                {totalRuns}/
                {totalWickets}
              </span>

            </div>

          </div>

          {/* =================================================
              BOWLING
          ================================================= */}

          <div className="border-t border-slate-700 pt-4">

            <h3 className="font-bold mb-2">
              🎯 BOWLING
            </h3>

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="text-slate-500 border-b border-slate-700">

                    <th className="text-left py-2">
                      Bowler
                    </th>

                    <th className="text-right py-2">
                      O
                    </th>

                    <th className="text-right py-2">
                      R
                    </th>

                    <th className="text-right py-2">
                      W
                    </th>

                    <th className="text-right py-2">
                      ECO
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {bowlingCard.map(
                    (row) => {

                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            row.player_id
                        );

                      const balls =
                        Number(
                          row.balls ||
                          row.legalBalls ||
                          0
                        );

                      const runs =
                        Number(
                          row.runs || 0
                        );

                      const wickets =
                        Number(
                          row.wickets || 0
                        );

                      const economy =
                        balls > 0
                          ? (
                              runs /
                              (balls /
                                6)
                            ).toFixed(2)
                          : '0.00';

                      return (
                        <tr
                          key={
                            row.player_id
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-3 font-semibold">
                            {player?.name ||
                              row.player_id}

                            {row.player_id ===
                              inn.current_bowler_id && (
                              <span className="text-emerald-400 ml-1">
                                ●
                              </span>
                            )}

                          </td>

                          <td className="text-right">
                            {formatOvers(
                              balls
                            )}
                          </td>

                          <td className="text-right">
                            {runs}
                          </td>

                          <td className="text-right font-bold">
                            {wickets}
                          </td>

                          <td className="text-right">
                            {economy}
                          </td>

                        </tr>
                      );
                    }
                  )}

                </tbody>

              </table>

            </div>

          </div>

          {/* =================================================
              CURRENT OVER INSIDE SCOREBOARD
          ================================================= */}

          <div className="border-t border-slate-700 mt-6 pt-4">

            <div className="flex justify-between items-center mb-3">

              <h3 className="font-bold">
                Current Over
              </h3>

              <span className="text-xs text-slate-500">
                {Math.floor(
                  totalBalls / 6
                ) + 1}
              </span>

            </div>

            <div className="flex flex-wrap gap-2">

              {currentOver.length ===
              0 ? (
                <span className="text-sm text-slate-500">
                  No balls yet
                </span>
              ) : (
                currentOver.map(
                  (ball, index) => (
                    <BallChip
                      key={
                        ball.id ||
                        index
                      }
                      ball={ball}
                    />
                  )
                )
              )}

            </div>

          </div>

        </div>
      )}

      {/* =================================================
          RECENT BALLS
      ================================================= */}

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
                      index
                    }
                    ball={ball}
                  />
                )
              )}

          </div>

        </div>
      )}

      {/* =================================================
          NEXT BOWLER POPUP
      ================================================= */}

      {showNextBowler && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">

          <div className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-3xl p-5 shadow-2xl">

            <div className="text-center">

              <div className="text-5xl">
                🎯
              </div>

              <h2 className="text-2xl font-black mt-2">
                {totalBalls === 0
                  ? 'SELECT BOWLER'
                  : 'OVER COMPLETED'}
              </h2>

              <p className="text-sm text-slate-400 mt-1">
                Select the bowler for
                the next over.
              </p>

            </div>

            {totalBalls > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-5">

                <div className="bg-slate-900 rounded-xl p-3 text-center">

                  <div className="text-xs text-slate-500">
                    OVERS
                  </div>

                  <div className="text-xl font-black">
                    {oversText}
                  </div>

                </div>

                <div className="bg-slate-900 rounded-xl p-3 text-center">

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
                placeholder="Select or type bowler…"
              />

            </div>

            <button
              disabled={
                !nextBowlerId ||
                selectingBowler
              }
              onClick={async () => {
                try {
                  setSelectingBowler(
                    true
                  );

                  const result =
                    await Innings.setBowler(
                      inn.id,
                      {
                        bowler_id:
                          nextBowlerId
                      }
                    );

                  if (result?.innings) {
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
              className="w-full h-14 mt-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black text-lg disabled:opacity-40"
            >
              {selectingBowler
                ? 'STARTING…'
                : 'START OVER'}
            </button>

          </div>

        </div>
      )}

      {/* =================================================
          WICKET MODAL
      ================================================= */}

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

      {/* =================================================
          FOUR / SIX FLASH
      ================================================= */}

      {boundary && (
        <div className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center">

          <div className="text-7xl font-black animate-ping">
            {boundary === 'six'
              ? 'SIX! 🔥'
              : 'FOUR! 💥'}
          </div>

        </div>
      )}

      {/* =================================================
          WICKET FLASH
      ================================================= */}

      {flashWicket && (
        <div className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center">

          <div className="text-7xl font-black text-red-400 animate-ping">
            WICKET! 🏏
          </div>

        </div>
      )}

    </div>
  );
}


/* =====================================================
   EXTRA BOX
===================================================== */

function ExtraBox({
  label,
  value
}) {
  return (
    <div className="bg-slate-900 rounded-xl p-3 text-center">

      <div className="text-xs text-slate-500 font-bold">
        {label}
      </div>

      <div className="text-xl font-black mt-1">
        {Number(value || 0)}
      </div>

    </div>
  );
}


/* =====================================================
   BATTER
===================================================== */

function BatterRow({
  player,
  stats,
  striker = false
}) {
  return (
    <div
      className={[
        'flex justify-between items-center rounded-xl p-3',

        striker
          ? 'bg-emerald-900/25 border border-emerald-500/30'
          : 'bg-slate-900/60'
      ].join(' ')}
    >

      <div className="flex gap-2 items-center">

        <span>
          {striker ? '🏏' : ''}
        </span>

        <div>

          <div className="font-bold">
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

        <div className="text-xl font-black">

          {stats.runs}

          <span className="text-sm text-slate-400">
            {' '}({stats.balls})
          </span>

        </div>

        {stats.is_out && (
          <div className="text-xs text-red-400">
            OUT
          </div>
        )}

      </div>

    </div>
  );
}


/* =====================================================
   BALL CHIP
===================================================== */

function BallChip({
  ball
}) {
  const display =
    ball.display ??
    ball.ball_display ??
    ball.result ??
    getBallFallback(ball);

  const wicket =
    display === 'W' ||
    ball.wicket ||
    ball.is_wicket;

  const boundary =
    display === '4' ||
    display === '6';

  return (
    <div
      className={[
        'w-10 h-10 rounded-full',
        'flex items-center justify-center',
        'font-bold text-sm border',

        wicket
          ? 'bg-red-900/50 border-red-500 text-red-300'
          : boundary
          ? 'bg-amber-900/40 border-amber-500 text-amber-300'
          : 'bg-slate-800 border-slate-700'
      ].join(' ')}
    >
      {display}
    </div>
  );
}


/* =====================================================
   SELECT BATSMEN
===================================================== */

function SelectBatsmen({
  team,
  outIds,
  teamId,
  onPlayerCreated,
  onSelect
}) {
  const [strikerId, setStrikerId] =
    useState(null);

  const [nonStrikerId, setNonStrikerId] =
    useState(null);

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
        'Select both batsmen.'
      );

      return;
    }

    if (
      strikerId ===
      nonStrikerId
    ) {
      setError(
        'Batsmen must be different.'
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
    <div className="max-w-md mx-auto card space-y-5">

      <div className="text-center">

        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-black">
          Select Batsmen
        </h1>

        <p className="text-sm text-slate-400">
          Choose the opening batsmen.
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
          players={
            available.filter(
              (p) =>
                p.id !==
                nonStrikerId
            )
          }
          value={strikerId}
          onChange={setStrikerId}
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Select striker…"
        />

      </div>

      <div>

        <label className="block text-sm font-semibold mb-2">
          Non-Striker
        </label>

        <PlayerAutocomplete
          players={
            available.filter(
              (p) =>
                p.id !==
                strikerId
            )
          }
          value={nonStrikerId}
          onChange={setNonStrikerId}
          teamId={teamId}
          onCreated={
            onPlayerCreated
          }
          placeholder="Select non-striker…"
        />

      </div>

      <button
        disabled={
          saving ||
          !strikerId ||
          !nonStrikerId
        }
        onClick={submit}
        className="btn btn-primary w-full"
      >
        {saving
          ? 'STARTING…'
          : 'START SCORING'}
      </button>

    </div>
  );
}


/* =====================================================
   ERROR
===================================================== */

function ErrorBox({
  error
}) {
  return (
    <div className="bg-red-900/40 border border-red-600/60 text-red-200 rounded-xl p-3 text-sm">
      {error}
    </div>
  );
}


/* =====================================================
   FORMAT OVERS
===================================================== */

function formatOvers(balls) {
  const total = Number(
    balls || 0
  );

  return `${Math.floor(
    total / 6
  )}.${total % 6}`;
}


/* =====================================================
   PENDING BALL DISPLAY
===================================================== */

function getPendingDisplay(
  payload
) {
  if (payload?.wicket) {
    return 'W';
  }

  /*
   * WIDE
   *
   * payload.extra_runs contains
   * TOTAL wide runs.
   *
   * 1 -> WD
   * 2 -> WD+1
   * 3 -> WD+2
   */
  if (
    payload?.extra_type ===
    'wide'
  ) {
    const total = Number(
      payload.extra_runs || 1
    );

    return total > 1
      ? `WD+${total - 1}`
      : 'WD';
  }

  /*
   * NO BALL
   *
   * payload.runs contains
   * additional batsman runs.
   */
  if (
    payload?.extra_type ===
    'noball'
  ) {
    const additional =
      Number(
        payload.runs || 0
      );

    return additional > 0
      ? `NB+${additional}`
      : 'NB';
  }

  if (
    payload?.extra_type ===
    'bye'
  ) {
    return `B${
      payload.extra_runs ||
      1
    }`;
  }

  if (
    payload?.extra_type ===
    'legbye'
  ) {
    return `LB${
      payload.extra_runs ||
      1
    }`;
  }

  if (
    payload?.extra_type ===
    'penalty'
  ) {
    return `P${
      payload.extra_runs ||
      1
    }`;
  }

  return String(
    Number(
      payload?.runs || 0
    )
  );
}


/* =====================================================
   BALL FALLBACK DISPLAY
===================================================== */

function getBallFallback(
  ball
) {
  if (
    ball?.wicket ||
    ball?.is_wicket
  ) {
    return 'W';
  }

  /*
   * WIDE
   *
   * Backend stores total wide
   * runs in extra_runs.
   */
  if (
    ball?.extra_type ===
    'wide'
  ) {
    const total = Number(
      ball?.extra_runs || 1
    );

    return total > 1
      ? `WD+${total - 1}`
      : 'WD';
  }

  /*
   * NO BALL
   *
   * Backend stores additional
   * batsman runs in runs.
   */
  if (
    ball?.extra_type ===
    'noball'
  ) {
    const additional =
      Number(
        ball?.runs ||
        ball?.runs_batsman ||
        0
      );

    return additional > 0
      ? `NB+${additional}`
      : 'NB';
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

  if (
    ball?.extra_type ===
    'penalty'
  ) {
    return `P${
      ball.extra_runs || 1
    }`;
  }

  return String(
    Number(
      ball?.runs_batsman ??
      ball?.runs ??
      0
    )
  );
}
