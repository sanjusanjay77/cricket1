import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

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

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  /*
   * ---------------------------------------------------------
   * FAST ACTION CONTROL
   * ---------------------------------------------------------
   *
   * "swap" / "undo" is only used to prevent double clicks.
   *
   * IMPORTANT:
   * We do NOT keep this busy while Matches.get() is running.
   * The screen becomes usable as soon as the actual API action
   * succeeds.
   */

  const actionBusyRef = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);

  /*
   * Each optimistic action gets a version.
   *
   * This prevents an older background refresh from overwriting
   * a newer optimistic action.
   */

  const syncVersionRef = useRef(0);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * ---------------------------------------------------------
   * SERVER DATA
   * ---------------------------------------------------------
   */

  const applyServerData = useCallback((data) => {
    if (!data) return;

    setMatch(data.match);
    setPlayers(safeArray(data.players));
    setInnings(safeArray(data.innings));

    if (pendingCountRef.current === 0) {
      optimisticRef.current = null;
      setOptimistic(null);
    }
  }, []);

  /*
   * ---------------------------------------------------------
   * BACKGROUND FULL SYNC
   * ---------------------------------------------------------
   *
   * This function is intentionally fire-and-forget.
   *
   * The scorer does not wait for it before becoming usable.
   */

  const backgroundSync = useCallback(
    (version = syncVersionRef.current) => {
      Matches.get(matchId)
        .then((data) => {
          /*
           * Never overwrite newer optimistic work.
           */
          if (
            version !== syncVersionRef.current
          ) {
            return;
          }

          if (
            pendingCountRef.current > 0
          ) {
            return;
          }

          applyServerData(data);
        })
        .catch((err) => {
          console.error(
            'Background sync failed:',
            err
          );
        });
    },
    [
      matchId,
      applyServerData
    ]
  );

  /*
   * ---------------------------------------------------------
   * INITIAL / MANUAL FULL LOAD
   * ---------------------------------------------------------
   */

  const loadFull = useCallback(async () => {
    try {
      const data =
        await Matches.get(matchId);

      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      applyServerData(data);
    } catch (err) {
      console.error(
        'Failed to load match:',
        err
      );
    }
  }, [
    matchId,
    applyServerData
  ]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * ---------------------------------------------------------
   * SOCKET
   * ---------------------------------------------------------
   */

  useEffect(() => {
    socket.emit(
      'join-match',
      matchId
    );

    const onUpdate = ({
      match: updatedMatch,
      innings: updatedInnings
    }) => {
      /*
       * Never overwrite queued optimistic balls.
       */
      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      /*
       * If we have local optimistic state,
       * wait for our authoritative background
       * sync instead of potentially applying stale
       * socket data.
       */
      if (
        optimisticRef.current
      ) {
        return;
      }

      /*
       * If an action is currently being confirmed,
       * don't overwrite it.
       */
      if (
        actionBusyRef.current
      ) {
        return;
      }

      setMatch(updatedMatch);
      setInnings(
        safeArray(updatedInnings)
      );
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
   * ---------------------------------------------------------
   * CLEANUP
   * ---------------------------------------------------------
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

      processingQueueRef.current =
        false;

      actionBusyRef.current =
        false;
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * PLAYER CREATED
   * ---------------------------------------------------------
   */

  const handlePlayerCreated =
    useCallback((player) => {
      if (!player) {
        return;
      }

      setPlayers((prev) => {
        const exists =
          prev.some(
            (p) =>
              p.id === player.id
          );

        if (exists) {
          return prev;
        }

        return [
          ...prev,
          player
        ];
      });
    }, []);

  /*
   * ---------------------------------------------------------
   * VISUAL EFFECTS
   * ---------------------------------------------------------
   */

  const popBoundary =
    useCallback((type) => {
      clearTimeout(
        boundaryTimer.current
      );

      setBoundary(type);

      boundaryTimer.current =
        setTimeout(() => {
          setBoundary(null);
        }, 1100);
    }, []);

  const popWicket =
    useCallback(() => {
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
   * ---------------------------------------------------------
   * GENERIC SERVER ACTION
   * ---------------------------------------------------------
   *
   * Used for setup actions where optimistic handling is not
   * necessary.
   */

  const act = async (fn) => {
    setError('');

    try {
      await fn();

      /*
       * Do not make the UI wait unnecessarily.
       */
      backgroundSync(
        ++syncVersionRef.current
      );
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Something went wrong'
      );

      backgroundSync(
        ++syncVersionRef.current
      );
    }
  };

  /*
   * ---------------------------------------------------------
   * PLAYER ID
   * ---------------------------------------------------------
   */

  const getPlayerId = (player) => {
    if (!player) {
      return null;
    }

    if (
      typeof player === 'string'
    ) {
      return player;
    }

    if (
      typeof player === 'object'
    ) {
      return player.id || null;
    }

    return null;
  };

  /*
   * ---------------------------------------------------------
   * OPTIMISTIC BALL BUILDER
   * ---------------------------------------------------------
   */

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previousOptimistic
  }) => {
    let strikerId =
      previousOptimistic?.strikerId ??
      current.striker_id;

    let nonStrikerId =
      previousOptimistic?.nonStrikerId ??
      current.non_striker_id;

    const scoringBowlerId =
      previousOptimistic?.activeBowlerId ??
      current.current_bowler_id;

    const runs =
      Number(payload.runs || 0);

    const inputExtraRuns =
      Number(
        payload.extra_runs || 0
      );

    let teamRuns = 0;
    let batsmanRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (
      payload.extra_type
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
      !!payload.is_wicket;

    const previousRuns =
      previousOptimistic?.total_runs ??
      Number(
        current.total_runs || 0
      );

    const previousWickets =
      previousOptimistic?.total_wickets ??
      Number(
        current.total_wickets || 0
      );

    const previousBalls =
      previousOptimistic?.total_balls ??
      Number(
        current.total_balls || 0
      );

    const newTotalRuns =
      previousRuns + teamRuns;

    const newTotalWickets =
      previousWickets +
      (wicket ? 1 : 0);

    const newTotalBalls =
      previousBalls +
      (legal ? 1 : 0);

    /*
     * ---------------------------------------------------------
     * BATSMAN STATS
     * ---------------------------------------------------------
     */

    const battingCard =
      safeArray(
        currentInnings.battingCard
      );

    const serverStrikerStats =
      battingCard.find(
        (b) =>
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

    const serverNonStrikerStats =
      battingCard.find(
        (b) =>
          b.player_id ===
          nonStrikerId
      ) || {
        player_id:
          nonStrikerId,
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
      payload.extra_type ===
        'wide' ||
      payload.extra_type ===
        'noball'
        ? 0
        : 1;

    const batterGetsRuns =
      !payload.extra_type ||
      payload.extra_type ===
        'noball';

    const newStrikerRuns =
      Number(
        previousStrikerStats.runs ||
          0
      ) +
      (
        batterGetsRuns
          ? batsmanRuns
          : 0
      );

    const newStrikerBalls =
      Number(
        previousStrikerStats.balls ||
          0
      ) +
      strikerBallsAdded;

    const newStrikerFours =
      Number(
        previousStrikerStats.fours ||
          0
      ) +
      (
        batterGetsRuns &&
        batsmanRuns === 4
          ? 1
          : 0
      );

    const newStrikerSixes =
      Number(
        previousStrikerStats.sixes ||
          0
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

    let updatedStrikerStats =
      {
        ...previousStrikerStats,

        player_id:
          strikerId,

        runs:
          newStrikerRuns,

        balls:
          newStrikerBalls,

        fours:
          newStrikerFours,

        sixes:
          newStrikerSixes,

        strike_rate:
          newStrikerSR
      };

    let updatedNonStrikerStats =
      {
        ...previousNonStrikerStats,

        player_id:
          nonStrikerId
      };

    /*
     * ---------------------------------------------------------
     * WICKET
     * ---------------------------------------------------------
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
          payload.wicket_type ||
          null;

        updatedStrikerStats.dismissed_by =
          scoringBowlerId ||
          null;

        updatedStrikerStats.fielder_id =
          payload.fielder_id ||
          null;

        strikerId = null;

      } else if (
        payload.dismissed_id ===
        nonStrikerId
      ) {
        updatedNonStrikerStats.is_out =
          true;

        updatedNonStrikerStats.how_out =
          payload.wicket_type ||
          null;

        updatedNonStrikerStats.dismissed_by =
          scoringBowlerId ||
          null;

        updatedNonStrikerStats.fielder_id =
          payload.fielder_id ||
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
     * ---------------------------------------------------------
     * BOWLER STATS
     * ---------------------------------------------------------
     */

    const bowlingCard =
      safeArray(
        currentInnings.bowlingCard
      );

    const serverBowlerStats =
      bowlingCard.find(
        (b) =>
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

    const previousBowlerStats =
      previousOptimistic?.bowlerStats ||
      serverBowlerStats;

    let previousBowlerBalls =
      previousOptimistic?.bowlerBalls;

    if (
      previousBowlerBalls ===
      undefined
    ) {
      previousBowlerBalls =
        getBowlerBalls(
          previousBowlerStats
        );
    }

    const newBowlerBalls =
      previousBowlerBalls +
      (legal ? 1 : 0);

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
        'legbye' ||
      payload.extra_type ===
        'penalty'
    ) {
      bowlerRunsAdded = 0;

    } else {
      bowlerRunsAdded =
        batsmanRuns;
    }

    const newBowlerRuns =
      Number(
        previousBowlerStats.runs ||
          0
      ) +
      bowlerRunsAdded;

    const bowlerGetsWicket =
      wicket &&
      payload.wicket_type !==
        'run-out';

    const newBowlerWickets =
      Number(
        previousBowlerStats.wickets ||
          0
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
        previousOptimistic?.recentBalls ||
        safeArray(
          currentInnings.recentBalls
        );

      const completedOverNumber =
        Math.floor(
          previousBalls / 6
        );

      const ballsForCompletedOver =
        previousRecentBalls.filter(
          (ball) =>
            Number(
              ball.over_number
            ) ===
              completedOverNumber &&
            ball.bowler_id ===
              scoringBowlerId
        );

      let overRuns =
        bowlerRunsAdded;

      ballsForCompletedOver.forEach(
        (ball) => {
          const ballExtra =
            ball.extra_type;

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
                  ball.extra_runs ||
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
                  ball.extra_runs ||
                    1
                )
              ) +
              Number(
                ball.runs_batsman ||
                  0
              );

          } else {
            overRuns +=
              Number(
                ball.runs_batsman ||
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
                newBowlerBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    const updatedBowlerStats =
      {
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
     * ---------------------------------------------------------
     * END OF OVER
     * ---------------------------------------------------------
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
     * ---------------------------------------------------------
     * RECENT BALL
     * ---------------------------------------------------------
     */

    const previousRecentBalls =
      previousOptimistic?.recentBalls ||
      safeArray(
        currentInnings.recentBalls
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
                  previousRecentBalls.length -
                    1
                ].ball_sequence
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
        current.striker_id,

      non_striker_id:
        previousOptimistic?.nonStrikerId ??
        current.non_striker_id,

      bowler_id:
        scoringBowlerId,

      runs_batsman:
        batsmanRuns,

      extra_type:
        payload.extra_type ||
        null,

      extra_runs:
        inputExtraRuns,

      is_wicket:
        wicket,

      wicket_type:
        payload.wicket_type ||
        null,

      dismissed_id:
        payload.dismissed_id ||
        null,

      fielder_id:
        payload.fielder_id ||
        null,

      is_legal:
        legal ? 1 : 0
    };

    const newRecentBalls =
      [
        ...previousRecentBalls,
        optimisticBall
      ].slice(-24);

    /*
     * ---------------------------------------------------------
     * EXTRAS
     * ---------------------------------------------------------
     */

    const previousExtras =
      previousOptimistic?.extras || {
        wide:
          Number(
            current.extras_wide ||
              0
          ),

        noball:
          Number(
            current.extras_noball ||
              0
          ),

        bye:
          Number(
            current.extras_bye ||
              0
          ),

        legbye:
          Number(
            current.extras_legbye ||
              0
          ),

        penalty:
          Number(
            current.extras_penalty ||
              0
          )
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
     * ---------------------------------------------------------
     * PARTNERSHIP
     * ---------------------------------------------------------
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
                payload.extra_type ===
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
                newTotalBalls /
                6
              )
            ).toFixed(2)
          )
        : 0;

    /*
     * ---------------------------------------------------------
     * FALL OF WICKETS
     * ---------------------------------------------------------
     */

    const previousFallOfWickets =
      previousOptimistic?.fallOfWickets ||
      currentInnings.fallOfWickets ||
      [];

    const newFallOfWickets =
      wicket &&
      payload.dismissed_id
        ? [
            ...previousFallOfWickets,
            {
              wicket_number:
                newTotalWickets,

              player_id:
                payload.dismissed_id,

              score:
                newTotalRuns,

              overs:
                `${Math.floor(
                  newTotalBalls / 6
                )}.${newTotalBalls % 6}`,

              wicket_type:
                payload.wicket_type ||
                null,

              bowler_id:
                scoringBowlerId ||
                null,

              fielder_id:
                payload.fielder_id ||
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
   * ---------------------------------------------------------
   * SCORE SAVE QUEUE
   * ---------------------------------------------------------
   *
   * IMPORTANT SPEED CHANGE:
   *
   * We DO NOT call Matches.get(matchId) after every ball.
   *
   * The optimistic UI already shows the new score.
   * Socket.IO handles live synchronization.
   *
   * One background full sync happens after the queue is empty.
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
            err?.message ||
            'Unable to save ball'
          );

          scoreQueueRef.current =
            [];

          pendingCountRef.current =
            0;

          setPendingCount(0);

          optimisticRef.current =
            null;

          setOptimistic(null);

          /*
           * Only reload on an actual failure.
           */
          backgroundSync(
            ++syncVersionRef.current
          );

          break;
        }
      }

      processingQueueRef.current =
        false;

      /*
       * ONE background sync after the entire
       * queue has finished.
       *
       * This is the major speed improvement.
       */
      if (
        !failed &&
        pendingCountRef.current ===
          0
      ) {
        backgroundSync(
          ++syncVersionRef.current
        );
      }
    }, [
      backgroundSync
    ]);

  /*
   * ---------------------------------------------------------
   * RECORD BALL
   * ---------------------------------------------------------
   */

  const playBall =
    useCallback(
      (payload) => {
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

        const effectiveStrikerId =
          optimisticRef.current?.strikerId ??
          current.striker_id;

        const effectiveNonStrikerId =
          optimisticRef.current?.nonStrikerId ??
          current.non_striker_id;

        const effectiveBowlerId =
          optimisticRef.current?.activeBowlerId ??
          current.current_bowler_id;

        if (!effectiveBowlerId) {
          setShowNextBowler(true);
          return;
        }

        if (
          optimisticRef.current
            ?.needsNextBowler
        ) {
          return;
        }

        if (
          !effectiveStrikerId ||
          !effectiveNonStrikerId
        ) {
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

        pendingCountRef.current +=
          1;

        setPendingCount(
          pendingCountRef.current
        );

        /*
         * Save in background.
         * UI has already changed.
         */
        processScoreQueue();
      },
      [
        innings,
        popBoundary,
        processScoreQueue
      ]
    );

  /*
   * =========================================================
   * FAST SWAP STRIKE
   * =========================================================
   */

  const fastSwapStrike =
    useCallback(async () => {
      if (
        actionBusyRef.current
      ) {
        return;
      }

      /*
       * Do not swap while balls are still waiting
       * in the save queue.
       *
       * This protects ball ordering.
       */
      if (
        pendingCountRef.current >
        0
      ) {
        return;
      }

      const currentInnings =
        innings[
          innings.length - 1
        ];

      if (
        !currentInnings?.innings
      ) {
        return;
      }

      const current =
        currentInnings.innings;

      const strikerId =
        optimisticRef.current?.strikerId ??
        current.striker_id;

      const nonStrikerId =
        optimisticRef.current?.nonStrikerId ??
        current.non_striker_id;

      if (
        !strikerId ||
        !nonStrikerId
      ) {
        return;
      }

      /*
       * -----------------------------------------------------
       * INSTANT STATE
       * -----------------------------------------------------
       */

      const previous =
        optimisticRef.current || {};

      const battingCard =
        safeArray(
          currentInnings.battingCard
        );

      const strikerStats =
        previous.strikerStats ||
        battingCard.find(
          (b) =>
            b.player_id ===
            strikerId
        ) || {
          player_id:
            strikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      const nonStrikerStats =
        previous.nonStrikerStats ||
        battingCard.find(
          (b) =>
            b.player_id ===
            nonStrikerId
        ) || {
          player_id:
            nonStrikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      const nextState = {
        ...previous,

        total_runs:
          previous.total_runs ??
          Number(
            current.total_runs || 0
          ),

        total_wickets:
          previous.total_wickets ??
          Number(
            current.total_wickets || 0
          ),

        total_balls:
          previous.total_balls ??
          Number(
            current.total_balls || 0
          ),

        strikerId:
          nonStrikerId,

        nonStrikerId:
          strikerId,

        activeBowlerId:
          previous.activeBowlerId ??
          current.current_bowler_id,

        strikerStats: {
          ...nonStrikerStats,

          player_id:
            nonStrikerId
        },

        nonStrikerStats: {
          ...strikerStats,

          player_id:
            strikerId
        },

        recentBalls:
          previous.recentBalls ||
          safeArray(
            currentInnings.recentBalls
          ),

        extras:
          previous.extras || {
            wide:
              Number(
                current.extras_wide ||
                  0
              ),

            noball:
              Number(
                current.extras_noball ||
                  0
              ),

            bye:
              Number(
                current.extras_bye ||
                  0
              ),

            legbye:
              Number(
                current.extras_legbye ||
                  0
              ),

            penalty:
              Number(
                current.extras_penalty ||
                  0
              )
          },

        partnership:
          previous.partnership ||
          currentInnings.partnership ||
          {
            runs: 0,
            balls: 0
          },

        fallOfWickets:
          previous.fallOfWickets ||
          currentInnings.fallOfWickets ||
          [],

        needsNextBowler:
          previous.needsNextBowler ||
          false
      };

      /*
       * Show immediately.
       */
      optimisticRef.current =
        nextState;

      setOptimistic(
        nextState
      );

      /*
       * New sync version.
       */
      const myVersion =
        ++syncVersionRef.current;

      actionBusyRef.current =
        true;

      setActionBusy(true);
      setError('');

      try {
        /*
         * Backend request.
         */
        await Innings.swapStrike(
          current.id
        );

        /*
         * IMPORTANT:
         * Unlock the button NOW.
         *
         * Do NOT wait for Matches.get().
         */
        actionBusyRef.current =
          false;

        setActionBusy(false);

        /*
         * Background authoritative sync.
         */
        backgroundSync(
          myVersion
        );

      } catch (err) {
        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Unable to swap batsmen'
        );

        /*
         * Unlock immediately.
         */
        actionBusyRef.current =
          false;

        setActionBusy(false);

        /*
         * Force a new authoritative version.
         */
        ++syncVersionRef.current;

        backgroundSync(
          syncVersionRef.current
        );
      }
    }, [
      innings,
      backgroundSync
    ]);

  /*
   * =========================================================
   * FAST UNDO
   * =========================================================
   */

  const fastUndo =
    useCallback(async () => {
      if (
        actionBusyRef.current
      ) {
        return;
      }

      /*
       * Do not undo while balls are still
       * waiting to save.
       */
      if (
        pendingCountRef.current >
        0
      ) {
        return;
      }

      const currentInnings =
        innings[
          innings.length - 1
        ];

      if (
        !currentInnings?.innings
      ) {
        return;
      }

      const current =
        currentInnings.innings;

      const currentRecentBalls =
        optimisticRef.current?.recentBalls ||
        safeArray(
          currentInnings.recentBalls
        );

      if (
        currentRecentBalls.length ===
        0
      ) {
        return;
      }

      const lastBall =
        currentRecentBalls[
          currentRecentBalls.length -
            1
        ];

      const previous =
        optimisticRef.current || {};

      const oldRuns =
        Number(
          previous.total_runs ??
          current.total_runs ??
          0
        );

      const oldWickets =
        Number(
          previous.total_wickets ??
          current.total_wickets ??
          0
        );

      const oldBalls =
        Number(
          previous.total_balls ??
          current.total_balls ??
          0
        );

      const lastTeamRuns =
        calculateBallTeamRuns(
          lastBall
        );

      const legal =
        Number(
          lastBall.is_legal
        ) === 1 ||
        lastBall.is_legal === true;

      const newRuns =
        Math.max(
          0,
          oldRuns -
            lastTeamRuns
        );

      const newWickets =
        Math.max(
          0,
          oldWickets -
            (
              lastBall.is_wicket
                ? 1
                : 0
            )
        );

      const newBalls =
        Math.max(
          0,
          oldBalls -
            (
              legal ? 1 : 0
            )
        );

      /*
       * -----------------------------------------------------
       * BATSMAN
       * -----------------------------------------------------
       */

      const battingCard =
        safeArray(
          currentInnings.battingCard
        );

      const strikerId =
        lastBall.batsman_id;

      const nonStrikerId =
        lastBall.non_striker_id;

      const currentStriker =
        previous.strikerStats ||
        battingCard.find(
          (b) =>
            b.player_id ===
            strikerId
        ) || {
          player_id:
            strikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      const currentNonStriker =
        previous.nonStrikerStats ||
        battingCard.find(
          (b) =>
            b.player_id ===
            nonStrikerId
        ) || {
          player_id:
            nonStrikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      const batsmanRuns =
        Number(
          lastBall.runs_batsman ||
            0
        );

      const isBatterBall =
        !lastBall.extra_type ||
        lastBall.extra_type ===
          'noball';

      const oldStrikerRuns =
        Math.max(
          0,
          Number(
            currentStriker.runs ||
              0
          ) -
            (
              isBatterBall
                ? batsmanRuns
                : 0
            )
        );

      const oldStrikerBalls =
        Math.max(
          0,
          Number(
            currentStriker.balls ||
              0
          ) -
            (
              isBatterBall &&
              lastBall.extra_type !==
                'noball'
                ? 1
                : 0
            )
        );

      const oldStrikerFours =
        Math.max(
          0,
          Number(
            currentStriker.fours ||
              0
          ) -
            (
              isBatterBall &&
              batsmanRuns === 4
                ? 1
                : 0
            )
        );

      const oldStrikerSixes =
        Math.max(
          0,
          Number(
            currentStriker.sixes ||
              0
          ) -
            (
              isBatterBall &&
              batsmanRuns === 6
                ? 1
                : 0
            )
        );

      const oldStrikerSR =
        oldStrikerBalls > 0
          ? Number(
              (
                (
                  oldStrikerRuns /
                  oldStrikerBalls
                ) * 100
              ).toFixed(2)
            )
          : 0;

      const restoredStrikerStats =
        {
          ...currentStriker,

          player_id:
            strikerId,

          runs:
            oldStrikerRuns,

          balls:
            oldStrikerBalls,

          fours:
            oldStrikerFours,

          sixes:
            oldStrikerSixes,

          strike_rate:
            oldStrikerSR,

          is_out:
            lastBall.is_wicket
              ? false
              : currentStriker.is_out,

          how_out:
            lastBall.is_wicket
              ? null
              : currentStriker.how_out,

          dismissed_by:
            lastBall.is_wicket
              ? null
              : currentStriker.dismissed_by,

          fielder_id:
            lastBall.is_wicket
              ? null
              : currentStriker.fielder_id
        };

      /*
       * -----------------------------------------------------
       * RESTORE STRIKE
       * -----------------------------------------------------
       *
       * The last ball stores the batsman and non-striker
       * BEFORE the ball.
       *
       * Therefore those IDs are the correct positions
       * after undo.
       */

      const restoredStrikerId =
        strikerId;

      const restoredNonStrikerId =
        nonStrikerId;

      const restoredStriker =
        restoredStrikerStats;

      const restoredNonStriker = {
        ...currentNonStriker,

        player_id:
          nonStrikerId
      };

      /*
       * -----------------------------------------------------
       * BOWLER
       * -----------------------------------------------------
       */

      const bowlerId =
        lastBall.bowler_id ||
        previous.activeBowlerId ||
        current.current_bowler_id;

      const bowlingCard =
        safeArray(
          currentInnings.bowlingCard
        );

      const currentBowlerStats =
        previous.bowlerStats ||
        bowlingCard.find(
          (b) =>
            b.player_id ===
            bowlerId
        ) || {
          player_id:
            bowlerId,
          overs: '0.0',
          maidens: 0,
          runs: 0,
          wickets: 0,
          economy: 0
        };

      const bowlerRuns =
        calculateBallBowlerRuns(
          lastBall
        );

      const oldBowlerBalls =
        getBowlerBalls(
          currentBowlerStats
        );

      const restoredBowlerBalls =
        Math.max(
          0,
          oldBowlerBalls -
            (
              legal ? 1 : 0
            )
        );

      const restoredBowlerRuns =
        Math.max(
          0,
          Number(
            currentBowlerStats.runs ||
              0
          ) -
            bowlerRuns
        );

      const restoredBowlerWickets =
        Math.max(
          0,
          Number(
            currentBowlerStats.wickets ||
              0
          ) -
            (
              lastBall.is_wicket &&
              lastBall.wicket_type !==
                'run-out'
                ? 1
                : 0
            )
        );

      const restoredBowlerOvers =
        `${Math.floor(
          restoredBowlerBalls / 6
        )}.${restoredBowlerBalls % 6}`;

      const restoredEconomy =
        restoredBowlerBalls > 0
          ? Number(
              (
                restoredBowlerRuns /
                (
                  restoredBowlerBalls /
                  6
                )
              ).toFixed(2)
            )
          : 0;

      const restoredBowlerStats =
        {
          ...currentBowlerStats,

          player_id:
            bowlerId,

          overs:
            restoredBowlerOvers,

          runs:
            restoredBowlerRuns,

          wickets:
            restoredBowlerWickets,

          economy:
            restoredEconomy
        };

      /*
       * -----------------------------------------------------
       * REMOVE LAST BALL
       * -----------------------------------------------------
       */

      const restoredRecentBalls =
        currentRecentBalls.slice(
          0,
          -1
        );

      /*
       * -----------------------------------------------------
       * FALL OF WICKETS
       * -----------------------------------------------------
       */

      const currentFOW =
        previous.fallOfWickets ||
        currentInnings.fallOfWickets ||
        [];

      const restoredFOW =
        lastBall.is_wicket
          ? currentFOW.slice(
              0,
              -1
            )
          : currentFOW;

      /*
       * -----------------------------------------------------
       * PARTNERSHIP
       * -----------------------------------------------------
       */

      const currentPartnership =
        previous.partnership ||
        currentInnings.partnership ||
        {
          runs: 0,
          balls: 0
        };

      /*
       * If wicket was undone, the exact previous partnership
       * may not be available in the last-24-ball cache.
       *
       * The authoritative background sync will correct it.
       */
      const restoredPartnership =
        lastBall.is_wicket
          ? {
              runs: 0,
              balls: 0
            }
          : {
              runs:
                Math.max(
                  0,
                  Number(
                    currentPartnership.runs ||
                      0
                  ) -
                    lastTeamRuns
                ),

              balls:
                Math.max(
                  0,
                  Number(
                    currentPartnership.balls ||
                      0
                  ) -
                    (
                      legal ||
                      lastBall.extra_type ===
                        'noball'
                        ? 1
                        : 0
                    )
                )
            };

      /*
       * -----------------------------------------------------
       * EXTRAS
       * -----------------------------------------------------
       */

      const currentExtras =
        previous.extras || {
          wide:
            Number(
              current.extras_wide ||
                0
            ),

          noball:
            Number(
              current.extras_noball ||
                0
            ),

          bye:
            Number(
              current.extras_bye ||
                0
            ),

          legbye:
            Number(
              current.extras_legbye ||
                0
            ),

          penalty:
            Number(
              current.extras_penalty ||
                0
            )
        };

      const restoredExtras = {
        ...currentExtras
      };

      if (
        lastBall.extra_type
      ) {
        restoredExtras[
          lastBall.extra_type
        ] =
          Math.max(
            0,
            Number(
              restoredExtras[
                lastBall.extra_type
              ] || 0
            ) -
              Number(
                lastBall.extra_runs ||
                  0
              )
          );
      }

      /*
       * -----------------------------------------------------
       * RESTORED STATE
       * -----------------------------------------------------
       */

      const restoredState = {
        ...previous,

        total_runs:
          newRuns,

        total_wickets:
          newWickets,

        total_balls:
          newBalls,

        strikerId:
          restoredStrikerId,

        nonStrikerId:
          restoredNonStrikerId,

        activeBowlerId:
          bowlerId,

        needsNextBowler:
          false,

        bowlerStats:
          restoredBowlerStats,

        bowlerBalls:
          restoredBowlerBalls,

        strikerStats:
          restoredStriker,

        nonStrikerStats:
          restoredNonStriker,

        recentBalls:
          restoredRecentBalls,

        extras:
          restoredExtras,

        partnership:
          restoredPartnership,

        fallOfWickets:
          restoredFOW,

        runRate:
          newBalls > 0
            ? Number(
                (
                  newRuns /
                  (
                    newBalls /
                    6
                  )
                ).toFixed(2)
              )
            : 0
      };

      /*
       * -----------------------------------------------------
       * INSTANT UI UPDATE
       * -----------------------------------------------------
       */

      optimisticRef.current =
        restoredState;

      setOptimistic(
        restoredState
      );

      /*
       * New sync version.
       */
      const myVersion =
        ++syncVersionRef.current;

      actionBusyRef.current =
        true;

      setActionBusy(true);
      setError('');

      try {
        /*
         * Backend undo.
         */
        await Innings.undo(
          current.id
        );

        /*
         * Unlock immediately.
         */
        actionBusyRef.current =
          false;

        setActionBusy(false);

        /*
         * Background authoritative sync.
         */
        backgroundSync(
          myVersion
        );

      } catch (err) {
        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Unable to undo'
        );

        actionBusyRef.current =
          false;

        setActionBusy(false);

        ++syncVersionRef.current;

        /*
         * Restore server state.
         */
        backgroundSync(
          syncVersionRef.current
        );
      }
    }, [
      innings,
      backgroundSync
    ]);

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * MATCH COMPLETED
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * INNINGS BREAK
   * ---------------------------------------------------------
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

    const firstInningsRuns =
      Number(
        currentInnings.innings
          .total_runs || 0
      );

    /*
     * Backend target is preferred.
     *
     * If backend hasn't populated target,
     * calculate it immediately.
     */
    const target =
      currentInnings.innings
        .target != null
        ? Number(
            currentInnings.innings
              .target
          )
        : firstInningsRuns + 1;

    return (
      <div className="max-w-lg mx-auto card text-center space-y-5 fade-in">

        <div>

          <div className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
            1st Innings Complete
          </div>

          <h1 className="text-3xl font-extrabold mt-2">
            Innings Break
          </h1>

        </div>

        <div className="bg-slate-900/80 rounded-2xl border border-slate-700 p-5">

          <div className="text-sm text-slate-400">
            {currentInnings.batting_team?.name ||
              match.team1_short}
          </div>

          <div className="text-4xl font-extrabold mt-1">
            {firstInningsRuns}
            /
            {
              currentInnings
                .innings
                .total_wickets
            }
          </div>

          <div className="text-sm text-slate-500 mt-1">
            {currentInnings.overs} overs
          </div>

        </div>

        {/* TARGET */}

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">

          <div className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
            Target Score
          </div>

          <div className="text-5xl font-black text-white mt-1">
            {target}
          </div>

          <div className="text-sm text-slate-400 mt-2">
            2nd innings needs {target}{' '}
            runs to win
          </div>

        </div>

        <button
          className="btn btn-primary w-full h-12 text-base font-bold"
          disabled={actionBusy}
          onClick={async () => {
            if (
              actionBusyRef.current
            ) {
              return;
            }

            actionBusyRef.current =
              true;

            setActionBusy(true);
            setError('');

            try {
              /*
               * Start second innings.
               */
              await Matches.startSecondInnings(
                matchId
              );

              /*
               * One authoritative refresh.
               */
              const data =
                await Matches.get(
                  matchId
                );

              setMatch(
                data.match
              );

              setPlayers(
                safeArray(
                  data.players
                )
              );

              setInnings(
                safeArray(
                  data.innings
                )
              );

              optimisticRef.current =
                null;

              setOptimistic(
                null
              );

              ++syncVersionRef.current;

            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.message ||
                'Unable to start second innings'
              );
            } finally {
              actionBusyRef.current =
                false;

              setActionBusy(false);
            }
          }}
        >
          {actionBusy
            ? 'Starting 2nd Innings…'
            : 'Continue to 2nd Innings →'}
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
    currentInnings.innings;

  /*
   * ---------------------------------------------------------
   * DISPLAY SCORE
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * ACTIVE PLAYERS
   * ---------------------------------------------------------
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

  const outIds =
    new Set(
      safeArray(
        currentInnings.battingCard
      )
        .filter(
          (b) => b.is_out
        )
        .map(
          (b) =>
            b.player_id
        )
    );

  if (
    optimistic?.strikerStats
      ?.is_out &&
    optimistic.strikerStats
      .player_id
  ) {
    outIds.add(
      optimistic.strikerStats
        .player_id
    );
  }

  if (
    optimistic?.nonStrikerStats
      ?.is_out &&
    optimistic.nonStrikerStats
      .player_id
  ) {
    outIds.add(
      optimistic
        .nonStrikerStats
        .player_id
    );
  }

  const striker =
    players.find(
      (p) =>
        p.id ===
        effectiveStrikerId
    );

  const nonStriker =
    players.find(
      (p) =>
        p.id ===
        effectiveNonStrikerId
    );

  const bowler =
    players.find(
      (p) =>
        p.id ===
        effectiveBowlerId
    );

  /*
   * ---------------------------------------------------------
   * NEED BATSMEN
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * BATSMAN STATS
   * ---------------------------------------------------------
   */

  const serverStrikerStats =
    safeArray(
      currentInnings.battingCard
    ).find(
      (b) =>
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
    safeArray(
      currentInnings.battingCard
    ).find(
      (b) =>
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

  const strikerStats =
    optimistic &&
    optimistic.strikerStats &&
    optimistic.strikerStats
      .player_id ===
      effectiveStrikerId
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic &&
    optimistic.nonStrikerStats &&
    optimistic.nonStrikerStats
      .player_id ===
      effectiveNonStrikerId
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  /*
   * ---------------------------------------------------------
   * BOWLER STATS
   * ---------------------------------------------------------
   */

  const serverBowlerStats =
    safeArray(
      currentInnings.bowlingCard
    ).find(
      (b) =>
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
    optimistic.bowlerStats
      .player_id ===
      effectiveBowlerId
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

  /*
   * ---------------------------------------------------------
   * RECENT BALLS
   * ---------------------------------------------------------
   */

  const recentBalls =
    optimistic?.recentBalls ||
    safeArray(
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
          (ball) =>
            Number(
              ball.over_number
            ) ===
            displayOverNumber
        );

  /*
   * ---------------------------------------------------------
   * BOWLER LOGIC
   * ---------------------------------------------------------
   */

  const needsNextBowler =
    optimistic?.needsNextBowler ||
    !effectiveBowlerId;

  /*
   * ---------------------------------------------------------
   * PARTNERSHIP
   * ---------------------------------------------------------
   */

  const partnership =
    optimistic?.partnership ||
    currentInnings.partnership ||
    {
      runs: 0,
      balls: 0
    };

  /*
   * ---------------------------------------------------------
   * FALL OF WICKETS
   * ---------------------------------------------------------
   */

  const fallOfWickets =
    optimistic?.fallOfWickets ||
    currentInnings.fallOfWickets ||
    [];

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
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

            {actionBusy && (
              <div className="text-yellow-400 text-xs mt-1">
                Saving action…
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
                  🎯 {bowler?.name ||
                    'Select bowler'}
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {needsNextBowler
                    ? 'BOWLER REQUIRED'
                    : 'CURRENT BOWLER'}
                </div>

              </div>

              {!needsNextBowler && (
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

          {currentOverBalls.length ===
          0 ? (

            <div className="text-xs text-slate-500">
              No balls yet
            </div>

          ) : (

            <div className="flex flex-wrap gap-2">

              {currentOverBalls.map(
                (
                  ball,
                  index
                ) => (
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
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* SCORING CONTROLS */}

      {!needsNextBowler && (
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
                (r) => (
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
                        extra_type:
                          null
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
                className="h-10 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 font-semibold text-sm active:scale-95 transition-transform disabled:opacity-50"
                onClick={
                  fastSwapStrike
                }
                disabled={
                  pendingCount > 0 ||
                  actionBusy
                }
              >
                {actionBusy
                  ? 'Saving…'
                  : '⇄ Swap'}
              </button>

              <button
                className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm active:scale-95 transition-transform disabled:opacity-50"
                onClick={() =>
                  setShowWicket(
                    true
                  )
                }
                disabled={
                  pendingCount > 0 ||
                  actionBusy
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
                    (r) => (
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

          {/* ACTIONS */}

          <div className="grid grid-cols-2 gap-2">

            <button
              className="btn btn-secondary disabled:opacity-50"
              disabled={
                pendingCount > 0 ||
                actionBusy ||
                recentBalls.length ===
                  0
              }
              onClick={
                fastUndo
              }
            >
              {actionBusy
                ? 'Saving…'
                : '↺ Undo'}
            </button>

            <button
              className="btn btn-secondary disabled:opacity-50"
              disabled={
                pendingCount > 0 ||
                actionBusy
              }
              onClick={
                fastSwapStrike
              }
            >
              ⇄ Swap Batsmen
            </button>

          </div>

        </>
      )}

      {/* CURRENT PARTNERSHIP */}

      <div className="mt-2 bg-slate-900/70 rounded-xl p-2 border border-slate-700">

        <div className="flex justify-between items-center">

          <div>

            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Current Partnership
            </div>

            <div className="text-base font-bold text-white mt-1">

              {partnership.runs ||
                0}

              <span className="text-xs text-slate-400 font-normal">
                {' '}
                runs
              </span>

              {' · '}

              {partnership.balls ||
                0}

              <span className="text-xs text-slate-400 font-normal">
                {' '}
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
          fallOfWickets
        }
        players={players}
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

      {/* NEXT BOWLER */}

      {(
        showNextBowler ||
        !effectiveBowlerId
      ) &&
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
            initialBowler={
              bowler
            }
            isInitial={
              !effectiveBowlerId &&
              displayTotalBalls ===
                0
            }
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

                const previous =
                  optimisticRef.current ||
                  {};

                const nextState = {
                  ...previous,

                  activeBowlerId:
                    bowlerId,

                  needsNextBowler:
                    false,

                  bowlerBalls:
                    previous.needsNextBowler
                      ? 0
                      : (
                          previous.bowlerBalls ??
                          0
                        ),

                  bowlerStats:
                    previous.needsNextBowler
                      ? {
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
                      : (
                          previous.bowlerStats ||
                          {
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
                        )
                };

                optimisticRef.current =
                  nextState;

                setOptimistic(
                  nextState
                );

                setShowNextBowler(
                  false
                );

                /*
                 * Don't make the scorer wait
                 * for the full match refresh.
                 */
                const version =
                  ++syncVersionRef.current;

                backgroundSync(
                  version
                );

              } catch (err) {
                setError(
                  err?.response?.data?.error ||
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
          nonStriker={
            nonStriker
          }
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
 * ============================================================
 * HELPERS FOR FAST UNDO
 * ============================================================
 */

function calculateBallTeamRuns(
  ball
) {
  if (!ball) {
    return 0;
  }

  const batsmanRuns =
    Number(
      ball.runs_batsman || 0
    );

  const extraRuns =
    Number(
      ball.extra_runs || 0
    );

  switch (
    ball.extra_type
  ) {
    case 'wide':
      return Math.max(
        1,
        extraRuns || 1
      );

    case 'noball':
      return (
        Math.max(
          1,
          extraRuns || 1
        ) +
        batsmanRuns
      );

    case 'bye':
    case 'legbye':
    case 'penalty':
      return extraRuns;

    default:
      return batsmanRuns;
  }
}

function calculateBallRunsForStrike(
  ball
) {
  if (!ball) {
    return 0;
  }

  if (
    ball.extra_type ===
    'wide'
  ) {
    return Math.max(
      0,
      Number(
        ball.extra_runs || 0
      ) - 1
    );
  }

  if (
    ball.extra_type ===
    'noball'
  ) {
    return Number(
      ball.runs_batsman || 0
    );
  }

  if (
    ball.extra_type ===
      'bye' ||
    ball.extra_type ===
      'legbye' ||
    ball.extra_type ===
      'penalty'
  ) {
    return 0;
  }

  return Number(
    ball.runs_batsman || 0
  );
}

function calculateBallBowlerRuns(
  ball
) {
  if (!ball) {
    return 0;
  }

  const batsmanRuns =
    Number(
      ball.runs_batsman || 0
    );

  const extraRuns =
    Number(
      ball.extra_runs || 0
    );

  switch (
    ball.extra_type
  ) {
    case 'wide':
      return Math.max(
        1,
        extraRuns || 1
      );

    case 'noball':
      return (
        Math.max(
          1,
          extraRuns || 1
        ) +
        batsmanRuns
      );

    case 'bye':
    case 'legbye':
    case 'penalty':
      return 0;

    default:
      return batsmanRuns;
  }
}

function getBowlerBalls(
  stats
) {
  if (!stats) {
    return 0;
  }

  const oversText =
    String(
      stats.overs || '0.0'
    );

  const [
    overs,
    balls
  ] =
    oversText.split('.');

  return (
    (Number(overs) || 0) *
      6 +
    (Number(balls) || 0)
  );
}


/*
 * ============================================================
 * BATSMAN CARD
 * ============================================================
 */

function BatsmanCard({
  player,
  stats,
  striker = false
}) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">

      <div className="flex justify-between items-center">

        <div className="font-semibold text-white">

          🏏 {player?.name || '—'}

          {striker && (
            <span className="text-emerald-400 ml-1">
              ●
            </span>
          )}

        </div>

        <div className="text-xs text-slate-400">
          {striker
            ? 'STRIKER'
            : 'NON-STRIKER'}
        </div>

      </div>

      <div className="mt-1 flex items-center gap-2 flex-wrap">

        <Stat
          value={
            stats?.runs ?? 0
          }
          label="Runs"
          large
        />

        <Stat
          value={
            stats?.balls ?? 0
          }
          label="Balls"
        />

        <Stat
          value={
            stats?.fours ?? 0
          }
          label="4s"
        />

        <Stat
          value={
            stats?.sixes ?? 0
          }
          label="6s"
        />

        <Stat
          value={
            stats?.strike_rate ?? 0
          }
          label="SR"
        />

      </div>

    </div>
  );
}


/*
 * ============================================================
 * NEXT BOWLER MODAL
 * ============================================================
 */

function NextBowlerModal({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error,
  isInitial = false
}) {
  const [
    bowler,
    setBowler
  ] = useState(null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative w-full max-w-md">

        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden">

          <div className="p-5 border-b border-slate-700">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">

                  {isInitial
                    ? 'Match Start'
                    : 'Over Complete'}

                </div>

                <h2 className="text-2xl font-extrabold text-white mt-1">

                  🎯 {isInitial
                    ? 'Select Bowler'
                    : 'Select Next Bowler'}

                </h2>

                <p className="text-sm text-slate-400 mt-1">

                  {isInitial
                    ? 'Choose the bowler for the first over'
                    : 'Choose the bowler for the new over'}

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
                {isInitial
                  ? 'Opening Bowler'
                  : 'Next Bowler'}
              </div>

              <PlayerAutocomplete
                players={team}
                value={bowler}
                onChange={
                  setBowler
                }
                teamId={
                  teamId
                }
                onCreated={
                  onPlayerCreated
                }
                placeholder={
                  isInitial
                    ? 'Type or select opening bowler…'
                    : 'Type or select bowler…'
                }
              />

            </div>

            {error && (
              <div className="mb-4 bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <button
              className="btn btn-primary w-full h-12 text-base font-bold"
              disabled={!bowler}
              onClick={() =>
                onSelect(
                  bowler
                )
              }
            >
              {isInitial
                ? 'Start Innings →'
                : 'Start New Over →'}
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
 * ============================================================
 * FALL OF WICKETS
 * ============================================================
 */

function FallOfWickets({
  wickets,
  players
}) {
  if (
    !wickets ||
    wickets.length ===
      0
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

        {wickets.map(
          (
            item,
            index
          ) => {
            const player =
              players.find(
                (p) =>
                  p.id ===
                  item.player_id
              );

            return (
              <div
                key={
                  item.id ||
                  `${item.wicket_number}-${item.player_id}-${index}`
                }
                className="flex items-center justify-between bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700"
              >

                <div className="flex items-center gap-3 min-w-0">

                  <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 text-red-300 flex items-center justify-center text-xs font-bold">
                    {
                      item.wicket_number
                    }
                  </div>

                  <div className="min-w-0">

                    <div className="text-sm font-semibold text-white truncate">
                      {player?.name ||
                        'Batsman'}
                    </div>

                    <div className="text-[11px] text-slate-500">

                      {item.wicket_type ||
                        'Wicket'}

                      {item.overs !=
                      null
                        ? ` · ${item.overs} ov`
                        : ''}

                    </div>

                  </div>

                </div>

                <div className="text-right ml-3">

                  <div className="text-base font-extrabold text-white">
                    {item.score}
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
 * ============================================================
 * STAT
 * ============================================================
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
 * ============================================================
 * BOWLING STAT
 * ============================================================
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
 * ============================================================
 * BALL DISPLAY
 * ============================================================
 */

function BallDisplay({
  ball
}) {
  let label =
    String(
      ball.runs_batsman ??
        0
    );

  let className =
    'bg-slate-700';

  if (
    ball.is_wicket
  ) {
    label = 'W';

    className =
      'bg-red-600';

  } else if (
    ball.extra_type ===
    'wide'
  ) {
    label =
      `Wd${
        Number(
          ball.extra_runs || 1
        ) > 1
          ? `+${Number(
              ball.extra_runs
            ) - 1}`
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
    Number(
      ball.runs_batsman
    ) === 4
  ) {
    label = '4';

    className =
      'bg-emerald-600';

  } else if (
    Number(
      ball.runs_batsman
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
        {ball.is_legal
          ? 'legal'
          : 'extra'}
      </span>

    </div>
  );
}


/*
 * ============================================================
 * BATSMEN SELECTION
 * ============================================================
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

  const available =
    safeArray(team).filter(
      (player) =>
        !outIds.has(
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
            value={striker}
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
                ? [
                    nonStrikerId
                  ]
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
                ? [
                    strikerId
                  ]
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
