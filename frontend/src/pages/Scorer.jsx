import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
   * IMPORTANT
   * We use a separate saving ref instead of only React state.
   * This prevents two fast clicks from creating two balls.
   */
  const savingRef = useRef(false);

  const [savingBall, setSavingBall] = useState(false);

  /*
   * Optimistic ball.
   *
   * The UI shows this ball immediately.
   * When the server/socket sends the real scoreboard,
   * this is removed automatically.
   */
  const [optimisticBall, setOptimisticBall] = useState(null);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
  =====================================================
  LOAD MATCH
  =====================================================
  */

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      setMatch(data?.match || null);

      setPlayers(
        Array.isArray(data?.players)
          ? data.players
          : []
      );

      setInnings(
        Array.isArray(data?.innings)
          ? data.innings
          : []
      );

      setOptimisticBall(null);
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
  =====================================================
  SOCKET
  =====================================================
  */

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

        /*
         * Server has now confirmed the ball.
         * Remove optimistic ball.
         */
        setOptimisticBall(null);
      }
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
  =====================================================
  PLAYER CREATED
  =====================================================
  */

  const handlePlayerCreated = useCallback((player) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  /*
  =====================================================
  VISUAL EFFECTS
  =====================================================
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
  =====================================================
  GENERIC ACTION
  =====================================================
  */

  const act = async (fn) => {
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

  /*
  =====================================================
  LOADING
  =====================================================
  */

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

  /*
  =====================================================
  MATCH COMPLETED
  =====================================================
  */

  if (match.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <div className="text-5xl">🏆</div>

        <h1 className="text-2xl font-bold">
          Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
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

  /*
  =====================================================
  INNINGS BREAK
  =====================================================
  */

  if (match.status === 'innings-break') {
    if (!currentInnings) {
      return (
        <p className="text-slate-400">
          Loading innings…
        </p>
      );
    }

    const breakInn = currentInnings.innings;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">

        <div className="text-5xl">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {breakInn.total_runs}/{breakInn.total_wickets}
          {' '}in {currentInnings.overs} overs
        </p>

        <button
          className="btn btn-primary w-full"
          onClick={async () => {
            const result = await act(
              () =>
                Matches.startSecondInnings(matchId)
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

  /*
  =====================================================
  NO INNINGS
  =====================================================
  */

  if (!currentInnings) {
    return (
      <p className="text-slate-400">
        Setting up…
      </p>
    );
  }

  const inn = currentInnings.innings;

  /*
  =====================================================
  TEAM PLAYERS
  =====================================================
  */

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

  /*
  =====================================================
  SCORECARDS
  =====================================================
  */

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

  /*
  =====================================================
  OUT BATTERS
  =====================================================
  */

  const outIds = useMemo(() => {
    return new Set(
      battingCard
        .filter((b) => b.is_out)
        .map((b) => b.player_id || b.id)
    );
  }, [battingCard]);

  /*
  =====================================================
  PLAYERS
  =====================================================
  */

  const striker = players.find(
    (p) => p.id === inn.striker_id
  );

  const nonStriker = players.find(
    (p) => p.id === inn.non_striker_id
  );

  const bowler = players.find(
    (p) => p.id === inn.current_bowler_id
  );

  /*
  =====================================================
  BATTER STATS
  =====================================================
  */

  const getBattingStats = useCallback(
    (playerId) => {
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
          is_out: false
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

        is_out: Boolean(row.is_out)
      };
    },
    [battingCard]
  );

  /*
  =====================================================
  BOWLER STATS
  =====================================================
  */

  const getBowlingStats = useCallback(
    (playerId) => {
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
          maidens: 0
        };
      }

      return {
        balls: Number(
          row.legalBalls ??
          row.balls ??
          row.balls_bowled ??
          row.total_balls ??
          0
        ),

        runs: Number(
          row.runs ??
          row.runs_conceded ??
          0
        ),

        wickets: Number(
          row.wickets ??
          row.wickets_taken ??
          0
        ),

        maidens: Number(
          row.maidens ??
          0
        )
      };
    },
    [bowlingCard]
  );

  /*
  =====================================================
  CURRENT STATS
  =====================================================
  */

  let strikerStats =
    getBattingStats(inn.striker_id);

  let nonStrikerStats =
    getBattingStats(inn.non_striker_id);

  let bowlerStats =
    getBowlingStats(inn.current_bowler_id);

  /*
  =====================================================
  OPTIMISTIC UI
  =====================================================

  Immediately apply the clicked ball to the
  visible statistics.

  This makes the scorer feel instant even when
  Render/Turso takes a little longer.
  =====================================================
  */

  const displayRuns =
    optimisticBall
      ? optimisticBall.displayTotalRuns
      : Number(inn.total_runs || 0);

  const displayWickets =
    optimisticBall
      ? optimisticBall.displayTotalWickets
      : Number(inn.total_wickets || 0);

  const displayBalls =
    optimisticBall
      ? optimisticBall.displayTotalBalls
      : Number(inn.total_balls || 0);

  const displayStrikerStats = {
    ...strikerStats
  };

  const displayNonStrikerStats = {
    ...nonStrikerStats
  };

  const displayBowlerStats = {
    ...bowlerStats
  };

  /*
  Apply optimistic batting statistics.
  */

  if (optimisticBall) {
    const target =
      optimisticBall.batsmanId === inn.striker_id
        ? displayStrikerStats
        : displayNonStrikerStats;

    if (optimisticBall.countBallForBatter) {
      target.balls += 1;
    }

    target.runs += optimisticBall.batsmanRuns;

    if (optimisticBall.batsmanRuns === 4) {
      target.fours += 1;
    }

    if (optimisticBall.batsmanRuns === 6) {
      target.sixes += 1;
    }

    /*
    Bowler:
    wides/no-balls are not legal balls.
    Byes/leg-byes don't count as bowler runs.
    */

    if (optimisticBall.isLegal) {
      displayBowlerStats.balls += 1;
    }

    displayBowlerStats.runs +=
      optimisticBall.bowlerRuns;

    if (
      optimisticBall.isWicket &&
      optimisticBall.wicketType !== 'run-out'
    ) {
      displayBowlerStats.wickets += 1;
    }
  }

  /*
  =====================================================
  FORMAT OVERS
  =====================================================
  */

  const formatOvers = (balls) => {
    const total = Number(balls || 0);

    return `${Math.floor(total / 6)}.${total % 6}`;
  };

  /*
  =====================================================
  CURRENT OVER
  =====================================================
  */

  const recentBalls = Array.isArray(
    currentInnings.recentBalls
  )
    ? currentInnings.recentBalls
    : [];

  const legalBalls = recentBalls.filter(
    (b) => Number(b.is_legal) === 1
  );

  const currentOverNumber =
    Math.floor(displayBalls / 6);

  const currentOverStartBall =
    currentOverNumber * 6;

  let currentOverBalls =
    recentBalls.filter(
      (b) =>
        Number(b.over_number) === currentOverNumber
    );

  /*
  If the server hasn't returned the latest ball yet,
  show the optimistic ball immediately.
  */

  if (
    optimisticBall &&
    optimisticBall.overNumber === currentOverNumber
  ) {
    currentOverBalls = [
      ...currentOverBalls,
      {
        id: `optimistic-${optimisticBall.key}`,
        is_legal: optimisticBall.isLegal ? 1 : 0,
        runs_batsman: optimisticBall.batsmanRuns,
        extra_type: optimisticBall.extraType,
        extra_runs: optimisticBall.extraRuns,
        is_wicket: optimisticBall.isWicket ? 1 : 0,
        wicket_type: optimisticBall.wicketType,
        optimistic: true
      }
    ];
  }

  /*
  Remove duplicate optimistic ball if socket already
  contains the real ball.
  */

  const uniqueCurrentOverBalls = [];

  const seenBallKeys = new Set();

  for (const ball of currentOverBalls) {
    const key =
      ball.id ||
      `${ball.over_number}-${ball.ball_in_over}-${ball.ball_sequence}`;

    if (!seenBallKeys.has(key)) {
      seenBallKeys.add(key);
      uniqueCurrentOverBalls.push(ball);
    }
  }

  currentOverBalls = uniqueCurrentOverBalls.slice(-10);

  /*
  =====================================================
  BALL DISPLAY
  =====================================================
  */

  const ballLabel = (ball) => {
    if (ball.optimistic) {
      if (ball.is_wicket) {
        return 'W';
      }

      if (ball.extra_type === 'wide') {
        return `Wd${ball.extra_runs > 1 ? ball.extra_runs - 1 : ''}`;
      }

      if (ball.extra_type === 'noball') {
        const batRuns = Number(
          ball.runs_batsman || 0
        );

        return batRuns > 0
          ? `Nb+${batRuns}`
          : 'Nb';
      }

      if (ball.extra_type === 'bye') {
        return `B${ball.extra_runs}`;
      }

      if (ball.extra_type === 'legbye') {
        return `Lb${ball.extra_runs}`;
      }

      return String(
        Number(ball.runs_batsman || 0)
      );
    }

    if (Number(ball.is_wicket) === 1) {
      return 'W';
    }

    if (ball.extra_type === 'wide') {
      const extra = Number(
        ball.extra_runs || 1
      );

      return extra > 1
        ? `Wd${extra}`
        : 'Wd';
    }

    if (ball.extra_type === 'noball') {
      const batRuns = Number(
        ball.runs_batsman || 0
      );

      return batRuns > 0
        ? `Nb+${batRuns}`
        : 'Nb';
    }

    if (ball.extra_type === 'bye') {
      return `B${Number(ball.extra_runs || 0)}`;
    }

    if (ball.extra_type === 'legbye') {
      return `Lb${Number(ball.extra_runs || 0)}`;
    }

    return String(
      Number(ball.runs_batsman || 0)
    );
  };

  /*
  =====================================================
  NEED BATTERS / BOWLER
  =====================================================
  */

  const needBatsmen =
    !inn.striker_id ||
    !inn.non_striker_id;

  const needBowler =
    !needBatsmen &&
    !inn.current_bowler_id;

  /*
  =====================================================
  RECORD BALL
  =====================================================
  */

  const playBall = async (payload) => {
    /*
    Absolute protection against double-clicks.
    */

    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSavingBall(true);
    setError('');

    /*
    =================================================
    CALCULATE EFFECTS LOCALLY
    =================================================
    */

    const runs =
      Number(payload.runs || 0);

    const extraRuns =
      Number(payload.extra_runs || 0);

    const extraType =
      payload.extra_type || null;

    let teamRuns = runs;
    let batsmanRuns = runs;
    let runsRun = runs;
    let isLegal = true;
    let bowlerRuns = runs;

    if (extraType === 'wide') {
      teamRuns = Math.max(
        1,
        extraRuns
      );

      batsmanRuns = 0;

      runsRun = Math.max(
        1,
        extraRuns
      ) - 1;

      isLegal = false;

      bowlerRuns = teamRuns;
    }

    if (extraType === 'noball') {
      teamRuns =
        Math.max(1, extraRuns) +
        runs;

      batsmanRuns = runs;

      runsRun = runs;

      isLegal = false;

      bowlerRuns = teamRuns;
    }

    if (
      extraType === 'bye' ||
      extraType === 'legbye'
    ) {
      teamRuns =
        Math.max(0, extraRuns);

      batsmanRuns = 0;

      runsRun =
        Math.max(0, extraRuns);

      isLegal = true;

      bowlerRuns = 0;
    }

    if (extraType === 'penalty') {
      teamRuns =
        Math.max(0, extraRuns);

      batsmanRuns = 0;

      runsRun = 0;

      isLegal = false;

      bowlerRuns = 0;
    }

    const currentBalls =
      Number(inn.total_balls || 0);

    const newBalls =
      currentBalls +
      (isLegal ? 1 : 0);

    const newRuns =
      Number(inn.total_runs || 0) +
      teamRuns;

    const newWickets =
      Number(inn.total_wickets || 0) +
      (payload.is_wicket ? 1 : 0);

    const overNumber =
      Math.floor(
        currentBalls / 6
      );

    /*
    =================================================
    IMMEDIATE UI UPDATE
    =================================================
    */

    setOptimisticBall({
      key: `${Date.now()}-${Math.random()}`,

      displayTotalRuns:
        newRuns,

      displayTotalWickets:
        newWickets,

      displayTotalBalls:
        newBalls,

      overNumber,

      batsmanId:
        inn.striker_id,

      batsmanRuns,

      bowlerRuns,

      extraType,

      extraRuns,

      runsRun,

      isLegal,

      isWicket:
        Boolean(payload.is_wicket),

      wicketType:
        payload.wicket_type || null,

      countBallForBatter:
        extraType !== 'wide'
    });

    /*
    =================================================
    ANIMATION
    =================================================
    */

    if (
      !extraType &&
      runs === 4
    ) {
      popBoundary('four');
    }

    if (
      !extraType &&
      runs === 6
    ) {
      popBoundary('six');
    }

    if (payload.is_wicket) {
      popWicket();
    }

    /*
    =================================================
    SEND TO SERVER
    =================================================
    */

    try {
      const result = await Innings.ball(
        inn.id,
        payload
      );

      /*
      The server response contains the authoritative
      innings totals.

      Do not reload the whole match.
      */

      if (result?.innings) {
        setInnings((prev) =>
          prev.map((item) => {
            if (
              item?.innings?.id !== inn.id
            ) {
              return item;
            }

            return {
              ...item,
              innings: result.innings
            };
          })
        );
      }

      /*
      If backend eventually returns a complete
      scoreboard, use it immediately.
      */

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

        setOptimisticBall(null);
      }

      /*
      Match can change to innings-break/completed.
      */

      if (
        result?.match
      ) {
        setMatch(result.match);
      }

    } catch (err) {
      console.error(
        'Record ball error:',
        err
      );

      /*
      Server rejected the ball.
      Remove optimistic display.
      */

      setOptimisticBall(null);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to record ball'
      );
    } finally {
      savingRef.current = false;
      setSavingBall(false);
    }
  };

  /*
  =====================================================
  SELECT BATSMEN
  =====================================================
  */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={battingTeamPlayers}
        outIds={outIds}
        teamId={inn.batting_team_id}
        onPlayerCreated={handlePlayerCreated}
        hasStriker={!!inn.striker_id}
        hasNonStriker={!!inn.non_striker_id}
        onSelect={async (
          strikerId,
          nonStrikerId
        ) => {
          const result = await act(
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

  /*
  =====================================================
  SELECT BOWLER
  =====================================================
  */

  if (needBowler) {
    return (
      <div className="max-w-md mx-auto card space-y-4 fade-in">

        <div className="text-center">

          <div className="text-5xl mb-2">
            🎯
          </div>

          <h1 className="text-2xl font-bold">
            Select Bowler
          </h1>

          <p className="text-sm text-slate-400 mt-1">
            Choose the bowler for this over.
          </p>

        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        <PlayerAutocomplete
          players={bowlingTeamPlayers}
          value={null}
          onChange={async (bowlerId) => {
            if (!bowlerId) {
              return;
            }

            const result = await act(
              () =>
                Innings.setBowler(
                  inn.id,
                  {
                    bowler_id: bowlerId
                  }
                )
            );

            if (result) {
              /*
              Update only the current innings
              instead of loading the entire match.
              */

              setInnings((prev) =>
                prev.map((item) =>
                  item?.innings?.id === inn.id
                    ? {
                        ...item,
                        innings: result
                      }
                    : item
                )
              );
            }
          }}
          teamId={inn.bowling_team_id}
          onCreated={handlePlayerCreated}
          placeholder="Type or select bowler…"
        />

      </div>
    );
  }

  /*
  =====================================================
  MAIN SCORER
  =====================================================
  */

  return (
    <div className="max-w-2xl mx-auto space-y-3 fade-in">

      {/* =============================================
          BOUNDARY
      ============================================= */}

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

      {/* =============================================
          SCORE HEADER
      ============================================= */}

      <div
        className={`card ${
          flashWicket
            ? 'wicket-flash'
            : ''
        }`}
      >

        <div className="flex justify-between items-center gap-3">

          <div>

            <div className="text-sm text-slate-400">
              {match.team1_short}
              {' '}vs{' '}
              {match.team2_short}
              {' '}·{' '}
              {match.overs_limit}
              {' '}overs
            </div>

            <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {displayRuns}

              <span className="text-slate-400">
                /{displayWickets}
              </span>

              <span className="text-base text-slate-400 font-medium">
                {' '}
                (
                {formatOvers(displayBalls)}
                {' '}ov)
              </span>
            </div>

          </div>

          <div className="text-right">

            <div className="text-xs text-slate-500">
              RUN RATE
            </div>

            <div className="text-xl font-bold text-emerald-400">
              {displayBalls > 0
                ? (
                    displayRuns /
                    (displayBalls / 6)
                  ).toFixed(2)
                : '0.00'}
            </div>

            {inn.target && (
              <div className="text-xs text-slate-400">
                Target {inn.target}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* =============================================
          BATTERS
      ============================================= */}

      <div className="card">

        <div className="flex justify-between items-center mb-2">

          <h3 className="font-semibold">
            🏏 Batters
          </h3>

          <span className="text-xs text-emerald-400 font-semibold">
            LIVE
          </span>

        </div>

        {/* STRIKER */}

        <div className="bg-slate-900/70 rounded-xl p-3 mb-2 border border-emerald-500/20">

          <div className="flex justify-between items-center gap-3">

            <div className="min-w-0">

              <div className="flex items-center gap-2">

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

            <div className="text-right shrink-0">

              <div className="text-2xl font-bold">

                {displayStrikerStats.runs}

                <span className="text-sm text-slate-500">
                  {' '}
                  (
                  {displayStrikerStats.balls}
                  )
                </span>

              </div>

              <div className="text-xs text-slate-400">

                {displayStrikerStats.fours}
                ×4
                {' '}
                {displayStrikerStats.sixes}
                ×6

              </div>

            </div>

          </div>

        </div>

        {/* NON STRIKER */}

        <div className="bg-slate-900/70 rounded-xl p-3">

          <div className="flex justify-between items-center gap-3">

            <div className="min-w-0">

              <div className="font-semibold truncate">
                {nonStriker?.name || '—'}
              </div>

              <div className="text-xs text-slate-500 mt-1">
                NON-STRIKER
              </div>

            </div>

            <div className="text-right shrink-0">

              <div className="text-2xl font-bold">

                {displayNonStrikerStats.runs}

                <span className="text-sm text-slate-500">
                  {' '}
                  (
                  {displayNonStrikerStats.balls}
                  )
                </span>

              </div>

              <div className="text-xs text-slate-400">

                {displayNonStrikerStats.fours}
                ×4
                {' '}
                {displayNonStrikerStats.sixes}
                ×6

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* =============================================
          BOWLER
      ============================================= */}

      <div className="card">

        <div className="flex justify-between items-center gap-3">

          <div>

            <div className="flex items-center gap-2">

              <span className="text-xl">
                🎯
              </span>

              <span className="font-bold">
                {bowler?.name || '—'}
              </span>

            </div>

            <div className="text-xs text-slate-500 mt-1">
              CURRENT BOWLER
            </div>

          </div>

          <div className="text-right">

            <div className="text-2xl font-bold">
              {formatOvers(
                displayBowlerStats.balls
              )}
            </div>

            <div className="text-xs text-slate-400">
              {displayBowlerStats.maidens}
              {' '}M
              {' · '}
              {displayBowlerStats.runs}
              {' '}R
              {' · '}
              {displayBowlerStats.wickets}
              {' '}W
            </div>

          </div>

        </div>

        {/* =========================================
            CURRENT OVER
        ========================================= */}

        <div className="mt-3 pt-3 border-t border-slate-700">

          <div className="flex justify-between items-center mb-2">

            <span className="text-sm font-semibold text-slate-300">
              Current over
            </span>

            <span className="text-xs text-slate-500">
              Over {currentOverNumber + 1}
            </span>

          </div>

          <div className="flex flex-wrap gap-2 min-h-[42px]">

            {currentOverBalls.length === 0 ? (

              <div className="text-xs text-slate-500 py-2">
                No balls yet
              </div>

            ) : (

              currentOverBalls.map(
                (ball, index) => {

                  const label =
                    ballLabel(ball);

                  const isWicket =
                    label === 'W';

                  const isBoundary =
                    label === '4' ||
                    label === '6';

                  return (
                    <div
                      key={
                        ball.id ||
                        `${index}-${label}`
                      }
                      className={`
                        min-w-[38px]
                        h-[38px]
                        px-2
                        rounded-full
                        flex
                        items-center
                        justify-center
                        font-bold
                        text-sm
                        border
                        ${
                          isWicket
                            ? 'bg-red-600 border-red-400 text-white'
                            : isBoundary
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-slate-700 border-slate-600 text-slate-100'
                        }
                        ${
                          ball.optimistic
                            ? 'ring-2 ring-emerald-400/60'
                            : ''
                        }
                      `}
                    >
                      {label}
                    </div>
                  );
                }
              )

            )}

          </div>

        </div>

      </div>

      {/* =============================================
          ERROR
      ============================================= */}

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* =============================================
          RUN BUTTONS
      ============================================= */}

      <div className="card">

        <div className="flex justify-between items-center mb-2">

          <h3 className="font-semibold text-sm text-slate-400">
            SCORE
          </h3>

          {savingBall && (
            <span className="text-xs text-emerald-400">
              Saving…
            </span>
          )}

        </div>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map((r) => (

            <button
              key={r}
              disabled={savingBall}
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

          ))}

          <button
            disabled={savingBall}
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
            disabled={savingBall}
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
            disabled={savingBall}
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
            disabled={savingBall}
            className="run-btn bg-gradient-to-br from-red-600 to-red-800 disabled:opacity-40"
            onClick={() =>
              setShowWicket(true)
            }
          >
            OUT
          </button>

        </div>

      </div>

      {/* =============================================
          EXTRAS
      ============================================= */}

      <div className="card">

        <h3 className="font-semibold mb-2 text-sm text-slate-400">
          EXTRAS
        </h3>

        {!extraPicker ? (

          <div className="grid grid-cols-4 gap-2">

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('wide')
              }
            >
              Wide
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('noball')
              }
            >
              No Ball
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('bye')
              }
            >
              Bye
            </button>

            <button
              disabled={savingBall}
              className="btn btn-secondary text-sm disabled:opacity-40"
              onClick={() =>
                setExtraPicker('legbye')
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
                  'Wide — total wide runs'}

                {extraPicker === 'noball' &&
                  'No Ball — runs off bat'}

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

              {[0, 1, 2, 3, 4, 6].map(
                (r) => (

                  <button
                    key={r}
                    disabled={savingBall}
                    className="run-btn bg-slate-700 hover:bg-slate-600 !text-base !py-3 disabled:opacity-40"
                    onClick={() => {

                      const type =
                        extraPicker;

                      setExtraPicker(null);

                      if (
                        type === 'wide'
                      ) {

                        playBall({
                          extra_type:
                            'wide',

                          extra_runs:
                            1 + r
                        });

                      } else if (
                        type === 'noball'
                      ) {

                        playBall({
                          extra_type:
                            'noball',

                          extra_runs: 1,

                          runs: r
                        });

                      } else {

                        playBall({
                          extra_type:
                            type,

                          extra_runs:
                            Math.max(r, 1)
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

      {/* =============================================
          ACTIONS
      ============================================= */}

      <div className="grid grid-cols-2 gap-2">

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-40"
          onClick={async () => {

            const result = await act(
              () =>
                Innings.undo(inn.id)
            );

            if (result) {
              await loadFull();
            }

          }}
        >
          ↺ Undo
        </button>

        <button
          disabled={savingBall}
          className="btn btn-secondary disabled:opacity-40"
          onClick={async () => {

            const result = await act(
              () =>
                Innings.swapStrike(inn.id)
            );

            if (result) {
              await loadFull();
            }

          }}
        >
          ⇄ Swap
        </button>

      </div>

      {/* =============================================
          SCOREBOARD
      ============================================= */}

      <button
        className="btn btn-secondary w-full"
        onClick={() =>
          navigate(`/match/${matchId}/live`)
        }
      >
        View Full Scoreboard
      </button>

      {/* =============================================
          WICKET MODAL
      ============================================= */}

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

            await playBall({

              runs:
                wicketType === 'run-out'
                  ? Number(
                      runsBeforeWicket || 0
                    )
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


/*
=======================================================
SELECT BATSMEN
=======================================================
*/

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

  const available = team.filter(
    (p) => !outIds.has(p.id)
  );

  return (
    <div className="max-w-md mx-auto card space-y-4 fade-in">

      <div className="text-center">

        <div className="text-5xl mb-2">
          🏏
        </div>

        <h1 className="text-xl font-bold">
          Select Batsmen
        </h1>

        <p className="text-sm text-slate-400 mt-1">
          Choose the two opening batsmen.
        </p>

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
