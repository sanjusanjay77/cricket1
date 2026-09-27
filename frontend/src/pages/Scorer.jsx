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

  const [showNextBowler, setShowNextBowler] = useState(false);
  const [showInitialBowler, setShowInitialBowler] = useState(false);

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * ----------------------------------------------------
   * SAFE DATA HELPERS
   * ----------------------------------------------------
   */

  const safeArray = useCallback((value) => {
    return Array.isArray(value) ? value : [];
  }, []);

  const applyServerData = useCallback((data) => {
    if (!data || typeof data !== 'object') {
      return;
    }

    setMatch(
      data.match &&
      typeof data.match === 'object'
        ? data.match
        : null
    );

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

    optimisticRef.current = null;
    setOptimistic(null);
  }, []);

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      if (pendingCountRef.current > 0) {
        return;
      }

      applyServerData(data);
    } catch (err) {
      console.error('Failed to load match:', err);

      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load match'
      );
    }
  }, [matchId, applyServerData]);

  /*
   * ----------------------------------------------------
   * INITIAL LOAD
   * ----------------------------------------------------
   */

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * ----------------------------------------------------
   * PLAYER CREATED
   * ----------------------------------------------------
   */

  const handlePlayerCreated = useCallback((player) => {
    if (!player || typeof player !== 'object') {
      return;
    }

    setPlayers(prev => {
      const safePrev =
        Array.isArray(prev)
          ? prev
          : [];

      const exists =
        safePrev.some(
          p => p?.id === player.id
        );

      if (exists) {
        return safePrev;
      }

      return [
        ...safePrev,
        player
      ];
    });
  }, []);

  /*
   * ----------------------------------------------------
   * SOCKET.IO
   * ----------------------------------------------------
   */

  useEffect(() => {
    socket.emit(
      'join-match',
      matchId
    );

    const onUpdate = ({
      match: updatedMatch,
      innings: updatedInnings
    } = {}) => {
      if (pendingCountRef.current > 0) {
        return;
      }

      if (
        updatedMatch &&
        typeof updatedMatch === 'object'
      ) {
        setMatch(updatedMatch);
      }

      setInnings(
        Array.isArray(updatedInnings)
          ? updatedInnings
          : []
      );

      optimisticRef.current = null;
      setOptimistic(null);
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

  /*
   * ----------------------------------------------------
   * CLEANUP TIMERS / QUEUE
   * ----------------------------------------------------
   */

  useEffect(() => {
    return () => {
      clearTimeout(
        boundaryTimer.current
      );

      clearTimeout(
        wicketTimer.current
      );

      scoreQueueRef.current = [];
      processingQueueRef.current = false;
    };
  }, []);

  /*
   * ----------------------------------------------------
   * VISUAL EFFECTS
   * ----------------------------------------------------
   */

  const popBoundary = useCallback((type) => {
    clearTimeout(
      boundaryTimer.current
    );

    setBoundary(type);

    boundaryTimer.current =
      setTimeout(() => {
        setBoundary(null);
      }, 1100);
  }, []);

  const popWicket = useCallback(() => {
    clearTimeout(
      wicketTimer.current
    );

    setFlashWicket(true);

    wicketTimer.current =
      setTimeout(() => {
        setFlashWicket(false);
      }, 600);
  }, []);

  /*
   * ----------------------------------------------------
   * NEXT BOWLER EFFECT
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (
      optimistic?.needsNextBowler &&
      Number(
        optimistic?.total_balls || 0
      ) > 0 &&
      Number(
        optimistic?.total_balls || 0
      ) % 6 === 0
    ) {
      setShowNextBowler(true);
    }
  }, [
    optimistic?.needsNextBowler,
    optimistic?.total_balls
  ]);

  /*
   * ----------------------------------------------------
   * COMMON ACTION
   * ----------------------------------------------------
   */

  const act = async (fn) => {
    setError('');

    try {
      await fn();
      await loadFull();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Something went wrong'
      );

      await loadFull();
    }
  };

  /*
   * ----------------------------------------------------
   * PLAYER ID HELPER
   * ----------------------------------------------------
   */

  const getPlayerId = (player) => {
    if (!player) {
      return null;
    }

    if (typeof player === 'string') {
      return player;
    }

    if (typeof player === 'object') {
      return player.id || null;
    }

    return null;
  };

  /*
   * ----------------------------------------------------
   * BUILD OPTIMISTIC BALL
   * ----------------------------------------------------
   */

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previousOptimistic
  }) => {
    const safeCurrent =
      current &&
      typeof current === 'object'
        ? current
        : {};

    const safeCurrentInnings =
      currentInnings &&
      typeof currentInnings === 'object'
        ? currentInnings
        : {};

    const safePayload =
      payload &&
      typeof payload === 'object'
        ? payload
        : {};

    let strikerId =
      previousOptimistic?.strikerId ??
      safeCurrent.striker_id;

    let nonStrikerId =
      previousOptimistic?.nonStrikerId ??
      safeCurrent.non_striker_id;

    const scoringBowlerId =
      previousOptimistic?.activeBowlerId ??
      safeCurrent.current_bowler_id;

    const runs =
      Number(
        safePayload.runs || 0
      );

    const inputExtraRuns =
      Number(
        safePayload.extra_runs || 0
      );

    let teamRuns = 0;
    let batsmanRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (
      safePayload.extra_type
    ) {
      case 'wide':
        teamRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          );

        batsmanRuns = 0;

        runsRun =
          Math.max(
            0,
            teamRuns - 1
          );

        legal = false;
        break;

      case 'noball':
        teamRuns =
          Math.max(
            1,
            inputExtraRuns || 1
          ) + runs;

        batsmanRuns = runs;
        runsRun = runs;
        legal = false;
        break;

      case 'bye':
      case 'legbye':
        teamRuns =
          Math.max(
            0,
            inputExtraRuns
          );

        batsmanRuns = 0;
        runsRun = teamRuns;
        legal = true;
        break;

      case 'penalty':
        teamRuns =
          Math.max(
            0,
            inputExtraRuns
          );

        batsmanRuns = 0;
        runsRun = 0;
        legal = false;
        break;

      default:
        teamRuns = runs;
        batsmanRuns = runs;
        runsRun = runs;
        legal = true;
        break;
    }

    const wicket =
      !!safePayload.is_wicket;

    const previousRuns =
      previousOptimistic?.total_runs ??
      Number(
        safeCurrent.total_runs || 0
      );

    const previousWickets =
      previousOptimistic?.total_wickets ??
      Number(
        safeCurrent.total_wickets || 0
      );

    const previousBalls =
      previousOptimistic?.total_balls ??
      Number(
        safeCurrent.total_balls || 0
      );

    const newTotalRuns =
      previousRuns + teamRuns;

    const newTotalWickets =
      previousWickets +
      (
        wicket ? 1 : 0
      );

    const newTotalBalls =
      previousBalls +
      (
        legal ? 1 : 0
      );

    /*
     * ------------------------------------------------
     * BATSMAN STATS
     * ------------------------------------------------
     */

    const battingCard =
      safeArray(
        safeCurrentInnings.battingCard
      );

    const serverStrikerStats =
      battingCard.find(
        b =>
          b?.player_id ===
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

    const serverNonStrikerStats =
      battingCard.find(
        b =>
          b?.player_id ===
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

    const previousStrikerStats =
      previousOptimistic?.strikerStats ||
      serverStrikerStats;

    const previousNonStrikerStats =
      previousOptimistic?.nonStrikerStats ||
      serverNonStrikerStats;

    const strikerBallsAdded =
      safePayload.extra_type === 'wide' ||
      safePayload.extra_type === 'noball'
        ? 0
        : 1;

    const batterGetsRuns =
      !safePayload.extra_type ||
      safePayload.extra_type === 'noball';

    const newStrikerRuns =
      Number(
        previousStrikerStats.runs || 0
      ) +
      (
        batterGetsRuns
          ? batsmanRuns
          : 0
      );

    const newStrikerBalls =
      Number(
        previousStrikerStats.balls || 0
      ) +
      strikerBallsAdded;

    const newStrikerFours =
      Number(
        previousStrikerStats.fours || 0
      ) +
      (
        batterGetsRuns &&
        batsmanRuns === 4
          ? 1
          : 0
      );

    const newStrikerSixes =
      Number(
        previousStrikerStats.sixes || 0
      ) +
      (
        batterGetsRuns &&
        batsmanRuns === 6
          ? 1
          : 0
      );

    const newStrikerSR =
      newStrikerBalls > 0
        ? Number(
            (
              (
                newStrikerRuns /
                newStrikerBalls
              ) * 100
            ).toFixed(2)
          )
        : 0;

    let updatedStrikerStats = {
      ...previousStrikerStats,
      player_id: strikerId,
      runs: newStrikerRuns,
      balls: newStrikerBalls,
      fours: newStrikerFours,
      sixes: newStrikerSixes,
      strike_rate: newStrikerSR
    };

    let updatedNonStrikerStats = {
      ...previousNonStrikerStats,
      player_id: nonStrikerId
    };

    /*
     * ------------------------------------------------
     * WICKET
     * ------------------------------------------------
     */

    if (
      wicket &&
      safePayload.dismissed_id
    ) {
      if (
        safePayload.dismissed_id ===
        strikerId
      ) {
        updatedStrikerStats.is_out =
          true;

        updatedStrikerStats.how_out =
          safePayload.wicket_type ||
          null;

        updatedStrikerStats.dismissed_by =
          scoringBowlerId ||
          null;

        updatedStrikerStats.fielder_id =
          safePayload.fielder_id ||
          null;

        strikerId = null;

      } else if (
        safePayload.dismissed_id ===
        nonStrikerId
      ) {
        updatedNonStrikerStats.is_out =
          true;

        updatedNonStrikerStats.how_out =
          safePayload.wicket_type ||
          null;

        updatedNonStrikerStats.dismissed_by =
          scoringBowlerId ||
          null;

        updatedNonStrikerStats.fielder_id =
          safePayload.fielder_id ||
          null;

        nonStrikerId = null;
      }

    } else if (
      runsRun % 2 === 1
    ) {
      const oldStrikerId =
        strikerId;

      const oldNonStrikerId =
        nonStrikerId;

      const oldStrikerStats =
        updatedStrikerStats;

      const oldNonStrikerStats =
        updatedNonStrikerStats;

      strikerId =
        oldNonStrikerId;

      nonStrikerId =
        oldStrikerId;

      updatedStrikerStats =
        oldNonStrikerStats;

      updatedNonStrikerStats =
        oldStrikerStats;
    }

    /*
     * ------------------------------------------------
     * BOWLER STATS
     * ------------------------------------------------
     */

    const bowlingCard =
      safeArray(
        safeCurrentInnings.bowlingCard
      );

    const serverBowlerStats =
      bowlingCard.find(
        b =>
          b?.player_id ===
          scoringBowlerId
      ) || {
        player_id: scoringBowlerId,
        overs: '0.0',
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0
      };

    const previousBowlerStats =
      previousOptimistic?.bowlerStats ||
      serverBowlerStats;

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

      const [
        overs,
        balls
      ] =
        oversText.split('.');

      previousBowlerBalls =
        (
          Number(overs) || 0
        ) * 6 +
        (
          Number(balls) || 0
        );
    }

    const newBowlerBalls =
      previousBowlerBalls +
      (
        legal ? 1 : 0
      );

    let bowlerRunsAdded = 0;

    if (
      safePayload.extra_type ===
      'wide'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        );

    } else if (
      safePayload.extra_type ===
      'noball'
    ) {
      bowlerRunsAdded =
        Math.max(
          1,
          inputExtraRuns || 1
        ) +
        batsmanRuns;

    } else if (
      safePayload.extra_type ===
        'bye' ||
      safePayload.extra_type ===
        'legbye' ||
      safePayload.extra_type ===
        'penalty'
    ) {
      bowlerRunsAdded = 0;

    } else {
      bowlerRunsAdded =
        batsmanRuns;
    }

    const newBowlerRuns =
      Number(
        previousBowlerStats.runs || 0
      ) +
      bowlerRunsAdded;

    const bowlerGetsWicket =
      wicket &&
      safePayload.wicket_type !==
        'run-out';

    const newBowlerWickets =
      Number(
        previousBowlerStats.wickets || 0
      ) +
      (
        bowlerGetsWicket
          ? 1
          : 0
      );

    const bowlerOvers =
      `${Math.floor(
        newBowlerBalls / 6
      )}.${newBowlerBalls % 6}`;

    /*
     * ------------------------------------------------
     * MAIDEN
     * ------------------------------------------------
     */

    let newMaidens =
      Number(
        previousBowlerStats.maidens ||
        0
      );

    const overJustCompleted =
      legal &&
      newTotalBalls % 6 === 0 &&
      newTotalBalls >
        previousBalls;

    if (
      overJustCompleted
    ) {
      const previousRecentBalls =
        safeArray(
          previousOptimistic?.recentBalls ||
          safeCurrentInnings.recentBalls
        );

      const completedOverNumber =
        Math.floor(
          previousBalls / 6
        );

      const ballsForCompletedOver =
        previousRecentBalls.filter(
          ball =>
            Number(
              ball?.over_number
            ) ===
              completedOverNumber &&
            ball?.bowler_id ===
              scoringBowlerId
        );

      let overRuns =
        bowlerRunsAdded;

      ballsForCompletedOver.forEach(
        ball => {
          const ballExtra =
            ball?.extra_type;

          if (
            ballExtra ===
              'bye' ||
            ballExtra ===
              'legbye' ||
            ballExtra ===
              'penalty'
          ) {
            return;
          }

          if (
            ballExtra ===
            'wide'
          ) {
            overRuns +=
              Math.max(
                1,
                Number(
                  ball?.extra_runs ||
                  1
                )
              );

          } else if (
            ballExtra ===
            'noball'
          ) {
            overRuns +=
              Math.max(
                1,
                Number(
                  ball?.extra_runs ||
                  1
                )
              ) +
              Number(
                ball?.runs_batsman ||
                0
              );

          } else {
            overRuns +=
              Number(
                ball?.runs_batsman ||
                0
              );
          }
        }
      );

      if (
        overRuns === 0
      ) {
        newMaidens += 1;
      }
    }

    const bowlerEconomy =
      newBowlerBalls > 0
        ? Number(
            (
              newBowlerRuns /
              (
                newBowlerBalls / 6
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
      maidens:
        newMaidens,
      runs:
        newBowlerRuns,
      wickets:
        newBowlerWickets,
      economy:
        bowlerEconomy
    };

    /*
     * ------------------------------------------------
     * END OF OVER
     * ------------------------------------------------
     */

    let needsNextBowler =
      previousOptimistic?.needsNextBowler ||
      false;

    if (
      overJustCompleted
    ) {
      if (
        strikerId &&
        nonStrikerId
      ) {
        const oldStrikerId =
          strikerId;

        const oldNonStrikerId =
          nonStrikerId;

        const oldStrikerStats =
          updatedStrikerStats;

        const oldNonStrikerStats =
          updatedNonStrikerStats;

        strikerId =
          oldNonStrikerId;

        nonStrikerId =
          oldStrikerId;

        updatedStrikerStats =
          oldNonStrikerStats;

        updatedNonStrikerStats =
          oldStrikerStats;
      }

      needsNextBowler = true;
    }

    /*
     * ------------------------------------------------
     * RECENT BALL
     * ------------------------------------------------
     */

    const previousRecentBalls =
      safeArray(
        previousOptimistic?.recentBalls ||
        safeCurrentInnings.recentBalls
      );

    const overNumber =
      Math.floor(
        previousBalls / 6
      );

    const ballInOver =
      legal
        ? (
            previousBalls % 6
          ) + 1
        : (
            previousBalls % 6
          );

    const optimisticBall = {
      id:
        `optimistic-${Date.now()}-${Math.random()}`,

      ball_sequence:
        previousRecentBalls.length >
        0
          ? (
              Number(
                previousRecentBalls[
                  previousRecentBalls.length - 1
                ]?.ball_sequence
              ) ||
              previousBalls
            ) + 1
          : previousBalls + 1,

      over_number:
        overNumber,

      ball_in_over:
        ballInOver,

      batsman_id:
        previousOptimistic?.strikerId ??
        safeCurrent.striker_id,

      non_striker_id:
        previousOptimistic?.nonStrikerId ??
        safeCurrent.non_striker_id,

      bowler_id:
        scoringBowlerId,

      runs_batsman:
        batsmanRuns,

      extra_type:
        safePayload.extra_type ||
        null,

      extra_runs:
        inputExtraRuns,

      is_wicket:
        wicket,

      wicket_type:
        safePayload.wicket_type ||
        null,

      dismissed_id:
        safePayload.dismissed_id ||
        null,

      fielder_id:
        safePayload.fielder_id ||
        null,

      is_legal:
        legal ? 1 : 0
    };

    const newRecentBalls = [
      ...previousRecentBalls,
      optimisticBall
    ].slice(-24);

    /*
     * ------------------------------------------------
     * EXTRAS
     * ------------------------------------------------
     */

    const previousExtras =
      previousOptimistic?.extras || {
        wide:
          Number(
            safeCurrent.extras_wide ||
            0
          ),

        noball:
          Number(
            safeCurrent.extras_noball ||
            0
          ),

        bye:
          Number(
            safeCurrent.extras_bye ||
            0
          ),

        legbye:
          Number(
            safeCurrent.extras_legbye ||
            0
          ),

        penalty:
          Number(
            safeCurrent.extras_penalty ||
            0
          )
      };

    const newExtras = {
      ...previousExtras
    };

    if (
      safePayload.extra_type
    ) {
      newExtras[
        safePayload.extra_type
      ] =
        (
          newExtras[
            safePayload.extra_type
          ] || 0
        ) +
        inputExtraRuns;
    }

    /*
     * ------------------------------------------------
     * PARTNERSHIP
     * ------------------------------------------------
     */

    const previousPartnership =
      previousOptimistic?.partnership ||
      safeCurrentInnings.partnership ||
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
              Number(
                previousPartnership.runs ||
                0
              ) +
              teamRuns,

            balls:
              Number(
                previousPartnership.balls ||
                0
              ) +
              (
                legal ||
                safePayload.extra_type ===
                  'noball'
                  ? 1
                  : 0
              )
          };

    const newRunRate =
      newTotalBalls > 0
        ? Number(
            (
              newTotalRuns /
              (
                newTotalBalls / 6
              )
            ).toFixed(2)
          )
        : 0;

    /*
     * ------------------------------------------------
     * FALL OF WICKETS
     * ------------------------------------------------
     */

    const previousFallOfWickets =
      safeArray(
        previousOptimistic?.fallOfWickets ||
        safeCurrentInnings.fallOfWickets
      );

    const newFallOfWickets =
      wicket &&
      safePayload.dismissed_id
        ? [
            ...previousFallOfWickets,
            {
              wicket_number:
                newTotalWickets,

              player_id:
                safePayload.dismissed_id,

              score:
                newTotalRuns,

              overs:
                `${Math.floor(
                  newTotalBalls / 6
                )}.${newTotalBalls % 6}`,

              wicket_type:
                safePayload.wicket_type ||
                null,

              bowler_id:
                scoringBowlerId ||
                null,

              fielder_id:
                safePayload.fielder_id ||
                null
            }
          ]
        : previousFallOfWickets;

    return {
      total_runs:
        newTotalRuns,

      total_wickets:
        newTotalWickets,

      total_balls:
        newTotalBalls,

      strikerId,
      nonStrikerId,

      activeBowlerId:
        scoringBowlerId,

      needsNextBowler,

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

      fallOfWickets:
        newFallOfWickets,

      runRate:
        newRunRate
    };
  };

  /*
   * ----------------------------------------------------
   * SAVE QUEUE
   * ----------------------------------------------------
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
        scoreQueueRef.current.length >
        0
      ) {
        const item =
          scoreQueueRef.current.shift();

        if (!item) {
          continue;
        }

        try {
          await Innings.ball(
            item.inningsId,
            item.payload
          );

          pendingCountRef.current =
            Math.max(
              0,
              pendingCountRef.current - 1
            );

          setPendingCount(
            pendingCountRef.current
          );

        } catch (err) {
          failed = true;

          setError(
            err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            'Unable to save ball'
          );

          scoreQueueRef.current = [];

          pendingCountRef.current = 0;

          setPendingCount(0);

          optimisticRef.current = null;
          setOptimistic(null);

          try {
            const data =
              await Matches.get(
                matchId
              );

            applyServerData(data);
          } catch (_) {}

          break;
        }
      }

      processingQueueRef.current =
        false;

      if (
        !failed &&
        pendingCountRef.current === 0
      ) {
        try {
          const data =
            await Matches.get(
              matchId
            );

          applyServerData(data);
        } catch (_) {}
      }
    }, [
      matchId,
      applyServerData
    ]);

  /*
   * ----------------------------------------------------
   * RECORD BALL
   * ----------------------------------------------------
   */

  const playBall = useCallback(
    (payload) => {
      const safeInnings =
        Array.isArray(innings)
          ? innings
          : [];

      const currentInnings =
        safeInnings[
          safeInnings.length - 1
        ];

      if (!currentInnings) {
        return;
      }

      const current =
        currentInnings?.innings;

      if (
        !current ||
        typeof current !== 'object'
      ) {
        return;
      }

      const effectiveStrikerId =
        optimisticRef.current?.strikerId ??
        current.striker_id;

      const effectiveNonStrikerId =
        optimisticRef.current?.nonStrikerId ??
        current.non_striker_id;

      const effectiveBowlerId =
        optimisticRef.current?.activeBowlerId ??
        current.current_bowler_id;

      if (
        optimisticRef.current
          ?.needsNextBowler
      ) {
        return;
      }

      if (
        !effectiveStrikerId ||
        !effectiveNonStrikerId ||
        !effectiveBowlerId
      ) {
        if (
          effectiveStrikerId &&
          effectiveNonStrikerId &&
          !effectiveBowlerId
        ) {
          setShowInitialBowler(true);
        }

        return;
      }

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

      const nextOptimistic =
        buildOptimisticBall({
          current,
          currentInnings,
          payload,
          previousOptimistic:
            optimisticRef.current
        });

      optimisticRef.current =
        nextOptimistic;

      setOptimistic(
        nextOptimistic
      );

      scoreQueueRef.current.push({
        inningsId:
          current.id,
        payload
      });

      pendingCountRef.current += 1;

      setPendingCount(
        pendingCountRef.current
      );

      processScoreQueue();
    },
    [
      innings,
      popBoundary,
      processScoreQueue
    ]
  );

  /*
   * ----------------------------------------------------
   * EARLY DATA VALUES
   *
   * IMPORTANT:
   * Everything needed by hooks below is calculated
   * before ANY conditional return.
   * ----------------------------------------------------
   */

  const safeInnings =
    Array.isArray(innings)
      ? innings
      : [];

  const safePlayers =
    Array.isArray(players)
      ? players
      : [];

  const currentInnings =
    safeInnings[
      safeInnings.length - 1
    ];

  const earlyInn =
    currentInnings?.innings &&
    typeof currentInnings.innings === 'object'
      ? currentInnings.innings
      : null;

  const earlyStrikerId =
    optimistic?.strikerId ??
    earlyInn?.striker_id ??
    null;

  const earlyNonStrikerId =
    optimistic?.nonStrikerId ??
    earlyInn?.non_striker_id ??
    null;

  const earlyBowlerId =
    optimistic?.activeBowlerId ??
    earlyInn?.current_bowler_id ??
    null;

  const earlyTotalBalls =
    optimistic?.total_balls ??
    Number(
      earlyInn?.total_balls || 0
    );

  const needsInitialBowler =
    !!earlyStrikerId &&
    !!earlyNonStrikerId &&
    !earlyBowlerId &&
    Number(earlyTotalBalls) === 0;

  /*
   * ----------------------------------------------------
   * INITIAL BOWLER EFFECT
   *
   * MUST BE BEFORE ALL CONDITIONAL RETURNS.
   * This fixes React error #310.
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (
      needsInitialBowler &&
      !showInitialBowler
    ) {
      setShowInitialBowler(true);
    }
  }, [
    needsInitialBowler,
    showInitialBowler
  ]);

  /*
   * ----------------------------------------------------
   * LOADING
   * ----------------------------------------------------
   */

  if (!match) {
    return (
      <p className="text-slate-400">
        Loading…
      </p>
    );
  }

  /*
   * ----------------------------------------------------
   * MATCH COMPLETED
   * ----------------------------------------------------
   */

  if (
    match.status === 'completed' &&
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
   * ----------------------------------------------------
   * INNINGS BREAK
   * ----------------------------------------------------
   */

  if (
    match.status === 'innings-break' &&
    pendingCount === 0
  ) {
    if (!currentInnings) {
      return (
        <p className="text-slate-400">
          Loading…
        </p>
      );
    }

    const breakInn =
      currentInnings?.innings;

    if (
      !breakInn ||
      typeof breakInn !== 'object'
    ) {
      return (
        <p className="text-slate-400">
          Loading match data…
        </p>
      );
    }

    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">

        <h1 className="text-2xl font-bold">
          Innings Break
        </h1>

        <p className="text-slate-300 text-lg">
          {breakInn.total_runs}
          /
          {breakInn.total_wickets}
          {' '}
          in{' '}
          {currentInnings.overs || '0.0'}
          {' '}
          overs
        </p>

        <button
          className="btn btn-primary"
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
                err?.response?.data?.message ||
                err?.message ||
                'Unable to start second innings'
              );
            }
          }}
        >
          Start 2nd Innings
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
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
    currentInnings?.innings;

  if (
    !inn ||
    typeof inn !== 'object'
  ) {
    return (
      <p className="text-slate-400">
        Loading match data…
      </p>
    );
  }

  /*
   * ----------------------------------------------------
   * DISPLAY SCORE
   * ----------------------------------------------------
   */

  const displayTotalRuns =
    optimistic?.total_runs ??
    Number(
      inn.total_runs || 0
    );

  const displayTotalWickets =
    optimistic?.total_wickets ??
    Number(
      inn.total_wickets || 0
    );

  const displayTotalBalls =
    optimistic?.total_balls ??
    Number(
      inn.total_balls || 0
    );

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
          ) * 6
        ).toFixed(2)
      : '0.00';

  /*
   * ----------------------------------------------------
   * ACTIVE PLAYERS
   * ----------------------------------------------------
   */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn.striker_id;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn.non_striker_id;

  const effectiveBowlerId =
    optimistic?.activeBowlerId ??
    inn.current_bowler_id;

  const battingTeamPlayers =
    safePlayers.filter(
      p =>
        p?.team_id ===
          inn.batting_team_id &&
        p?.active !== false
    );

  const bowlingTeamPlayers =
    safePlayers.filter(
      p =>
        p?.team_id ===
          inn.bowling_team_id &&
        p?.active !== false
    );

  const battingCard =
    safeArray(
      currentInnings.battingCard
    );

  const bowlingCard =
    safeArray(
      currentInnings.bowlingCard
    );

  const outIds =
    new Set(
      battingCard
        .filter(
          b => b?.is_out
        )
        .map(
          b => b?.player_id
        )
    );

  if (
    optimistic?.strikerStats?.is_out &&
    optimistic.strikerStats.player_id
  ) {
    outIds.add(
      optimistic.strikerStats.player_id
    );
  }

  if (
    optimistic?.nonStrikerStats?.is_out &&
    optimistic.nonStrikerStats.player_id
  ) {
    outIds.add(
      optimistic.nonStrikerStats.player_id
    );
  }

  const striker =
    safePlayers.find(
      p =>
        p?.id ===
        effectiveStrikerId
    );

  const nonStriker =
    safePlayers.find(
      p =>
        p?.id ===
        effectiveNonStrikerId
    );

  const bowler =
    safePlayers.find(
      p =>
        p?.id ===
        effectiveBowlerId
    );

  /*
   * ----------------------------------------------------
   * NEED BATSMEN
   * ----------------------------------------------------
   */

  const needStriker =
    !effectiveStrikerId;

  const needNonStriker =
    !effectiveNonStrikerId;

  if (
    needStriker ||
    needNonStriker
  ) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 fade-in">

        <div className="card">

          <div className="flex justify-between items-center">

            <div>

              <div className="text-sm text-slate-400">
                {match.team1_short}
                {' vs '}
                {match.team2_short}
              </div>

              <div className="text-3xl font-extrabold">

                {displayTotalRuns}

                <span className="text-slate-400">
                  /{displayTotalWickets}
                </span>

              </div>

            </div>

            <div className="text-right text-sm text-slate-400">

              <div>
                {displayOvers} ov
              </div>

              <div>
                RR: {displayRunRate}
              </div>

            </div>

          </div>

        </div>

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
            selectedStriker,
            selectedNonStriker
          ) =>
            act(() =>
              Innings.setBatsmen(
                inn.id,
                {
                  striker_id:
                    selectedStriker ||
                    effectiveStrikerId,

                  non_striker_id:
                    selectedNonStriker ||
                    effectiveNonStrikerId
                }
              )
            )
          }
        />

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-2 text-sm">
            {error}
          </div>
        )}

      </div>
    );
  }

  /*
   * ----------------------------------------------------
   * BATSMAN STATS
   * ----------------------------------------------------
   */

  const serverStrikerStats =
    battingCard.find(
      b =>
        b?.player_id ===
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
    battingCard.find(
      b =>
        b?.player_id ===
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

  const strikerStats =
    optimistic &&
    optimistic.strikerStats &&
    optimistic.strikerStats.player_id ===
      effectiveStrikerId
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic &&
    optimistic.nonStrikerStats &&
    optimistic.nonStrikerStats.player_id ===
      effectiveNonStrikerId
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  /*
   * ----------------------------------------------------
   * BOWLER STATS
   * ----------------------------------------------------
   */

  const serverBowlerStats =
    bowlingCard.find(
      b =>
        b?.player_id ===
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
   * ----------------------------------------------------
   * RECENT BALLS
   * ----------------------------------------------------
   */

  const recentBalls =
    safeArray(
      optimistic?.recentBalls ||
      currentInnings.recentBalls
    );

  const overCompleted =
    displayTotalBalls > 0 &&
    displayTotalBalls % 6 === 0;

  const displayOverNumber =
    Math.floor(
      displayTotalBalls / 6
    );

  const currentOverBalls =
    overCompleted
      ? []
      : recentBalls.filter(
          ball =>
            Number(
              ball?.over_number
            ) ===
            displayOverNumber
        );

  /*
   * ----------------------------------------------------
   * NEXT BOWLER
   * ----------------------------------------------------
   */

  const needsNextBowler =
    optimistic?.needsNextBowler ||
    (
      !inn.current_bowler_id &&
      displayTotalBalls > 0 &&
      displayTotalBalls % 6 === 0
    );

  /*
   * ----------------------------------------------------
   * PARTNERSHIP
   * ----------------------------------------------------
   */

  const partnership =
    optimistic?.partnership ||
    (
      currentInnings.partnership &&
      typeof currentInnings.partnership ===
        'object'
        ? currentInnings.partnership
        : null
    ) ||
    {
      runs: 0,
      balls: 0
    };

  /*
   * ----------------------------------------------------
   * RENDER
   * ----------------------------------------------------
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

        {/* SCORE HEADER */}

        <div className="flex justify-between items-center flex-wrap gap-3">

          <div>

            <div className="text-sm text-slate-400">

              {match.team1_short}
              {' vs '}
              {match.team2_short}
              {' · '}
              {match.overs_limit}
              {' overs'}

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

            {inn.target != null && (
              <div>
                Target: {inn.target}
              </div>
            )}

            {pendingCount > 0 && (
              <div className="text-emerald-400 text-xs mt-1 font-medium">
                Saving {pendingCount}…
              </div>
            )}

          </div>

        </div>

        {/* BATSMEN */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">

          <BatsmanCard
            player={striker}
            stats={strikerStats}
            striker
          />

          <BatsmanCard
            player={nonStriker}
            stats={nonStrikerStats}
          />

        </div>

        {/* CURRENT BOWLER */}

        <div className="mt-2">

          <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">

            <div className="flex justify-between items-center">

              <div>

                <div className="font-semibold text-white">
                  🎯 {bowler?.name || 'No bowler selected'}
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {effectiveBowlerId
                    ? 'CURRENT BOWLER'
                    : 'SELECT BOWLER TO START'}
                </div>

              </div>

              {effectiveBowlerId && (
                <div className="grid grid-cols-5 gap-3 text-center">

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
                    label="M"
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
                    label="W"
                  />

                  <BowlingStat
                    value={
                      bowlerStats.economy
                    }
                    label="Econ"
                  />

                </div>
              )}

            </div>

          </div>

        </div>

        {/* CURRENT OVER */}

        <div className="mt-2 bg-slate-900/70 rounded-xl p-2">

          <div className="flex justify-between items-center mb-2">

            <h3 className="text-sm font-semibold text-slate-300">
              Current Over
            </h3>

            <span className="text-xs text-slate-500">
              Over {displayOverNumber + 1}
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
                      ball?.id ||
                      `${ball?.ball_sequence}-${index}`
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
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* SCORING CONTROLS */}

      {!needsNextBowler &&
        effectiveBowlerId && (
          <>

            <div className="card !p-3">

              <div className="flex items-center justify-between mb-2">

                <div>

                  <h3 className="font-semibold text-sm text-slate-300">
                    Score Runs
                  </h3>

                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Quick scoring
                  </div>

                </div>

                <div className="text-xs text-slate-500">
                  {displayTotalBalls % 6}/6
                </div>

              </div>

              <div className="grid grid-cols-6 gap-1.5">

                {[0, 1, 2, 3, 4, 6].map(
                  r => (

                    <button
                      key={r}
                      className={`h-11 rounded-xl font-bold text-base active:scale-95 transition-transform ${
                        r === 4
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : r === 6
                            ? 'bg-purple-600 hover:bg-purple-500'
                            : 'bg-slate-700 hover:bg-slate-600'
                      }`}
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

              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-1.5">

                <button
                  className="h-10 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 font-semibold text-sm active:scale-95 transition-transform"
                  onClick={() =>
                    act(() =>
                      Innings.swapStrike(
                        inn.id
                      )
                    )
                  }
                  disabled={
                    pendingCount > 0
                  }
                >
                  ⇄ Swap
                </button>

                <button
                  className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm active:scale-95 transition-transform"
                  onClick={() =>
                    setShowWicket(true)
                  }
                  disabled={
                    pendingCount > 0
                  }
                >
                  OUT
                </button>

              </div>

            </div>

            {/* EXTRAS */}

            <div className="card">

              <h3 className="font-semibold mb-2 text-sm text-slate-400">
                Extras
              </h3>

              {!extraPicker ? (

                <div className="grid grid-cols-4 gap-2">

                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() =>
                      setExtraPicker(
                        'wide'
                      )
                    }
                  >
                    Wide
                  </button>

                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() =>
                      setExtraPicker(
                        'noball'
                      )
                    }
                  >
                    No Ball
                  </button>

                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() =>
                      setExtraPicker(
                        'bye'
                      )
                    }
                  >
                    Bye
                  </button>

                  <button
                    className="btn btn-secondary text-sm"
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

                <div className="fade-in">

                  <div className="flex items-center justify-between mb-2">

                    <span className="text-sm font-medium text-slate-300">

                      {extraPicker ===
                        'wide' &&
                        'Wide — extra runs'}

                      {extraPicker ===
                        'noball' &&
                        'No Ball — runs off bat'}

                      {extraPicker ===
                        'bye' &&
                        'Bye — runs'}

                      {extraPicker ===
                        'legbye' &&
                        'Leg Bye — runs'}

                    </span>

                    <button
                      className="text-xs text-slate-400 hover:text-white"
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

            {/* ACTIONS */}

            <div className="grid grid-cols-2 gap-2">

              <button
                className="btn btn-secondary"
                disabled={
                  pendingCount > 0
                }
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
                disabled={
                  pendingCount > 0
                }
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

          </>
        )}

      {/* SELECT BOWLER BUTTON */}

      {!effectiveBowlerId &&
        effectiveStrikerId &&
        effectiveNonStrikerId &&
        displayTotalBalls === 0 && (

          <div className="card">

            <button
              className="btn btn-primary w-full h-12 text-base font-bold"
              onClick={() =>
                setShowInitialBowler(
                  true
                )
              }
            >
              🎯 Select Bowler to Start
            </button>

          </div>

        )}

      {/* CURRENT PARTNERSHIP */}

      <div className="mt-2 bg-slate-900/70 rounded-xl p-2 border border-slate-700">

        <div className="flex justify-between items-center">

          <div>

            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Current Partnership
            </div>

            <div className="text-base font-bold text-white mt-1">

              {partnership.runs || 0}
              {' '}

              <span className="text-xs text-slate-400 font-normal">
                runs
              </span>

              {' · '}

              {partnership.balls || 0}
              {' '}

              <span className="text-xs text-slate-400 font-normal">
                balls
              </span>

            </div>

          </div>

          <div className="text-xl">
            🤝
          </div>

        </div>

      </div>

      {/* FALL OF WICKETS */}

      <FallOfWickets
        wickets={
          safeArray(
            optimistic?.fallOfWickets ||
            currentInnings.fallOfWickets
          )
        }
        players={
          safePlayers
        }
      />

      {/* SCOREBOARD */}

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

      {/* INITIAL BOWLER MODAL */}

      {showInitialBowler && (
        <InitialBowlerModal
          team={
            bowlingTeamPlayers
          }
          teamId={
            inn.bowling_team_id
          }
          onPlayerCreated={
            handlePlayerCreated
          }
          error={error}
          onSelect={async (
            selected
          ) => {

            const bowlerId =
              getPlayerId(
                selected
              );

            if (!bowlerId) {
              return;
            }

            try {
              setError('');

              await Innings.setBowler(
                inn.id,
                {
                  bowler_id:
                    bowlerId
                }
              );

              const nextState = {
                ...(optimisticRef.current ||
                  {}),

                activeBowlerId:
                  bowlerId,

                needsNextBowler:
                  false,

                bowlerBalls:
                  0,

                bowlerStats: {
                  player_id:
                    bowlerId,

                  overs:
                    '0.0',

                  maidens:
                    0,

                  runs:
                    0,

                  wickets:
                    0,

                  economy:
                    0
                }
              };

              optimisticRef.current =
                nextState;

              setOptimistic(
                nextState
              );

              setShowInitialBowler(
                false
              );

              const data =
                await Matches.get(
                  matchId
                );

              if (
                pendingCountRef.current ===
                0
              ) {
                applyServerData(
                  data
                );
              }

            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.message ||
                'Unable to select bowler'
              );
            }

          }}
        />
      )}

      {/* NEXT BOWLER MODAL */}

      {showNextBowler &&
        needsNextBowler && (

          <NextBowlerModal
            team={
              bowlingTeamPlayers
            }
            teamId={
              inn.bowling_team_id
            }
            onPlayerCreated={
              handlePlayerCreated
            }
            error={error}
            onSelect={async (
              selected
            ) => {

              const bowlerId =
                getPlayerId(
                  selected
                );

              if (!bowlerId) {
                return;
              }

              try {

                setError('');

                await Innings.setBowler(
                  inn.id,
                  {
                    bowler_id:
                      bowlerId
                  }
                );

                const nextState = {
                  ...(optimisticRef.current ||
                    {}),

                  activeBowlerId:
                    bowlerId,

                  needsNextBowler:
                    false,

                  bowlerBalls:
                    0,

                  bowlerStats: {
                    player_id:
                      bowlerId,

                    overs:
                      '0.0',

                    maidens:
                      0,

                    runs:
                      0,

                    wickets:
                      0,

                    economy:
                      0
                  }
                };

                optimisticRef.current =
                  nextState;

                setOptimistic(
                  nextState
                );

                setShowNextBowler(
                  false
                );

                const data =
                  await Matches.get(
                    matchId
                  );

                if (
                  pendingCountRef.current ===
                  0
                ) {
                  applyServerData(
                    data
                  );
                }

              } catch (err) {

                setError(
                  err?.response?.data?.error ||
                  err?.response?.data?.message ||
                  err?.message ||
                  'Unable to select bowler'
                );

              }

            }}
          />

        )}

      {/* WICKET MODAL */}

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
                  ? Number(
                      runsBeforeWicket ||
                      0
                    )
                  : 0,

              is_wicket:
                true,

              wicket_type:
                wicketType,

              dismissed_id:
                getPlayerId(
                  dismissedId
                ),

              fielder_id:
                getPlayerId(
                  fielderId
                )
            });

          }}
        />

      )}

    </div>
  );
}


