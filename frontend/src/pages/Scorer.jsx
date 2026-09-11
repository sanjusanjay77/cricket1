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
   * OPTIMISTIC STATE
   * =========================================================
   */

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  /*
   * =========================================================
   * SCORE QUEUE
   * =========================================================
   */

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  const boundaryTimer = useRef(null);

  /*
   * =========================================================
   * APPLY SERVER DATA
   * =========================================================
   */

  const applyServerData = useCallback((d) => {
    if (!d) return;

    setMatch(d.match);
    setPlayers(d.players || []);
    setInnings(d.innings || []);

    optimisticRef.current = null;
    setOptimistic(null);
  }, []);

  /*
   * =========================================================
   * LOAD FULL MATCH
   * =========================================================
   */

  const loadFull = useCallback(async () => {
    try {
      const d = await Matches.get(matchId);

      if (pendingCountRef.current > 0) {
        return;
      }

      applyServerData(d);
    } catch (e) {
      console.error('Failed to load match:', e);
    }
  }, [matchId, applyServerData]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * =========================================================
   * PLAYER CREATED
   * =========================================================
   */

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
      if (pendingCountRef.current > 0) {
        return;
      }

      setMatch(m);
      setInnings(i || []);

      optimisticRef.current = null;
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

      scoreQueueRef.current = [];
      processingQueueRef.current = false;
    };
  }, []);

  /*
   * =========================================================
   * BOUNDARY ANIMATION
   * =========================================================
   */

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
  };

  /*
   * =========================================================
   * WICKET ANIMATION
   * =========================================================
   */

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
      await loadFull();
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Something went wrong'
      );

      loadFull();
    }
  };

  /*
   * =========================================================
   * BUILD OPTIMISTIC BALL
   * =========================================================
   */

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previousOptimistic
  }) => {
    /*
     * -------------------------------------------------------
     * CURRENT PLAYERS
     * -------------------------------------------------------
     */

    let strikerId =
      previousOptimistic?.strikerId ??
      current.striker_id;

    let nonStrikerId =
      previousOptimistic?.nonStrikerId ??
      current.non_striker_id;

    /*
     * IMPORTANT:
     *
     * Keep the bowler who actually bowled this ball.
     *
     * We use this ID for optimistic bowling statistics
     * BEFORE setting bowlerId = null at the end of an over.
     */
    const scoringBowlerId =
      previousOptimistic?.bowlerId ??
      current.current_bowler_id;

    let bowlerId = scoringBowlerId;

    /*
     * -------------------------------------------------------
     * RUNS
     * -------------------------------------------------------
     */

    const runs = Number(payload.runs) || 0;

    const inputExtraRuns =
      Number(payload.extra_runs) || 0;

    let teamRuns = 0;
    let batsmanRuns = 0;
    let extraRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (payload.extra_type) {
      case 'wide':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        teamRuns = extraRuns;
        batsmanRuns = 0;

        runsRun =
          Math.max(
            0,
            extraRuns - 1
          );

        legal = false;
        break;

      case 'noball':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        batsmanRuns = runs;

        teamRuns =
          extraRuns +
          batsmanRuns;

        runsRun = batsmanRuns;

        legal = false;
        break;

      case 'bye':
      case 'legbye':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        teamRuns = extraRuns;
        batsmanRuns = 0;
        runsRun = extraRuns;

        legal = true;
        break;

      case 'penalty':
        extraRuns = inputExtraRuns;
        teamRuns = extraRuns;
        batsmanRuns = 0;
        runsRun = 0;

        legal = false;
        break;

      default:
        batsmanRuns = runs;
        teamRuns = runs;
        runsRun = runs;

        legal = true;
        break;
    }

    const wicket = !!payload.is_wicket;

    /*
     * -------------------------------------------------------
     * PREVIOUS TOTALS
     * -------------------------------------------------------
     */

    const previousRuns =
      previousOptimistic?.total_runs ??
      current.total_runs ??
      0;

    const previousWickets =
      previousOptimistic?.total_wickets ??
      current.total_wickets ??
      0;

    const previousBalls =
      previousOptimistic?.total_balls ??
      current.total_balls ??
      0;

    /*
     * -------------------------------------------------------
     * NEW TOTALS
     * -------------------------------------------------------
     */

    const newTotalRuns =
      previousRuns +
      teamRuns;

    const newTotalWickets =
      previousWickets +
      (wicket ? 1 : 0);

    const newTotalBalls =
      previousBalls +
      (legal ? 1 : 0);

    /*
     * -------------------------------------------------------
     * PREVIOUS BATTING CARD
     * -------------------------------------------------------
     */

    const serverBattingCard =
      currentInnings.battingCard || [];

    const previousStrikerStats =
      previousOptimistic?.strikerStats ||
      serverBattingCard.find(
        b =>
          b.player_id ===
          strikerId
      ) || {
        player_id: strikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
        how_out: null,
        dismissed_by: null,
        fielder_id: null,
        strike_rate: 0
      };

    const previousNonStrikerStats =
      previousOptimistic?.nonStrikerStats ||
      serverBattingCard.find(
        b =>
          b.player_id ===
          nonStrikerId
      ) || {
        player_id: nonStrikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
        how_out: null,
        dismissed_by: null,
        fielder_id: null,
        strike_rate: 0
      };

    /*
     * -------------------------------------------------------
     * STRIKER STATISTICS
     * -------------------------------------------------------
     */

    const strikerBallsAdded =
      payload.extra_type === 'wide'
        ? 0
        : 1;

    const newStrikerRuns =
      previousStrikerStats.runs +
      (
        !payload.extra_type ||
        payload.extra_type === 'noball'
          ? batsmanRuns
          : 0
      );

    const newStrikerBalls =
      previousStrikerStats.balls +
      strikerBallsAdded;

    const newStrikerFours =
      previousStrikerStats.fours +
      (
        batsmanRuns === 4 &&
        (
          !payload.extra_type ||
          payload.extra_type === 'noball'
        )
          ? 1
          : 0
      );

    const newStrikerSixes =
      previousStrikerStats.sixes +
      (
        batsmanRuns === 6 &&
        (
          !payload.extra_type ||
          payload.extra_type === 'noball'
        )
          ? 1
          : 0
      );

    const newStrikerStrikeRate =
      newStrikerBalls > 0
        ? Number(
            (
              (
                newStrikerRuns /
                newStrikerBalls
              ) *
              100
            ).toFixed(2)
          )
        : 0;

    const updatedStrikerStats = {
      ...previousStrikerStats,

      player_id: strikerId,

      runs: newStrikerRuns,

      balls: newStrikerBalls,

      fours: newStrikerFours,

      sixes: newStrikerSixes,

      strike_rate:
        newStrikerStrikeRate
    };

    /*
     * -------------------------------------------------------
     * NON-STRIKER
     * -------------------------------------------------------
     */

    const updatedNonStrikerStats = {
      ...previousNonStrikerStats,
      player_id: nonStrikerId
    };

    /*
     * -------------------------------------------------------
     * WICKET
     * -------------------------------------------------------
     */

    if (
      wicket &&
      payload.dismissed_id
    ) {
      if (
        payload.dismissed_id ===
        strikerId
      ) {
        updatedStrikerStats.is_out =
          true;

        updatedStrikerStats.how_out =
          payload.wicket_type || null;

        updatedStrikerStats.dismissed_by =
          scoringBowlerId || null;

        updatedStrikerStats.fielder_id =
          payload.fielder_id || null;

        strikerId = null;

      } else if (
        payload.dismissed_id ===
        nonStrikerId
      ) {
        updatedNonStrikerStats.is_out =
          true;

        updatedNonStrikerStats.how_out =
          payload.wicket_type || null;

        updatedNonStrikerStats.dismissed_by =
          scoringBowlerId || null;

        updatedNonStrikerStats.fielder_id =
          payload.fielder_id || null;

        nonStrikerId = null;
      }

    } else if (
      runsRun % 2 === 1
    ) {
      /*
       * Odd runs change strike.
       */
      [
        strikerId,
        nonStrikerId
      ] = [
        nonStrikerId,
        strikerId
      ];
    }

    /*
     * -------------------------------------------------------
     * OPTIMISTIC BOWLER STATISTICS
     * -------------------------------------------------------
     *
     * THIS IS THE MAIN FIX.
     *
     * Bowler figures are calculated immediately instead
     * of waiting for bowlingCard from the backend.
     * -------------------------------------------------------
     */

    const previousBowlerStats =
      previousOptimistic?.bowlerStats ||
      (
        currentInnings.bowlingCard ||
        []
      ).find(
        b =>
          b.player_id ===
          scoringBowlerId
      ) || {
        player_id:
          scoringBowlerId,

        overs: '0.0',

        maidens: 0,

        runs: 0,

        wickets: 0,

        economy: 0
      };

    /*
     * Bowler runs:
     *
     * Wide       -> counts
     * No-ball    -> counts
     * Normal run -> counts
     * Bye        -> does NOT count
     * Leg bye    -> does NOT count
     * Penalty    -> does NOT count
     */

    let bowlerRunsAdded = 0;

    if (
      payload.extra_type ===
      'wide'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        );

    } else if (
      payload.extra_type ===
      'noball'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        ) +
        batsmanRuns;

    } else if (
      payload.extra_type ===
        'bye' ||
      payload.extra_type ===
        'legbye'
    ) {
      bowlerRunsAdded = 0;

    } else if (
      payload.extra_type ===
      'penalty'
    ) {
      bowlerRunsAdded = 0;

    } else {
      bowlerRunsAdded =
        batsmanRuns;
    }

    /*
     * -------------------------------------------------------
     * PREVIOUS BOWLER BALLS
     * -------------------------------------------------------
     */

    let previousBowlerBalls =
      previousOptimistic?.bowlerBalls;

    if (
      previousBowlerBalls ===
      undefined
    ) {
      const oversText =
        String(
          previousBowlerStats.overs ||
          '0.0'
        );

      const parts =
        oversText.split('.');

      const completedOvers =
        Number(parts[0]) || 0;

      const ballsInOver =
        Number(parts[1]) || 0;

      previousBowlerBalls =
        completedOvers * 6 +
        ballsInOver;
    }

    /*
     * -------------------------------------------------------
     * NEW BOWLER BALLS
     * -------------------------------------------------------
     */

    const newBowlerBalls =
      previousBowlerBalls +
      (legal ? 1 : 0);

    /*
     * -------------------------------------------------------
     * NEW BOWLER RUNS
     * -------------------------------------------------------
     */

    const newBowlerRuns =
      Number(
        previousBowlerStats.runs || 0
      ) +
      bowlerRunsAdded;

    /*
     * -------------------------------------------------------
     * BOWLER WICKET
     * -------------------------------------------------------
     *
     * Run-out does not count as bowler wicket.
     * -------------------------------------------------------
     */

    const bowlerWicket =
      wicket &&
      payload.wicket_type !==
        'run-out';

    const newBowlerWickets =
      Number(
        previousBowlerStats.wickets ||
        0
      ) +
      (
        bowlerWicket
          ? 1
          : 0
      );

    /*
     * -------------------------------------------------------
     * BOWLER OVERS
     * -------------------------------------------------------
     */

    const bowlerOvers =
      `${Math.floor(
        newBowlerBalls / 6
      )}.${newBowlerBalls % 6}`;

    /*
     * -------------------------------------------------------
     * BOWLER ECONOMY
     * -------------------------------------------------------
     */

    const bowlerEconomy =
      newBowlerBalls > 0
        ? Number(
            (
              newBowlerRuns /
              (
                newBowlerBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    const updatedBowlerStats = {
      ...previousBowlerStats,

      player_id:
        scoringBowlerId,

      overs:
        bowlerOvers,

      runs:
        newBowlerRuns,

      wickets:
        newBowlerWickets,

      economy:
        bowlerEconomy
    };

    /*
     * -------------------------------------------------------
     * OVER COMPLETION
     * -------------------------------------------------------
     *
     * After 6 legal balls:
     *
     * 0.5 -> 1.0
     *
     * Strike changes.
     *
     * Bowler selection becomes empty so the scorer can
     * choose the next bowler.
     * -------------------------------------------------------
     */

    const overJustCompleted =
      legal &&
      newTotalBalls % 6 === 0 &&
      newTotalBalls >
        previousBalls;

    if (
      overJustCompleted
    ) {
      if (
        strikerId &&
        nonStrikerId
      ) {
        [
          strikerId,
          nonStrikerId
        ] = [
          nonStrikerId,
          strikerId
        ];
      }

      /*
       * Do NOT change the bowler statistics.
       *
       * Only clear the active bowler for the next over.
       */
      bowlerId = null;
    }

    /*
     * -------------------------------------------------------
     * RECENT BALL
     * -------------------------------------------------------
     */

    const previousRecentBalls =
      previousOptimistic?.recentBalls ||
      currentInnings.recentBalls ||
      [];

    const overNumber =
      Math.floor(
        previousBalls / 6
      );

    const ballInOver =
      legal
        ? (
            previousBalls % 6
          ) + 1
        : previousBalls % 6;

    const optimisticBall = {
      id:
        `optimistic-${Date.now()}-${Math.random()}`,

      ball_sequence:
        previousRecentBalls.length > 0
          ? (
              previousRecentBalls[
                previousRecentBalls.length - 1
              ].ball_sequence ||
              previousBalls
            ) + 1
          : previousBalls + 1,

      over_number:
        overNumber,

      ball_in_over:
        ballInOver,

      batsman_id:
        current.striker_id,

      non_striker_id:
        current.non_striker_id,

      bowler_id:
        scoringBowlerId,

      runs_batsman:
        batsmanRuns,

      extra_type:
        payload.extra_type || null,

      extra_runs:
        inputExtraRuns,

      is_wicket:
        wicket,

      wicket_type:
        payload.wicket_type || null,

      dismissed_id:
        payload.dismissed_id || null,

      fielder_id:
        payload.fielder_id || null,

      is_legal:
        legal ? 1 : 0
    };

    /*
     * Keep latest 12 balls.
     */

    const newRecentBalls = [
      ...previousRecentBalls,
      optimisticBall
    ].slice(-12);

    /*
     * -------------------------------------------------------
     * EXTRAS
     * -------------------------------------------------------
     */

    const previousExtras =
      previousOptimistic?.extras ||
      {
        wide:
          current.extras_wide || 0,

        noball:
          current.extras_noball || 0,

        bye:
          current.extras_bye || 0,

        legbye:
          current.extras_legbye || 0,

        penalty:
          current.extras_penalty || 0
      };

    const newExtras = {
      ...previousExtras
    };

    if (
      payload.extra_type
    ) {
      newExtras[
        payload.extra_type
      ] =
        (
          newExtras[
            payload.extra_type
          ] || 0
        ) +
        inputExtraRuns;
    }

    /*
     * -------------------------------------------------------
     * PARTNERSHIP
     * -------------------------------------------------------
     */

    const previousPartnership =
      previousOptimistic?.partnership ||
      currentInnings.partnership ||
      {
        runs: 0,
        balls: 0
      };

    const newPartnership =
      wicket
        ? {
            runs: 0,
            balls: 0
          }
        : {
            runs:
              previousPartnership.runs +
              teamRuns,

            balls:
              previousPartnership.balls +
              (
                legal ||
                payload.extra_type ===
                  'noball'
                  ? 1
                  : 0
              )
          };

    /*
     * -------------------------------------------------------
     * RUN RATE
     * -------------------------------------------------------
     */

    const newRunRate =
      newTotalBalls > 0
        ? Number(
            (
              newTotalRuns /
              (
                newTotalBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    /*
     * -------------------------------------------------------
     * RETURN OPTIMISTIC STATE
     * -------------------------------------------------------
     */

    return {
      total_runs:
        newTotalRuns,

      total_wickets:
        newTotalWickets,

      total_balls:
        newTotalBalls,

      strikerId,

      nonStrikerId,

      bowlerId,

      /*
       * IMPORTANT:
       * Bowler statistics stay available even when
       * bowlerId becomes null after the 6th ball.
       */
      bowlerStats:
        updatedBowlerStats,

      bowlerBalls:
        newBowlerBalls,

      strikerStats:
        updatedStrikerStats,

      nonStrikerStats:
        updatedNonStrikerStats,

      recentBalls:
        newRecentBalls,

      extras:
        newExtras,

      partnership:
        newPartnership,

      runRate:
        newRunRate
    };
  };

  /*
   * =========================================================
   * PROCESS SCORE QUEUE
   * =========================================================
   */

  const processScoreQueue =
    useCallback(async () => {
      if (
        processingQueueRef.current
      ) {
        return;
      }

      processingQueueRef.current =
        true;

      let failed = false;

      while (
        scoreQueueRef.current
          .length > 0
      ) {
        const item =
          scoreQueueRef.current.shift();

        if (!item) continue;

        try {
          await Innings.ball(
            item.inningsId,
            item.payload
          );

          pendingCountRef.current =
            Math.max(
              0,
              pendingCountRef.current -
                1
            );

          setPendingCount(
            pendingCountRef.current
          );

        } catch (e) {
          failed = true;

          setError(
            e?.response?.data?.error ||
            e?.message ||
            'Unable to save ball'
          );

          scoreQueueRef.current = [];

          pendingCountRef.current = 0;

          setPendingCount(0);

          optimisticRef.current =
            null;

          setOptimistic(null);

          try {
            const d =
              await Matches.get(
                matchId
              );

            applyServerData(d);
          } catch (_) {}

          break;
        }
      }

      processingQueueRef.current =
        false;

      /*
       * Final authoritative sync.
       */

      if (
        !failed &&
        pendingCountRef.current === 0
      ) {
        try {
          const d =
            await Matches.get(
              matchId
            );

          applyServerData(d);
        } catch (_) {
          /*
           * Keep optimistic display if the final sync
           * temporarily fails.
           */
        }
      }
    }, [
      matchId,
      applyServerData
    ]);

  /*
   * =========================================================
   * PLAY BALL
   * =========================================================
   */

  const playBall = (payload) => {
    const currentInnings =
      innings[
        innings.length - 1
      ];

    if (!currentInnings) {
      return;
    }

    const current =
      currentInnings.innings;

    if (!current) {
      return;
    }

    /*
     * Effective current players.
     */

    const effectiveStrikerId =
      optimisticRef.current
        ?.strikerId ??
      current.striker_id;

    const effectiveNonStrikerId =
      optimisticRef.current
        ?.nonStrikerId ??
      current.non_striker_id;

    const effectiveBowlerId =
      optimisticRef.current
        ?.bowlerId ??
      current.current_bowler_id;

    /*
     * Need all players.
     */

    if (
      !effectiveStrikerId ||
      !effectiveNonStrikerId ||
      !effectiveBowlerId
    ) {
      return;
    }

    /*
     * Boundary animation.
     */

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

    /*
     * Build from latest optimistic state.
     */

    const nextOptimistic =
      buildOptimisticBall({
        current,
        currentInnings,
        payload,
        previousOptimistic:
          optimisticRef.current
      });

    /*
     * Store synchronously in ref.
     */

    optimisticRef.current =
      nextOptimistic;

    /*
     * Update screen immediately.
     */

    setOptimistic(
      nextOptimistic
    );

    /*
     * Add request to queue.
     */

    scoreQueueRef.current.push({
      inningsId:
        current.id,

      payload
    });

    /*
     * Pending count.
     */

    pendingCountRef.current += 1;

    setPendingCount(
      pendingCountRef.current
    );

    /*
     * Start queue.
     */

    processScoreQueue();
  };

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const currentInnings =
    innings[
      innings.length - 1
    ];

  /*
   * =========================================================
   * MATCH COMPLETED
   * =========================================================
   */

  if (
    match.status ===
      'completed' &&
    pendingCount === 0
  ) {
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
    match.status ===
      'innings-break' &&
    pendingCount === 0
  ) {
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
          {
            currentInnings.innings
              .total_runs
          }
          /
          {
            currentInnings.innings
              .total_wickets
          }{' '}
          in{' '}
          {currentInnings.overs}{' '}
          overs
        </p>

        <button
          className="btn btn-primary"
          onClick={async () => {
            await Matches.startSecondInnings(
              matchId
            );

            loadFull();
          }}
        >
          Start 2nd Innings
        </button>

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
      <p className="text-slate-400">
        Setting up…
      </p>
    );
  }

  const inn =
    currentInnings.innings;

  /*
   * =========================================================
   * DISPLAY VALUES
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

  const displayOvers =
    `${Math.floor(
      displayTotalBalls / 6
    )}.${displayTotalBalls % 6}`;

  const displayRunRate =
    displayTotalBalls > 0
      ? (
          (
            displayTotalRuns /
            displayTotalBalls
          ) *
          6
        ).toFixed(2)
      : '0.00';

  /*
   * =========================================================
   * EFFECTIVE PLAYERS
   * =========================================================
   */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn.striker_id;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn.non_striker_id;

  const effectiveBowlerId =
    optimistic?.bowlerId ??
    inn.current_bowler_id;

  /*
   * =========================================================
   * TEAM PLAYERS
   * =========================================================
   */

  const battingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.batting_team_id &&
        p.active
    );

  const bowlingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active
    );

  /*
   * =========================================================
   * OUT PLAYERS
   * =========================================================
   */

  const outIds =
    new Set(
      (
        currentInnings.battingCard ||
        []
      )
        .filter(
          b => b.is_out
        )
        .map(
          b => b.player_id
        )
    );

  /*
   * =========================================================
   * CURRENT PLAYERS
   * =========================================================
   */

  const striker =
    players.find(
      p =>
        p.id ===
        effectiveStrikerId
    );

  const nonStriker =
    players.find(
      p =>
        p.id ===
        effectiveNonStrikerId
    );

  const bowler =
    players.find(
      p =>
        p.id ===
        effectiveBowlerId
    );

  /*
   * =========================================================
   * NEED BATSMEN / BOWLER
   * =========================================================
   */

  const needBatsmen =
    !effectiveStrikerId ||
    !effectiveNonStrikerId;

  const needBowler =
    !needBatsmen &&
    !effectiveBowlerId;

  /*
   * =========================================================
   * SELECT BATSMEN
   * =========================================================
   */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={
          battingTeamPlayers
        }
        outIds={outIds}
        teamId={
          inn.batting_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        hasStriker={
          !!effectiveStrikerId
        }
        hasNonStriker={
          !!effectiveNonStrikerId
        }
        onSelect={(
          strikerId,
          nonStrikerId
        ) =>
          act(() =>
            Innings.setBatsmen(
              inn.id,
              {
                striker_id:
                  strikerId ||
                  effectiveStrikerId,

                non_striker_id:
                  nonStrikerId ||
                  effectiveNonStrikerId
              }
            )
          )
        }
      />
    );
  }

  /*
   * =========================================================
   * SELECT BOWLER
   * =========================================================
   */

  if (needBowler) {
    return (
      <SelectBowler
        team={
          bowlingTeamPlayers
        }
        teamId={
          inn.bowling_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        onSelect={bowlerId =>
          act(() =>
            Innings.setBowler(
              inn.id,
              {
                bowler_id:
                  bowlerId
              }
            )
          )
        }
        error={error}
      />
    );
  }

  /*
   * =========================================================
   * SERVER BATSMAN STATS
   * =========================================================
   */

  const serverStrikerStats =
    (
      currentInnings.battingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveStrikerId
    ) || {
      player_id:
        effectiveStrikerId,

      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  const serverNonStrikerStats =
    (
      currentInnings.battingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveNonStrikerId
    ) || {
      player_id:
        effectiveNonStrikerId,

      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  /*
   * =========================================================
   * OPTIMISTIC BATSMAN STATS
   * =========================================================
   */

  const strikerStats =
    optimistic &&
    optimistic.strikerId ===
      effectiveStrikerId
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic &&
    optimistic.nonStrikerId ===
      effectiveNonStrikerId
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  /*
   * =========================================================
   * BOWLER STATS
   * =========================================================
   *
   * MAIN FIX:
   *
   * Use optimistic bowler statistics immediately.
   * =========================================================
   */

  const serverBowlerStats =
    (
      currentInnings.bowlingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveBowlerId
    ) || {
      player_id:
        effectiveBowlerId,

      overs: '0.0',

      runs: 0,

      wickets: 0,

      maidens: 0,

      economy: 0
    };

  const bowlerStats =
    optimistic?.bowlerStats &&
    optimistic.bowlerStats.player_id ===
      effectiveBowlerId
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

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
    Math.floor(
      displayTotalBalls / 6
    );

  const currentOverBalls =
    recentBalls.filter(
      ball =>
        ball.over_number ===
        currentOverNumber
    );

  /*
   * =========================================================
   * MAIN UI
   * =========================================================
   */

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

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

            {pendingCount > 0 && (
              <div className="text-emerald-400 text-xs mt-1">
                Saving {pendingCount}…
              </div>
            )}

          </div>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

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
                value={
                  strikerStats.runs
                }
                label="Runs"
                large
              />

              <Stat
                value={
                  strikerStats.balls
                }
                label="Balls"
              />

              <Stat
                value={
                  strikerStats.fours
                }
                label="4s"
              />

              <Stat
                value={
                  strikerStats.sixes
                }
                label="6s"
              />

              <Stat
                value={
                  strikerStats.strike_rate ??
                  strikerStats.strikeRate ??
                  0
                }
                label="SR"
              />

            </div>

          </div>

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
                value={
                  nonStrikerStats.runs
                }
                label="Runs"
                large
              />

              <Stat
                value={
                  nonStrikerStats.balls
                }
                label="Balls"
              />

              <Stat
                value={
                  nonStrikerStats.fours
                }
                label="4s"
              />

              <Stat
                value={
                  nonStrikerStats.sixes
                }
                label="6s"
              />

              <Stat
                value={
                  nonStrikerStats.strike_rate ??
                  nonStrikerStats.strikeRate ??
                  0
                }
                label="SR"
              />

            </div>

          </div>

          {/* =================================================
              BOWLER
          ================================================= */}

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
                value={
                  bowlerStats.overs
                }
                label="Overs"
              />

              <BowlingStat
                value={
                  bowlerStats.maidens
                }
                label="Maidens"
              />

              <BowlingStat
                value={
                  bowlerStats.runs
                }
                label="Runs"
              />

              <BowlingStat
                value={
                  bowlerStats.wickets
                }
                label="Wickets"
              />

              <BowlingStat
                value={
                  bowlerStats.economy
                }
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

          {[0, 1, 2, 3].map(
            r => (
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
            )
          )}

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

              {[0, 1, 2, 3, 4, 6].map(
                r => (
                  <button
                    key={r}
                    className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform !text-base !py-3"
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

                          runs:
                            r
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

      {/* =====================================================
          ACTION BUTTONS
      ===================================================== */}

      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.undo(
                inn.id
              )
            )
          }
        >
          ↺ Undo
        </button>

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.swapStrike(
                inn.id
              )
            )
          }
        >
          ⇄ Swap Batsmen
        </button>

      </div>

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
                wicketType ===
                'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket:
                true,

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
    String(
      ball.runs_batsman ?? 0
    );

  let className =
    'bg-slate-700';

  if (ball.is_wicket) {

    label = 'W';
    className = 'bg-red-600';

  } else if (
    ball.extra_type ===
    'wide'
  ) {

    label =
      `Wd${
        ball.extra_runs > 1
          ? `+${ball.extra_runs - 1}`
          : ''
      }`;

    className =
      'bg-yellow-600';

  } else if (
    ball.extra_type ===
    'noball'
  ) {

    label =
      `Nb${
        ball.runs_batsman
          ? `+${ball.runs_batsman}`
          : ''
      }`;

    className =
      'bg-orange-600';

  } else if (
    ball.extra_type ===
    'bye'
  ) {

    label =
      `${ball.extra_runs}B`;

    className =
      'bg-blue-600';

  } else if (
    ball.extra_type ===
    'legbye'
  ) {

    label =
      `${ball.extra_runs}Lb`;

    className =
      'bg-blue-800';

  } else if (
    ball.runs_batsman === 4
  ) {

    label = '4';

    className =
      'bg-emerald-600';

  } else if (
    ball.runs_batsman === 6
  ) {

    label = '6';

    className =
      'bg-purple-600';
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

  const [
    nonStriker,
    setNonStriker
  ] = useState(null);

  const available =
    team.filter(
      p =>
        !outIds.has(p.id)
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
            onChange={setNonStriker}
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
        onCreated={
          onPlayerCreated
        }
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
}import { useEffect, useState, useCallback, useRef } from 'react';
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
   * OPTIMISTIC STATE
   * =========================================================
   */

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  /*
   * =========================================================
   * SCORE QUEUE
   * =========================================================
   */

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  const boundaryTimer = useRef(null);

  /*
   * =========================================================
   * APPLY SERVER DATA
   * =========================================================
   */

  const applyServerData = useCallback((d) => {
    if (!d) return;

    setMatch(d.match);
    setPlayers(d.players || []);
    setInnings(d.innings || []);

    optimisticRef.current = null;
    setOptimistic(null);
  }, []);

  /*
   * =========================================================
   * LOAD FULL MATCH
   * =========================================================
   */

  const loadFull = useCallback(async () => {
    try {
      const d = await Matches.get(matchId);

      if (pendingCountRef.current > 0) {
        return;
      }

      applyServerData(d);
    } catch (e) {
      console.error('Failed to load match:', e);
    }
  }, [matchId, applyServerData]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * =========================================================
   * PLAYER CREATED
   * =========================================================
   */

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
      if (pendingCountRef.current > 0) {
        return;
      }

      setMatch(m);
      setInnings(i || []);

      optimisticRef.current = null;
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

      scoreQueueRef.current = [];
      processingQueueRef.current = false;
    };
  }, []);

  /*
   * =========================================================
   * BOUNDARY ANIMATION
   * =========================================================
   */

  const popBoundary = (kind) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(kind);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
  };

  /*
   * =========================================================
   * WICKET ANIMATION
   * =========================================================
   */

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
      await loadFull();
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.message ||
        'Something went wrong'
      );

      loadFull();
    }
  };

  /*
   * =========================================================
   * BUILD OPTIMISTIC BALL
   * =========================================================
   */

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previousOptimistic
  }) => {
    /*
     * -------------------------------------------------------
     * CURRENT PLAYERS
     * -------------------------------------------------------
     */

    let strikerId =
      previousOptimistic?.strikerId ??
      current.striker_id;

    let nonStrikerId =
      previousOptimistic?.nonStrikerId ??
      current.non_striker_id;

    /*
     * IMPORTANT:
     *
     * Keep the bowler who actually bowled this ball.
     *
     * We use this ID for optimistic bowling statistics
     * BEFORE setting bowlerId = null at the end of an over.
     */
    const scoringBowlerId =
      previousOptimistic?.bowlerId ??
      current.current_bowler_id;

    let bowlerId = scoringBowlerId;

    /*
     * -------------------------------------------------------
     * RUNS
     * -------------------------------------------------------
     */

    const runs = Number(payload.runs) || 0;

    const inputExtraRuns =
      Number(payload.extra_runs) || 0;

    let teamRuns = 0;
    let batsmanRuns = 0;
    let extraRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (payload.extra_type) {
      case 'wide':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        teamRuns = extraRuns;
        batsmanRuns = 0;

        runsRun =
          Math.max(
            0,
            extraRuns - 1
          );

        legal = false;
        break;

      case 'noball':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        batsmanRuns = runs;

        teamRuns =
          extraRuns +
          batsmanRuns;

        runsRun = batsmanRuns;

        legal = false;
        break;

      case 'bye':
      case 'legbye':
        extraRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        teamRuns = extraRuns;
        batsmanRuns = 0;
        runsRun = extraRuns;

        legal = true;
        break;

      case 'penalty':
        extraRuns = inputExtraRuns;
        teamRuns = extraRuns;
        batsmanRuns = 0;
        runsRun = 0;

        legal = false;
        break;

      default:
        batsmanRuns = runs;
        teamRuns = runs;
        runsRun = runs;

        legal = true;
        break;
    }

    const wicket = !!payload.is_wicket;

    /*
     * -------------------------------------------------------
     * PREVIOUS TOTALS
     * -------------------------------------------------------
     */

    const previousRuns =
      previousOptimistic?.total_runs ??
      current.total_runs ??
      0;

    const previousWickets =
      previousOptimistic?.total_wickets ??
      current.total_wickets ??
      0;

    const previousBalls =
      previousOptimistic?.total_balls ??
      current.total_balls ??
      0;

    /*
     * -------------------------------------------------------
     * NEW TOTALS
     * -------------------------------------------------------
     */

    const newTotalRuns =
      previousRuns +
      teamRuns;

    const newTotalWickets =
      previousWickets +
      (wicket ? 1 : 0);

    const newTotalBalls =
      previousBalls +
      (legal ? 1 : 0);

    /*
     * -------------------------------------------------------
     * PREVIOUS BATTING CARD
     * -------------------------------------------------------
     */

    const serverBattingCard =
      currentInnings.battingCard || [];

    const previousStrikerStats =
      previousOptimistic?.strikerStats ||
      serverBattingCard.find(
        b =>
          b.player_id ===
          strikerId
      ) || {
        player_id: strikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
        how_out: null,
        dismissed_by: null,
        fielder_id: null,
        strike_rate: 0
      };

    const previousNonStrikerStats =
      previousOptimistic?.nonStrikerStats ||
      serverBattingCard.find(
        b =>
          b.player_id ===
          nonStrikerId
      ) || {
        player_id: nonStrikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
        how_out: null,
        dismissed_by: null,
        fielder_id: null,
        strike_rate: 0
      };

    /*
     * -------------------------------------------------------
     * STRIKER STATISTICS
     * -------------------------------------------------------
     */

    const strikerBallsAdded =
      payload.extra_type === 'wide'
        ? 0
        : 1;

    const newStrikerRuns =
      previousStrikerStats.runs +
      (
        !payload.extra_type ||
        payload.extra_type === 'noball'
          ? batsmanRuns
          : 0
      );

    const newStrikerBalls =
      previousStrikerStats.balls +
      strikerBallsAdded;

    const newStrikerFours =
      previousStrikerStats.fours +
      (
        batsmanRuns === 4 &&
        (
          !payload.extra_type ||
          payload.extra_type === 'noball'
        )
          ? 1
          : 0
      );

    const newStrikerSixes =
      previousStrikerStats.sixes +
      (
        batsmanRuns === 6 &&
        (
          !payload.extra_type ||
          payload.extra_type === 'noball'
        )
          ? 1
          : 0
      );

    const newStrikerStrikeRate =
      newStrikerBalls > 0
        ? Number(
            (
              (
                newStrikerRuns /
                newStrikerBalls
              ) *
              100
            ).toFixed(2)
          )
        : 0;

    const updatedStrikerStats = {
      ...previousStrikerStats,

      player_id: strikerId,

      runs: newStrikerRuns,

      balls: newStrikerBalls,

      fours: newStrikerFours,

      sixes: newStrikerSixes,

      strike_rate:
        newStrikerStrikeRate
    };

    /*
     * -------------------------------------------------------
     * NON-STRIKER
     * -------------------------------------------------------
     */

    const updatedNonStrikerStats = {
      ...previousNonStrikerStats,
      player_id: nonStrikerId
    };

    /*
     * -------------------------------------------------------
     * WICKET
     * -------------------------------------------------------
     */

    if (
      wicket &&
      payload.dismissed_id
    ) {
      if (
        payload.dismissed_id ===
        strikerId
      ) {
        updatedStrikerStats.is_out =
          true;

        updatedStrikerStats.how_out =
          payload.wicket_type || null;

        updatedStrikerStats.dismissed_by =
          scoringBowlerId || null;

        updatedStrikerStats.fielder_id =
          payload.fielder_id || null;

        strikerId = null;

      } else if (
        payload.dismissed_id ===
        nonStrikerId
      ) {
        updatedNonStrikerStats.is_out =
          true;

        updatedNonStrikerStats.how_out =
          payload.wicket_type || null;

        updatedNonStrikerStats.dismissed_by =
          scoringBowlerId || null;

        updatedNonStrikerStats.fielder_id =
          payload.fielder_id || null;

        nonStrikerId = null;
      }

    } else if (
      runsRun % 2 === 1
    ) {
      /*
       * Odd runs change strike.
       */
      [
        strikerId,
        nonStrikerId
      ] = [
        nonStrikerId,
        strikerId
      ];
    }

    /*
     * -------------------------------------------------------
     * OPTIMISTIC BOWLER STATISTICS
     * -------------------------------------------------------
     *
     * THIS IS THE MAIN FIX.
     *
     * Bowler figures are calculated immediately instead
     * of waiting for bowlingCard from the backend.
     * -------------------------------------------------------
     */

    const previousBowlerStats =
      previousOptimistic?.bowlerStats ||
      (
        currentInnings.bowlingCard ||
        []
      ).find(
        b =>
          b.player_id ===
          scoringBowlerId
      ) || {
        player_id:
          scoringBowlerId,

        overs: '0.0',

        maidens: 0,

        runs: 0,

        wickets: 0,

        economy: 0
      };

    /*
     * Bowler runs:
     *
     * Wide       -> counts
     * No-ball    -> counts
     * Normal run -> counts
     * Bye        -> does NOT count
     * Leg bye    -> does NOT count
     * Penalty    -> does NOT count
     */

    let bowlerRunsAdded = 0;

    if (
      payload.extra_type ===
      'wide'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        );

    } else if (
      payload.extra_type ===
      'noball'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        ) +
        batsmanRuns;

    } else if (
      payload.extra_type ===
        'bye' ||
      payload.extra_type ===
        'legbye'
    ) {
      bowlerRunsAdded = 0;

    } else if (
      payload.extra_type ===
      'penalty'
    ) {
      bowlerRunsAdded = 0;

    } else {
      bowlerRunsAdded =
        batsmanRuns;
    }

    /*
     * -------------------------------------------------------
     * PREVIOUS BOWLER BALLS
     * -------------------------------------------------------
     */

    let previousBowlerBalls =
      previousOptimistic?.bowlerBalls;

    if (
      previousBowlerBalls ===
      undefined
    ) {
      const oversText =
        String(
          previousBowlerStats.overs ||
          '0.0'
        );

      const parts =
        oversText.split('.');

      const completedOvers =
        Number(parts[0]) || 0;

      const ballsInOver =
        Number(parts[1]) || 0;

      previousBowlerBalls =
        completedOvers * 6 +
        ballsInOver;
    }

    /*
     * -------------------------------------------------------
     * NEW BOWLER BALLS
     * -------------------------------------------------------
     */

    const newBowlerBalls =
      previousBowlerBalls +
      (legal ? 1 : 0);

    /*
     * -------------------------------------------------------
     * NEW BOWLER RUNS
     * -------------------------------------------------------
     */

    const newBowlerRuns =
      Number(
        previousBowlerStats.runs || 0
      ) +
      bowlerRunsAdded;

    /*
     * -------------------------------------------------------
     * BOWLER WICKET
     * -------------------------------------------------------
     *
     * Run-out does not count as bowler wicket.
     * -------------------------------------------------------
     */

    const bowlerWicket =
      wicket &&
      payload.wicket_type !==
        'run-out';

    const newBowlerWickets =
      Number(
        previousBowlerStats.wickets ||
        0
      ) +
      (
        bowlerWicket
          ? 1
          : 0
      );

    /*
     * -------------------------------------------------------
     * BOWLER OVERS
     * -------------------------------------------------------
     */

    const bowlerOvers =
      `${Math.floor(
        newBowlerBalls / 6
      )}.${newBowlerBalls % 6}`;

    /*
     * -------------------------------------------------------
     * BOWLER ECONOMY
     * -------------------------------------------------------
     */

    const bowlerEconomy =
      newBowlerBalls > 0
        ? Number(
            (
              newBowlerRuns /
              (
                newBowlerBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    const updatedBowlerStats = {
      ...previousBowlerStats,

      player_id:
        scoringBowlerId,

      overs:
        bowlerOvers,

      runs:
        newBowlerRuns,

      wickets:
        newBowlerWickets,

      economy:
        bowlerEconomy
    };

    /*
     * -------------------------------------------------------
     * OVER COMPLETION
     * -------------------------------------------------------
     *
     * After 6 legal balls:
     *
     * 0.5 -> 1.0
     *
     * Strike changes.
     *
     * Bowler selection becomes empty so the scorer can
     * choose the next bowler.
     * -------------------------------------------------------
     */

    const overJustCompleted =
      legal &&
      newTotalBalls % 6 === 0 &&
      newTotalBalls >
        previousBalls;

    if (
      overJustCompleted
    ) {
      if (
        strikerId &&
        nonStrikerId
      ) {
        [
          strikerId,
          nonStrikerId
        ] = [
          nonStrikerId,
          strikerId
        ];
      }

      /*
       * Do NOT change the bowler statistics.
       *
       * Only clear the active bowler for the next over.
       */
      bowlerId = null;
    }

    /*
     * -------------------------------------------------------
     * RECENT BALL
     * -------------------------------------------------------
     */

    const previousRecentBalls =
      previousOptimistic?.recentBalls ||
      currentInnings.recentBalls ||
      [];

    const overNumber =
      Math.floor(
        previousBalls / 6
      );

    const ballInOver =
      legal
        ? (
            previousBalls % 6
          ) + 1
        : previousBalls % 6;

    const optimisticBall = {
      id:
        `optimistic-${Date.now()}-${Math.random()}`,

      ball_sequence:
        previousRecentBalls.length > 0
          ? (
              previousRecentBalls[
                previousRecentBalls.length - 1
              ].ball_sequence ||
              previousBalls
            ) + 1
          : previousBalls + 1,

      over_number:
        overNumber,

      ball_in_over:
        ballInOver,

      batsman_id:
        current.striker_id,

      non_striker_id:
        current.non_striker_id,

      bowler_id:
        scoringBowlerId,

      runs_batsman:
        batsmanRuns,

      extra_type:
        payload.extra_type || null,

      extra_runs:
        inputExtraRuns,

      is_wicket:
        wicket,

      wicket_type:
        payload.wicket_type || null,

      dismissed_id:
        payload.dismissed_id || null,

      fielder_id:
        payload.fielder_id || null,

      is_legal:
        legal ? 1 : 0
    };

    /*
     * Keep latest 12 balls.
     */

    const newRecentBalls = [
      ...previousRecentBalls,
      optimisticBall
    ].slice(-12);

    /*
     * -------------------------------------------------------
     * EXTRAS
     * -------------------------------------------------------
     */

    const previousExtras =
      previousOptimistic?.extras ||
      {
        wide:
          current.extras_wide || 0,

        noball:
          current.extras_noball || 0,

        bye:
          current.extras_bye || 0,

        legbye:
          current.extras_legbye || 0,

        penalty:
          current.extras_penalty || 0
      };

    const newExtras = {
      ...previousExtras
    };

    if (
      payload.extra_type
    ) {
      newExtras[
        payload.extra_type
      ] =
        (
          newExtras[
            payload.extra_type
          ] || 0
        ) +
        inputExtraRuns;
    }

    /*
     * -------------------------------------------------------
     * PARTNERSHIP
     * -------------------------------------------------------
     */

    const previousPartnership =
      previousOptimistic?.partnership ||
      currentInnings.partnership ||
      {
        runs: 0,
        balls: 0
      };

    const newPartnership =
      wicket
        ? {
            runs: 0,
            balls: 0
          }
        : {
            runs:
              previousPartnership.runs +
              teamRuns,

            balls:
              previousPartnership.balls +
              (
                legal ||
                payload.extra_type ===
                  'noball'
                  ? 1
                  : 0
              )
          };

    /*
     * -------------------------------------------------------
     * RUN RATE
     * -------------------------------------------------------
     */

    const newRunRate =
      newTotalBalls > 0
        ? Number(
            (
              newTotalRuns /
              (
                newTotalBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    /*
     * -------------------------------------------------------
     * RETURN OPTIMISTIC STATE
     * -------------------------------------------------------
     */

    return {
      total_runs:
        newTotalRuns,

      total_wickets:
        newTotalWickets,

      total_balls:
        newTotalBalls,

      strikerId,

      nonStrikerId,

      bowlerId,

      /*
       * IMPORTANT:
       * Bowler statistics stay available even when
       * bowlerId becomes null after the 6th ball.
       */
      bowlerStats:
        updatedBowlerStats,

      bowlerBalls:
        newBowlerBalls,

      strikerStats:
        updatedStrikerStats,

      nonStrikerStats:
        updatedNonStrikerStats,

      recentBalls:
        newRecentBalls,

      extras:
        newExtras,

      partnership:
        newPartnership,

      runRate:
        newRunRate
    };
  };

  /*
   * =========================================================
   * PROCESS SCORE QUEUE
   * =========================================================
   */

  const processScoreQueue =
    useCallback(async () => {
      if (
        processingQueueRef.current
      ) {
        return;
      }

      processingQueueRef.current =
        true;

      let failed = false;

      while (
        scoreQueueRef.current
          .length > 0
      ) {
        const item =
          scoreQueueRef.current.shift();

        if (!item) continue;

        try {
          await Innings.ball(
            item.inningsId,
            item.payload
          );

          pendingCountRef.current =
            Math.max(
              0,
              pendingCountRef.current -
                1
            );

          setPendingCount(
            pendingCountRef.current
          );

        } catch (e) {
          failed = true;

          setError(
            e?.response?.data?.error ||
            e?.message ||
            'Unable to save ball'
          );

          scoreQueueRef.current = [];

          pendingCountRef.current = 0;

          setPendingCount(0);

          optimisticRef.current =
            null;

          setOptimistic(null);

          try {
            const d =
              await Matches.get(
                matchId
              );

            applyServerData(d);
          } catch (_) {}

          break;
        }
      }

      processingQueueRef.current =
        false;

      /*
       * Final authoritative sync.
       */

      if (
        !failed &&
        pendingCountRef.current === 0
      ) {
        try {
          const d =
            await Matches.get(
              matchId
            );

          applyServerData(d);
        } catch (_) {
          /*
           * Keep optimistic display if the final sync
           * temporarily fails.
           */
        }
      }
    }, [
      matchId,
      applyServerData
    ]);

  /*
   * =========================================================
   * PLAY BALL
   * =========================================================
   */

  const playBall = (payload) => {
    const currentInnings =
      innings[
        innings.length - 1
      ];

    if (!currentInnings) {
      return;
    }

    const current =
      currentInnings.innings;

    if (!current) {
      return;
    }

    /*
     * Effective current players.
     */

    const effectiveStrikerId =
      optimisticRef.current
        ?.strikerId ??
      current.striker_id;

    const effectiveNonStrikerId =
      optimisticRef.current
        ?.nonStrikerId ??
      current.non_striker_id;

    const effectiveBowlerId =
      optimisticRef.current
        ?.bowlerId ??
      current.current_bowler_id;

    /*
     * Need all players.
     */

    if (
      !effectiveStrikerId ||
      !effectiveNonStrikerId ||
      !effectiveBowlerId
    ) {
      return;
    }

    /*
     * Boundary animation.
     */

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

    /*
     * Build from latest optimistic state.
     */

    const nextOptimistic =
      buildOptimisticBall({
        current,
        currentInnings,
        payload,
        previousOptimistic:
          optimisticRef.current
      });

    /*
     * Store synchronously in ref.
     */

    optimisticRef.current =
      nextOptimistic;

    /*
     * Update screen immediately.
     */

    setOptimistic(
      nextOptimistic
    );

    /*
     * Add request to queue.
     */

    scoreQueueRef.current.push({
      inningsId:
        current.id,

      payload
    });

    /*
     * Pending count.
     */

    pendingCountRef.current += 1;

    setPendingCount(
      pendingCountRef.current
    );

    /*
     * Start queue.
     */

    processScoreQueue();
  };

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  const currentInnings =
    innings[
      innings.length - 1
    ];

  /*
   * =========================================================
   * MATCH COMPLETED
   * =========================================================
   */

  if (
    match.status ===
      'completed' &&
    pendingCount === 0
  ) {
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
    match.status ===
      'innings-break' &&
    pendingCount === 0
  ) {
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
          {
            currentInnings.innings
              .total_runs
          }
          /
          {
            currentInnings.innings
              .total_wickets
          }{' '}
          in{' '}
          {currentInnings.overs}{' '}
          overs
        </p>

        <button
          className="btn btn-primary"
          onClick={async () => {
            await Matches.startSecondInnings(
              matchId
            );

            loadFull();
          }}
        >
          Start 2nd Innings
        </button>

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
      <p className="text-slate-400">
        Setting up…
      </p>
    );
  }

  const inn =
    currentInnings.innings;

  /*
   * =========================================================
   * DISPLAY VALUES
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

  const displayOvers =
    `${Math.floor(
      displayTotalBalls / 6
    )}.${displayTotalBalls % 6}`;

  const displayRunRate =
    displayTotalBalls > 0
      ? (
          (
            displayTotalRuns /
            displayTotalBalls
          ) *
          6
        ).toFixed(2)
      : '0.00';

  /*
   * =========================================================
   * EFFECTIVE PLAYERS
   * =========================================================
   */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn.striker_id;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn.non_striker_id;

  const effectiveBowlerId =
    optimistic?.bowlerId ??
    inn.current_bowler_id;

  /*
   * =========================================================
   * TEAM PLAYERS
   * =========================================================
   */

  const battingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.batting_team_id &&
        p.active
    );

  const bowlingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active
    );

  /*
   * =========================================================
   * OUT PLAYERS
   * =========================================================
   */

  const outIds =
    new Set(
      (
        currentInnings.battingCard ||
        []
      )
        .filter(
          b => b.is_out
        )
        .map(
          b => b.player_id
        )
    );

  /*
   * =========================================================
   * CURRENT PLAYERS
   * =========================================================
   */

  const striker =
    players.find(
      p =>
        p.id ===
        effectiveStrikerId
    );

  const nonStriker =
    players.find(
      p =>
        p.id ===
        effectiveNonStrikerId
    );

  const bowler =
    players.find(
      p =>
        p.id ===
        effectiveBowlerId
    );

  /*
   * =========================================================
   * NEED BATSMEN / BOWLER
   * =========================================================
   */

  const needBatsmen =
    !effectiveStrikerId ||
    !effectiveNonStrikerId;

  const needBowler =
    !needBatsmen &&
    !effectiveBowlerId;

  /*
   * =========================================================
   * SELECT BATSMEN
   * =========================================================
   */

  if (needBatsmen) {
    return (
      <SelectBatsmen
        team={
          battingTeamPlayers
        }
        outIds={outIds}
        teamId={
          inn.batting_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        hasStriker={
          !!effectiveStrikerId
        }
        hasNonStriker={
          !!effectiveNonStrikerId
        }
        onSelect={(
          strikerId,
          nonStrikerId
        ) =>
          act(() =>
            Innings.setBatsmen(
              inn.id,
              {
                striker_id:
                  strikerId ||
                  effectiveStrikerId,

                non_striker_id:
                  nonStrikerId ||
                  effectiveNonStrikerId
              }
            )
          )
        }
      />
    );
  }

  /*
   * =========================================================
   * SELECT BOWLER
   * =========================================================
   */

  if (needBowler) {
    return (
      <SelectBowler
        team={
          bowlingTeamPlayers
        }
        teamId={
          inn.bowling_team_id
        }
        onPlayerCreated={
          handlePlayerCreated
        }
        onSelect={bowlerId =>
          act(() =>
            Innings.setBowler(
              inn.id,
              {
                bowler_id:
                  bowlerId
              }
            )
          )
        }
        error={error}
      />
    );
  }

  /*
   * =========================================================
   * SERVER BATSMAN STATS
   * =========================================================
   */

  const serverStrikerStats =
    (
      currentInnings.battingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveStrikerId
    ) || {
      player_id:
        effectiveStrikerId,

      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  const serverNonStrikerStats =
    (
      currentInnings.battingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveNonStrikerId
    ) || {
      player_id:
        effectiveNonStrikerId,

      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  /*
   * =========================================================
   * OPTIMISTIC BATSMAN STATS
   * =========================================================
   */

  const strikerStats =
    optimistic &&
    optimistic.strikerId ===
      effectiveStrikerId
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic &&
    optimistic.nonStrikerId ===
      effectiveNonStrikerId
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  /*
   * =========================================================
   * BOWLER STATS
   * =========================================================
   *
   * MAIN FIX:
   *
   * Use optimistic bowler statistics immediately.
   * =========================================================
   */

  const serverBowlerStats =
    (
      currentInnings.bowlingCard ||
      []
    ).find(
      b =>
        b.player_id ===
        effectiveBowlerId
    ) || {
      player_id:
        effectiveBowlerId,

      overs: '0.0',

      runs: 0,

      wickets: 0,

      maidens: 0,

      economy: 0
    };

  const bowlerStats =
    optimistic?.bowlerStats &&
    optimistic.bowlerStats.player_id ===
      effectiveBowlerId
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

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
    Math.floor(
      displayTotalBalls / 6
    );

  const currentOverBalls =
    recentBalls.filter(
      ball =>
        ball.over_number ===
        currentOverNumber
    );

  /*
   * =========================================================
   * MAIN UI
   * =========================================================
   */

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">

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

            {pendingCount > 0 && (
              <div className="text-emerald-400 text-xs mt-1">
                Saving {pendingCount}…
              </div>
            )}

          </div>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

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
                value={
                  strikerStats.runs
                }
                label="Runs"
                large
              />

              <Stat
                value={
                  strikerStats.balls
                }
                label="Balls"
              />

              <Stat
                value={
                  strikerStats.fours
                }
                label="4s"
              />

              <Stat
                value={
                  strikerStats.sixes
                }
                label="6s"
              />

              <Stat
                value={
                  strikerStats.strike_rate ??
                  strikerStats.strikeRate ??
                  0
                }
                label="SR"
              />

            </div>

          </div>

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
                value={
                  nonStrikerStats.runs
                }
                label="Runs"
                large
              />

              <Stat
                value={
                  nonStrikerStats.balls
                }
                label="Balls"
              />

              <Stat
                value={
                  nonStrikerStats.fours
                }
                label="4s"
              />

              <Stat
                value={
                  nonStrikerStats.sixes
                }
                label="6s"
              />

              <Stat
                value={
                  nonStrikerStats.strike_rate ??
                  nonStrikerStats.strikeRate ??
                  0
                }
                label="SR"
              />

            </div>

          </div>

          {/* =================================================
              BOWLER
          ================================================= */}

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
                value={
                  bowlerStats.overs
                }
                label="Overs"
              />

              <BowlingStat
                value={
                  bowlerStats.maidens
                }
                label="Maidens"
              />

              <BowlingStat
                value={
                  bowlerStats.runs
                }
                label="Runs"
              />

              <BowlingStat
                value={
                  bowlerStats.wickets
                }
                label="Wickets"
              />

              <BowlingStat
                value={
                  bowlerStats.economy
                }
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

          {[0, 1, 2, 3].map(
            r => (
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
            )
          )}

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

              {[0, 1, 2, 3, 4, 6].map(
                r => (
                  <button
                    key={r}
                    className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform !text-base !py-3"
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

                          runs:
                            r
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

      {/* =====================================================
          ACTION BUTTONS
      ===================================================== */}

      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.undo(
                inn.id
              )
            )
          }
        >
          ↺ Undo
        </button>

        <button
          className="btn btn-secondary"
          onClick={() =>
            act(() =>
              Innings.swapStrike(
                inn.id
              )
            )
          }
        >
          ⇄ Swap Batsmen
        </button>

      </div>

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
                wicketType ===
                'run-out'
                  ? runsBeforeWicket
                  : 0,

              is_wicket:
                true,

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
    String(
      ball.runs_batsman ?? 0
    );

  let className =
    'bg-slate-700';

  if (ball.is_wicket) {

    label = 'W';
    className = 'bg-red-600';

  } else if (
    ball.extra_type ===
    'wide'
  ) {

    label =
      `Wd${
        ball.extra_runs > 1
          ? `+${ball.extra_runs - 1}`
          : ''
      }`;

    className =
      'bg-yellow-600';

  } else if (
    ball.extra_type ===
    'noball'
  ) {

    label =
      `Nb${
        ball.runs_batsman
          ? `+${ball.runs_batsman}`
          : ''
      }`;

    className =
      'bg-orange-600';

  } else if (
    ball.extra_type ===
    'bye'
  ) {

    label =
      `${ball.extra_runs}B`;

    className =
      'bg-blue-600';

  } else if (
    ball.extra_type ===
    'legbye'
  ) {

    label =
      `${ball.extra_runs}Lb`;

    className =
      'bg-blue-800';

  } else if (
    ball.runs_batsman === 4
  ) {

    label = '4';

    className =
      'bg-emerald-600';

  } else if (
    ball.runs_batsman === 6
  ) {

    label = '6';

    className =
      'bg-purple-600';
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

  const [
    nonStriker,
    setNonStriker
  ] = useState(null);

  const available =
    team.filter(
      p =>
        !outIds.has(p.id)
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
            onChange={setNonStriker}
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
        onCreated={
          onPlayerCreated
        }
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