/*
 * ----------------------------------------------------
 * INITIAL BOWLER SELECTOR
 * ----------------------------------------------------
 */

function InitialBowlerModal({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error
}) {
  const [bowler, setBowler] =
    useState(null);

  const safeTeam =
    Array.isArray(team)
      ? team
      : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative w-full max-w-md">

        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden">

          <div className="p-5 border-b border-slate-700">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Match Starting
                </div>

                <h2 className="text-2xl font-extrabold text-white mt-1">
                  🎯 Select Bowler
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  Choose the bowler for the first over
                </p>

              </div>

              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
                🎯
              </div>

            </div>

          </div>

          <div className="p-5">

            <div className="mb-4">

              <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                First Bowler
              </div>

              <PlayerAutocomplete
                players={
                  safeTeam
                }
                value={
                  bowler
                }
                onChange={
                  setBowler
                }
                teamId={
                  teamId
                }
                onCreated={
                  onPlayerCreated
                }
                placeholder="Type or select bowler…"
              />

            </div>

            {error && (
              <div className="mb-4 bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <button
              className="btn btn-primary w-full h-12 text-base font-bold"
              disabled={
                !bowler
              }
              onClick={() =>
                onSelect(
                  bowler
                )
              }
            >
              Start First Over →
            </button>

            {!bowler && (
              <div className="text-center text-xs text-slate-500 mt-3">
                Select a bowler to start scoring
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * NEXT BOWLER SELECTOR
 * ----------------------------------------------------
 */

function NextBowlerModal({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error
}) {
  const [bowler, setBowler] =
    useState(null);

  const safeTeam =
    Array.isArray(team)
      ? team
      : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative w-full max-w-md">

        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden">

          <div className="p-5 border-b border-slate-700">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Over Complete
                </div>

                <h2 className="text-2xl font-extrabold text-white mt-1">
                  🎯 Select Next Bowler
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  Choose the bowler for the new over
                </p>

              </div>

              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
                🏏
              </div>

            </div>

          </div>

          <div className="p-5">

            <div className="mb-4">

              <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                Next Bowler
              </div>

              <PlayerAutocomplete
                players={
                  safeTeam
                }
                value={
                  bowler
                }
                onChange={
                  setBowler
                }
                teamId={
                  teamId
                }
                onCreated={
                  onPlayerCreated
                }
                placeholder="Type or select bowler…"
              />

            </div>

            {error && (
              <div className="mb-4 bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <button
              className="btn btn-primary w-full h-12 text-base font-bold"
              disabled={
                !bowler
              }
              onClick={() =>
                onSelect(
                  bowler
                )
              }
            >
              Start New Over →
            </button>

            {!bowler && (
              <div className="text-center text-xs text-slate-500 mt-3">
                Select a bowler to continue scoring
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * FALL OF WICKETS
 * ----------------------------------------------------
 */

function FallOfWickets({
  wickets,
  players
}) {
  const safeWickets =
    Array.isArray(wickets)
      ? wickets
      : [];

  const safePlayers =
    Array.isArray(players)
      ? players
      : [];

  if (
    safeWickets.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-3 bg-slate-900/70 rounded-xl p-3 border border-slate-700">

      <div className="flex items-center justify-between mb-3">

        <div>

          <div className="text-xs text-slate-500 uppercase tracking-wide">
            Fall of Wickets
          </div>

          <div className="text-sm font-semibold text-white mt-1">
            Wicket timeline
          </div>

        </div>

        <div className="text-xl">
          📉
        </div>

      </div>

      <div className="space-y-2">

        {safeWickets.map(
          (item, index) => {

            const player =
              safePlayers.find(
                p =>
                  p?.id ===
                  item?.player_id
              );

            return (
              <div
                key={
                  item?.id ||
                  `${item?.wicket_number}-${item?.player_id}-${index}`
                }
                className="flex items-center justify-between bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700"
              >

                <div className="flex items-center gap-3 min-w-0">

                  <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 text-red-300 flex items-center justify-center text-xs font-bold">
                    {item?.wicket_number}
                  </div>

                  <div className="min-w-0">

                    <div className="text-sm font-semibold text-white truncate">
                      {player?.name || 'Batsman'}
                    </div>

                    <div className="text-[11px] text-slate-500">

                      {item?.wicket_type || 'Wicket'}

                      {item?.overs != null
                        ? ` · ${item.overs} ov`
                        : ''}

                    </div>

                  </div>

                </div>

                <div className="text-right ml-3">

                  <div className="text-base font-extrabold text-white">
                    {item?.score}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    TEAM SCORE
                  </div>

                </div>

              </div>
            );
          }
        )}

      </div>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * STAT
 * ----------------------------------------------------
 */

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


/*
 * ----------------------------------------------------
 * BOWLING STAT
 * ----------------------------------------------------
 */

function BowlingStat({
  value,
  label
}) {
  return (
    <div>

      <div className="text-base font-bold">
        {value}
      </div>

      <div className="text-[10px] text-slate-500">
        {label}
      </div>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * BATSMAN CARD
 * ----------------------------------------------------
 */

function BatsmanCard({
  player,
  stats,
  striker = false
}) {
  const safeStats =
    stats &&
    typeof stats === 'object'
      ? stats
      : {};

  const runs =
    Number(
      safeStats.runs || 0
    );

  const balls =
    Number(
      safeStats.balls || 0
    );

  const fours =
    Number(
      safeStats.fours || 0
    );

  const sixes =
    Number(
      safeStats.sixes || 0
    );

  const strikeRate =
    safeStats.strike_rate != null
      ? Number(
          safeStats.strike_rate
        ).toFixed(2)
      : balls > 0
        ? (
            (runs / balls) *
            100
          ).toFixed(2)
        : '0.00';

  return (
    <div
      className={`rounded-xl p-3 border ${
        striker
          ? 'bg-emerald-950/40 border-emerald-500/40'
          : 'bg-slate-900/70 border-slate-700'
      }`}
    >

      <div className="flex items-center justify-between gap-2">

        <div className="min-w-0">

          <div className="flex items-center gap-1.5">

            {striker && (
              <span className="text-emerald-400 text-sm">
                ▶
              </span>
            )}

            <span className="font-semibold text-white truncate">
              {player?.name || 'Batsman'}
            </span>

            {safeStats.is_out && (
              <span className="text-red-400 text-xs font-bold">
                OUT
              </span>
            )}

          </div>

          <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">
            {striker
              ? 'STRIKER'
              : 'NON-STRIKER'}
          </div>

        </div>

        <div className="text-right shrink-0">

          <div className="text-xl font-extrabold text-white">
            {runs}
            <span className="text-xs text-slate-400 font-normal">
              ({balls})
            </span>
          </div>

          <div className="text-[10px] text-slate-500">
            SR {strikeRate}
          </div>

        </div>

      </div>

      <div className="flex gap-4 mt-2 pt-2 border-t border-slate-800 text-xs">

        <Stat
          value={fours}
          label="4s"
        />

        <Stat
          value={sixes}
          label="6s"
        />

        <Stat
          value={strikeRate}
          label="SR"
        />

      </div>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * BALL DISPLAY
 * ----------------------------------------------------
 */

function BallDisplay({
  ball
}) {
  const safeBall =
    ball &&
    typeof ball === 'object'
      ? ball
      : {};

  let label =
    String(
      safeBall.runs_batsman ?? 0
    );

  let className =
    'bg-slate-700';

  if (
    safeBall.is_wicket
  ) {
    label = 'W';
    className =
      'bg-red-600';

  } else if (
    safeBall.extra_type ===
    'wide'
  ) {

    label =
      `Wd${
        Number(
          safeBall.extra_runs || 1
        ) > 1
          ? `+${Number(
              safeBall.extra_runs
            ) - 1}`
          : ''
      }`;

    className =
      'bg-yellow-600';

  } else if (
    safeBall.extra_type ===
    'noball'
  ) {

    label =
      `Nb${
        safeBall.runs_batsman
          ? `+${safeBall.runs_batsman}`
          : ''
      }`;

    className =
      'bg-orange-600';

  } else if (
    safeBall.extra_type ===
    'bye'
  ) {

    label =
      `${safeBall.extra_runs}B`;

    className =
      'bg-blue-600';

  } else if (
    safeBall.extra_type ===
    'legbye'
  ) {

    label =
      `${safeBall.extra_runs}Lb`;

    className =
      'bg-blue-800';

  } else if (
    Number(
      safeBall.runs_batsman
    ) === 4
  ) {

    label = '4';

    className =
      'bg-emerald-600';

  } else if (
    Number(
      safeBall.runs_batsman
    ) === 6
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
        {safeBall.is_legal
          ? 'legal'
          : 'extra'}
      </span>

    </div>
  );
}


/*
 * ----------------------------------------------------
 * BATSMEN SELECTION
 * ----------------------------------------------------
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
  const [
    striker,
    setStriker
  ] = useState(null);

  const [
    nonStriker,
    setNonStriker
  ] = useState(null);

  const safeTeam =
    Array.isArray(team)
      ? team
      : [];

  const safeOutIds =
    outIds instanceof Set
      ? outIds
      : new Set();

  const available =
    safeTeam.filter(
      player =>
        player &&
        !safeOutIds.has(
          player.id
        )
    );

  const strikerId =
    typeof striker ===
    'object'
      ? striker?.id
      : striker;

  const nonStrikerId =
    typeof nonStriker ===
    'object'
      ? nonStriker?.id
      : nonStriker;

  return (
    <div className="card space-y-4 fade-in">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-xl font-bold">

            {hasStriker &&
            !hasNonStriker
              ? 'Select New Batsman'
              : !hasStriker &&
                hasNonStriker
              ? 'Select New Batsman'
              : 'Select Batsmen'}

          </h1>

          <p className="text-xs text-slate-500 mt-1">
            Choose the player to continue the innings
          </p>

        </div>

        <div className="text-2xl">
          🏏
        </div>

      </div>

      {!hasStriker && (
        <div>

          <label className="text-sm text-slate-400 mb-1 block">
            On strike
          </label>

          <PlayerAutocomplete
            players={
              available
            }
            value={
              striker
            }
            onChange={
              setStriker
            }
            teamId={
              teamId
            }
            onCreated={
              onPlayerCreated
            }
            excludeIds={
              nonStrikerId
                ? [nonStrikerId]
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
            players={
              available
            }
            value={
              nonStriker
            }
            onChange={
              setNonStriker
            }
            teamId={
              teamId
            }
            onCreated={
              onPlayerCreated
            }
            excludeIds={
              strikerId
                ? [strikerId]
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
            !strikerId) ||
          (!hasNonStriker &&
            !nonStrikerId)
        }
        onClick={() =>
          onSelect(
            strikerId,
            nonStrikerId
          )
        }
      >
        Confirm
      </button>

    </div>
  );
}
