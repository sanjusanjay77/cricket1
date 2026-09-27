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
   * ====================================================
   * UNDO PRESERVATION
   * ====================================================
   *
   * These refs remember the state immediately BEFORE
   * Undo.
   *
   * This is important because the backend may return
   * current_bowler_id = null after Undo.
   *
   * We must NOT lose:
   *   - current bowler
   *   - striker
   *   - non-striker
   *
   * This applies to EVERY Undo, not only ball 1.
   */

  const undoPreservedRef = useRef({
    active: false,
    bowlerId: null,
    strikerId: null,
    nonStrikerId: null
  });

  /*
   * ----------------------------------------------------
   * SAFE HELPERS
   * ----------------------------------------------------
   */

  const safeArray = useCallback((value) => {
    return Array.isArray(value) ? value : [];
  }, []);

  const getPlayerId = useCallback((player) => {
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
  }, []);

  /*
   * ====================================================
   * APPLY SERVER DATA
   * ====================================================
   */

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

    let nextInnings =
      Array.isArray(data.innings)
        ? data.innings
        : [];

    /*
     * ----------------------------------------------------
     * PRESERVE UNDO STATE
     * ----------------------------------------------------
     *
     * If this server response arrives immediately after
     * Undo and the backend has returned null bowler/batsmen,
     * restore the selections that existed before Undo.
     */

    const preserved =
      undoPreservedRef.current;

    if (
      preserved?.active &&
      nextInnings.length > 0
    ) {
      const lastIndex =
        nextInnings.length - 1;

      const lastEntry =
        nextInnings[lastIndex];

      if (lastEntry?.innings) {
        const oldInn =
          lastEntry.innings;

        const patchedInn = {
          ...oldInn
        };

        if (
          preserved.bowlerId &&
          !patchedInn.current_bowler_id
        ) {
          patchedInn.current_bowler_id =
            preserved.bowlerId;
        }

        if (
          preserved.strikerId &&
          !patchedInn.striker_id
        ) {
          patchedInn.striker_id =
            preserved.strikerId;
        }

        if (
          preserved.nonStrikerId &&
          !patchedInn.non_striker_id
        ) {
          patchedInn.non_striker_id =
            preserved.nonStrikerId;
        }

        nextInnings = [
          ...nextInnings
        ];

        nextInnings[lastIndex] = {
          ...lastEntry,
          innings: patchedInn
        };
      }
    }

    setInnings(nextInnings);

    optimisticRef.current = null;
    setOptimistic(null);
  }, []);

  /*
   * ====================================================
   * FULL MATCH LOAD
   * ====================================================
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

      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load match'
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
   * ====================================================
   * PLAYER CREATED
   * ====================================================
   */

  const handlePlayerCreated =
    useCallback((player) => {
      if (
        !player ||
        typeof player !== 'object'
      ) {
        return;
      }

      setPlayers(prev => {
        const safePrev =
          Array.isArray(prev)
            ? prev
            : [];

        const exists =
          safePrev.some(
            p =>
              p?.id ===
              player.id
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
   * ====================================================
   * SOCKET.IO
   * ====================================================
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
      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      let finalInnings =
        Array.isArray(updatedInnings)
          ? updatedInnings
          : [];

      /*
       * --------------------------------------------------
       * PRESERVE STATE AFTER UNDO
       * --------------------------------------------------
       */

      const preserved =
        undoPreservedRef.current;

      if (
        preserved?.active &&
        finalInnings.length > 0
      ) {
        const lastIndex =
          finalInnings.length - 1;

        const lastEntry =
          finalInnings[lastIndex];

        const lastInn =
          lastEntry?.innings;

        if (
          lastInn &&
          typeof lastInn === 'object'
        ) {
          const patchedInn = {
            ...lastInn
          };

          if (
            preserved.bowlerId &&
            !patchedInn.current_bowler_id
          ) {
            patchedInn.current_bowler_id =
              preserved.bowlerId;
          }

          if (
            preserved.strikerId &&
            !patchedInn.striker_id
          ) {
            patchedInn.striker_id =
              preserved.strikerId;
          }

          if (
            preserved.nonStrikerId &&
            !patchedInn.non_striker_id
          ) {
            patchedInn.non_striker_id =
              preserved.nonStrikerId;
          }

          finalInnings = [
            ...finalInnings
          ];

          finalInnings[lastIndex] = {
            ...lastEntry,
            innings: patchedInn
          };
        }
      }

      if (
        updatedMatch &&
        typeof updatedMatch === 'object'
      ) {
        setMatch(updatedMatch);
      }

      setInnings(finalInnings);

      /*
       * --------------------------------------------------
       * DO NOT IMMEDIATELY CLEAR UNDO PRESERVATION
       * IF SERVER STILL DID NOT RETURN THE BOWLER.
       *
       * Once the returned state contains the preserved
       * selections, we can finish the preservation cycle.
       * --------------------------------------------------
       */

      if (
        preserved?.active &&
        finalInnings.length > 0
      ) {
        const lastInn =
          finalInnings[
            finalInnings.length - 1
          ]?.innings;

        const bowlerOkay =
          !preserved.bowlerId ||
          lastInn?.current_bowler_id ===
            preserved.bowlerId;

        const strikerOkay =
          !preserved.strikerId ||
          lastInn?.striker_id ===
            preserved.strikerId;

        const nonStrikerOkay =
          !preserved.nonStrikerId ||
          lastInn?.non_striker_id ===
            preserved.nonStrikerId;

        if (
          bowlerOkay &&
          strikerOkay &&
          nonStrikerOkay
        ) {
          undoPreservedRef.current = {
            active: false,
            bowlerId: null,
            strikerId: null,
            nonStrikerId: null
          };
        }
      }

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
   * ====================================================
   * CLEANUP
   * ====================================================
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
   * ====================================================
   * VISUAL EFFECTS
   * ====================================================
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
   * ====================================================
   * NEXT BOWLER EFFECT
   * ====================================================
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
   * ====================================================
   * GENERIC ACTION
   * ====================================================
   */

  const act = async (fn) => {
    setError('');

    try {
      await fn();
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
   * ====================================================
   * BUILD OPTIMISTIC BALL
   * ====================================================
   */

  const buildOptimisticBall =
    useCallback(({
      current,
      currentInnings,
      payload,
      previousOptimistic
    }) => {
      const strikerId =
        previousOptimistic?.strikerId ??
        current.striker_id;

      const nonStrikerId =
        previousOptimistic?.nonStrikerId ??
        current.non_striker_id;

      const scoringBowlerId =
        previousOptimistic?.activeBowlerId ??
        current.current_bowler_id;

      const currentTotalRuns =
        Number(
          previousOptimistic?.total_runs ??
          current.total_runs ??
          0
        );

      const currentTotalWickets =
        Number(
          previousOptimistic?.total_wickets ??
          current.total_wickets ??
          0
        );

      const currentTotalBalls =
        Number(
          previousOptimistic?.total_balls ??
          current.total_balls ??
          0
        );

      const runs =
        Number(
          payload?.runs || 0
        );

      const extraRuns =
        Number(
          payload?.extra_runs || 0
        );

      const extraType =
        payload?.extra_type || null;

      const isWicket =
        !!payload?.is_wicket;

      const legal =
        extraType === 'wide' ||
        extraType === 'noball'
          ? false
          : true;

      const teamRuns =
        extraType === 'wide' ||
        extraType === 'noball'
          ? extraRuns + (
              extraType === 'noball'
                ? runs
                : 0
            )
          : extraType === 'bye' ||
            extraType === 'legbye'
            ? extraRuns
            : runs;

      const newTotalRuns =
        currentTotalRuns +
        teamRuns;

      const newTotalWickets =
        currentTotalWickets +
        (isWicket ? 1 : 0);

      const newTotalBalls =
        currentTotalBalls +
        (legal ? 1 : 0);

      /*
       * --------------------------------------------------
       * PREVIOUS BATSMAN STATS
       * --------------------------------------------------
       */

      const previousStrikerStats =
        previousOptimistic?.strikerStats ||
        currentInnings?.battingCard?.find(
          b =>
            b?.player_id ===
            strikerId
        ) || {
          player_id: strikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      const previousNonStrikerStats =
        previousOptimistic?.nonStrikerStats ||
        currentInnings?.battingCard?.find(
          b =>
            b?.player_id ===
            nonStrikerId
        ) || {
          player_id: nonStrikerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        };

      /*
       * --------------------------------------------------
       * BATSMAN RUNS
       * --------------------------------------------------
       */

      let strikerRuns =
        Number(
          previousStrikerStats.runs || 0
        );

      let strikerBalls =
        Number(
          previousStrikerStats.balls || 0
        );

      let strikerFours =
        Number(
          previousStrikerStats.fours || 0
        );

      let strikerSixes =
        Number(
          previousStrikerStats.sixes || 0
        );

      if (
        extraType !== 'wide' &&
        extraType !== 'bye' &&
        extraType !== 'legbye'
      ) {
        strikerRuns += runs;

        if (legal) {
          strikerBalls += 1;
        }

        if (runs === 4) {
          strikerFours += 1;
        }

        if (runs === 6) {
          strikerSixes += 1;
        }
      } else if (legal) {
        strikerBalls += 1;
      }

      const strikerSR =
        strikerBalls > 0
          ? (
              strikerRuns /
              strikerBalls *
              100
            ).toFixed(2)
          : '0.00';

      const updatedStrikerStats = {
        ...previousStrikerStats,
        player_id: strikerId,
        runs: strikerRuns,
        balls: strikerBalls,
        fours: strikerFours,
        sixes: strikerSixes,
        strike_rate: Number(strikerSR)
      };

      /*
       * --------------------------------------------------
       * NON STRIKER STAYS SAME
       * --------------------------------------------------
       */

      const updatedNonStrikerStats = {
        ...previousNonStrikerStats,
        player_id: nonStrikerId
      };

      /*
       * --------------------------------------------------
       * BOWLER
       * --------------------------------------------------
       */

      const previousBowlerStats =
        previousOptimistic?.bowlerStats ||
        currentInnings?.bowlingCard?.find(
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

      const previousBowlerBalls =
        Number(
          previousOptimistic?.bowlerBalls ??
          currentInnings?.bowler_balls ??
          0
        );

      const newBowlerBalls =
        previousBowlerBalls +
        (legal ? 1 : 0);

      const bowlerRuns =
        Number(
          previousBowlerStats.runs || 0
        ) +
        (
          extraType === 'bye' ||
          extraType === 'legbye'
            ? 0
            : teamRuns
        );

      const bowlerWickets =
        Number(
          previousBowlerStats.wickets || 0
        ) +
        (
          isWicket &&
          payload?.wicket_type !==
            'run-out'
            ? 1
            : 0
        );

      const completedOvers =
        Math.floor(
          newBowlerBalls / 6
        );

      const ballsInOver =
        newBowlerBalls % 6;

      const economy =
        newBowlerBalls > 0
          ? (
              bowlerRuns /
              (newBowlerBalls / 6)
            ).toFixed(2)
          : '0.00';

      const updatedBowlerStats = {
        ...previousBowlerStats,
        player_id: scoringBowlerId,
        overs:
          `${completedOvers}.${ballsInOver}`,
        runs:
          bowlerRuns,
        wickets:
          bowlerWickets,
        economy:
          Number(economy)
      };

      /*
       * --------------------------------------------------
       * STRIKE CHANGE
       * --------------------------------------------------
       */

      let nextStrikerId =
        strikerId;

      let nextNonStrikerId =
        nonStrikerId;

      /*
       * Odd runs change strike.
       */

      if (
        legal &&
        teamRuns % 2 === 1
      ) {
        const temp =
          nextStrikerId;

        nextStrikerId =
          nextNonStrikerId;

        nextNonStrikerId =
          temp;
      }

      /*
       * End of over changes strike again.
       */

      const overCompleted =
        legal &&
        newTotalBalls > 0 &&
        newTotalBalls % 6 === 0;

      let needsNextBowler =
        false;

      if (overCompleted) {
        const temp =
          nextStrikerId;

        nextStrikerId =
          nextNonStrikerId;

        nextNonStrikerId =
          temp;

        needsNextBowler =
          true;
      }

      /*
       * --------------------------------------------------
       * RECENT BALLS
       * --------------------------------------------------
       */

      const oldRecentBalls =
        safeArray(
          previousOptimistic?.recentBalls ||
          currentInnings?.recentBalls
        );

      const ballObject = {
        ...payload,

        runs_batsman:
          extraType === 'noball'
            ? runs
            : (
                extraType === 'wide' ||
                extraType === 'bye' ||
                extraType === 'legbye'
                  ? 0
                  : runs
              ),

        total_runs:
          teamRuns,

        is_legal:
          legal,

        over_number:
          Math.floor(
            currentTotalBalls / 6
          )
      };

      const newRecentBalls = [
        ...oldRecentBalls,
        ballObject
      ].slice(-12);

      /*
       * --------------------------------------------------
       * PARTNERSHIP
       * --------------------------------------------------
       */

      const oldPartnership =
        previousOptimistic?.partnership ||
        currentInnings?.partnership ||
        {
          runs: 0,
          balls: 0
        };

      const newPartnership = {
        runs:
          Number(
            oldPartnership.runs || 0
          ) +
          teamRuns,

        balls:
          Number(
            oldPartnership.balls || 0
          ) +
          (legal ? 1 : 0)
      };

      /*
       * --------------------------------------------------
       * EXTRAS
       * --------------------------------------------------
       */

      const oldExtras =
        previousOptimistic?.extras ||
        currentInnings?.extras ||
        {};

      const newExtras = {
        wide:
          Number(oldExtras.wide || 0),
        noball:
          Number(oldExtras.noball || 0),
        bye:
          Number(oldExtras.bye || 0),
        legbye:
          Number(oldExtras.legbye || 0),
        penalty:
          Number(oldExtras.penalty || 0)
      };

      if (
        extraType &&
        Object.prototype.hasOwnProperty.call(
          newExtras,
          extraType
        )
      ) {
        newExtras[extraType] +=
          extraRuns;
      }

      /*
       * --------------------------------------------------
       * FALL OF WICKETS
       * --------------------------------------------------
       */

      const oldFOW =
        safeArray(
          previousOptimistic?.fallOfWickets ||
          currentInnings?.fallOfWickets
        );

      const newFallOfWickets =
        isWicket
          ? [
              ...oldFOW,
              {
                wicket_number:
                  newTotalWickets,
                player_id:
                  payload?.dismissed_id ||
                  strikerId,
                score:
                  newTotalRuns,
                overs:
                  `${Math.floor(
                    newTotalBalls / 6
                  )}.${newTotalBalls % 6}`,
                wicket_type:
                  payload?.wicket_type ||
                  'Wicket'
              }
            ]
          : oldFOW;

      /*
       * --------------------------------------------------
       * RUN RATE
       * --------------------------------------------------
       */

      const runRate =
        newTotalBalls > 0
          ? (
              newTotalRuns /
              (newTotalBalls / 6)
            ).toFixed(2)
          : '0.00';

      return {
        total_runs:
          newTotalRuns,

        total_wickets:
          newTotalWickets,

        total_balls:
          newTotalBalls,

        strikerId:
          nextStrikerId,

        nonStrikerId:
          nextNonStrikerId,

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
          Number(runRate)
      };
    }, [safeArray]);

  /*
   * ====================================================
   * PROCESS SCORE QUEUE
   * ====================================================
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
          setError(
            err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            'Unable to save ball'
          );

          scoreQueueRef.current = [];

          pendingCountRef.current = 0;

          setPendingCount(0);

          optimisticRef.current =
            null;

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
    }, [
      matchId,
      applyServerData
    ]);

  /*
   * ====================================================
   * PLAY BALL
   * ====================================================
   */

  const playBall =
    useCallback(
      (payload) => {
        const safeCurrentInningsList =
          Array.isArray(innings)
            ? innings
            : [];

        const current =
          safeCurrentInningsList[
            safeCurrentInningsList.length - 1
          ];

        if (!current) {
          return;
        }

        const currentInn =
          current?.innings;

        if (
          !currentInn ||
          typeof currentInn !== 'object'
        ) {
          return;
        }

        const effectiveStrikerId =
          optimisticRef.current?.strikerId ??
          currentInn.striker_id;

        const effectiveNonStrikerId =
          optimisticRef.current?.nonStrikerId ??
          currentInn.non_striker_id;

        const effectiveBowlerId =
          optimisticRef.current?.activeBowlerId ??
          currentInn.current_bowler_id;

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
            current: currentInn,
            currentInnings: current,
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
            currentInn.id,
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
        buildOptimisticBall,
        processScoreQueue
      ]
    );

  /*
   * ====================================================
   * UNDO
   * ====================================================
   *
   * FIX:
   *
   * We preserve the bowler and batsmen for EVERY Undo.
   *
   * Examples:
   *
   * Ball 1:
   *   Undo -> bowler remains
   *
   * Ball 7:
   *   Undo -> bowler remains
   *
   * Ball 12:
   *   Undo -> previous over bowler remains
   *
   * We do NOT reopen batsman selection.
   * ====================================================
   */

  const handleUndo =
    useCallback(async () => {
      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      const safeCurrentInningsList =
        Array.isArray(innings)
          ? innings
          : [];

      const latestCurrentInnings =
        safeCurrentInningsList[
          safeCurrentInningsList.length - 1
        ];

      if (
        !latestCurrentInnings?.innings
      ) {
        return;
      }

      const undoInn =
        latestCurrentInnings.innings;

      /*
       * --------------------------------------------------
       * CAPTURE STATE BEFORE UNDO
       * --------------------------------------------------
       */

      const bowlerBeforeUndo =
        optimisticRef.current?.activeBowlerId ??
        undoInn.current_bowler_id ??
        null;

      const strikerBeforeUndo =
        optimisticRef.current?.strikerId ??
        undoInn.striker_id ??
        null;

      const nonStrikerBeforeUndo =
        optimisticRef.current?.nonStrikerId ??
        undoInn.non_striker_id ??
        null;

      /*
       * IMPORTANT:
       * Preserve these for EVERY undo.
       */

      undoPreservedRef.current = {
        active: true,

        bowlerId:
          bowlerBeforeUndo,

        strikerId:
          strikerBeforeUndo,

        nonStrikerId:
          nonStrikerBeforeUndo
      };

      try {
        setError('');

        const result =
          await Innings.undo(
            undoInn.id
          );

        let resultInn = null;

        if (
          result?.innings &&
          typeof result.innings === 'object' &&
          !Array.isArray(result.innings)
        ) {
          resultInn =
            result.innings;
        } else if (
          result?.data?.innings &&
          typeof result.data.innings === 'object' &&
          !Array.isArray(result.data.innings)
        ) {
          resultInn =
            result.data.innings;
        }

        /*
         * --------------------------------------------------
         * RESULT STATE
         * --------------------------------------------------
         */

        const restoredRuns =
          resultInn
            ? Number(
                resultInn.total_runs || 0
              )
            : Number(
                undoInn.total_runs || 0
              );

        const restoredWickets =
          resultInn
            ? Number(
                resultInn.total_wickets || 0
              )
            : Number(
                undoInn.total_wickets || 0
              );

        const restoredBalls =
          resultInn
            ? Number(
                resultInn.total_balls || 0
              )
            : Math.max(
                0,
                Number(
                  undoInn.total_balls || 0
                ) - 1
              );

        /*
         * --------------------------------------------------
         * PRESERVE BATSMEN
         * --------------------------------------------------
         *
         * Backend result is allowed to change the
         * strike position according to the actual
         * previous ball state.
         *
         * But if backend sends null, we retain the
         * pre-Undo players.
         */

        const restoredStrikerId =
          resultInn?.striker_id ??
          strikerBeforeUndo ??
          null;

        const restoredNonStrikerId =
          resultInn?.non_striker_id ??
          nonStrikerBeforeUndo ??
          null;

        /*
         * --------------------------------------------------
         * PRESERVE BOWLER
         * --------------------------------------------------
         *
         * NEVER allow Undo response to clear the bowler.
         */

        const restoredBowlerId =
          bowlerBeforeUndo ??
          resultInn?.current_bowler_id ??
          null;

        /*
         * --------------------------------------------------
         * RESULT CARDS
         * --------------------------------------------------
         */

        const existingBattingCard =
          Array.isArray(
            latestCurrentInnings.battingCard
          )
            ? latestCurrentInnings.battingCard
            : [];

        const existingBowlingCard =
          Array.isArray(
            latestCurrentInnings.bowlingCard
          )
            ? latestCurrentInnings.bowlingCard
            : [];

        const resultBattingCard =
          Array.isArray(
            result?.battingCard
          )
            ? result.battingCard
            : existingBattingCard;

        const resultBowlingCard =
          Array.isArray(
            result?.bowlingCard
          )
            ? result.bowlingCard
            : existingBowlingCard;

        const resultRecentBalls =
          Array.isArray(
            result?.recentBalls
          )
            ? result.recentBalls
            : [];

        /*
         * --------------------------------------------------
         * IMPORTANT:
         * If backend returns no bowler after Undo,
         * patch it into the local innings.
         * --------------------------------------------------
         */

        setInnings(prev => {
          const safePrev =
            Array.isArray(prev)
              ? prev
              : [];

          if (
            safePrev.length === 0
          ) {
            return safePrev;
          }

          const next = [
            ...safePrev
          ];

          const lastIndex =
            next.length - 1;

          const lastEntry =
            next[lastIndex];

          if (
            !lastEntry?.innings
          ) {
            return safePrev;
          }

          const oldInn =
            lastEntry.innings;

          const patchedInn = {
            ...oldInn,

            ...(resultInn || {}),

            total_runs:
              restoredRuns,

            total_wickets:
              restoredWickets,

            total_balls:
              restoredBalls,

            /*
             * NEVER clear these on Undo.
             */
            current_bowler_id:
              restoredBowlerId,

            striker_id:
              restoredStrikerId,

            non_striker_id:
              restoredNonStrikerId
          };

          /*
           * After Undo, we are no longer waiting for a
           * new bowler simply because an over was previously
           * completed.
           *
           * The undone ball belongs to the previous state.
           */

          next[lastIndex] = {
            ...lastEntry,

            innings:
              patchedInn,

            overs:
              result?.overs ??
              `${Math.floor(
                restoredBalls / 6
              )}.${restoredBalls % 6}`,

            battingCard:
              resultBattingCard,

            bowlingCard:
              resultBowlingCard,

            recentBalls:
              resultRecentBalls,

            /*
             * If result contains these fields, keep them.
             */
            partnership:
              result?.partnership ??
              lastEntry.partnership,

            fallOfWickets:
              Array.isArray(
                result?.fallOfWickets
              )
                ? result.fallOfWickets
                : lastEntry.fallOfWickets
          };

          return next;
        });

        /*
         * --------------------------------------------------
         * CLEAR NEXT BOWLER MODAL
         * --------------------------------------------------
         *
         * If Undo goes from:
         *
         *   6 balls -> 5 balls
         *
         * or
         *
         *   7 balls -> 6 balls
         *
         * we should not leave the next-bowler modal open.
         */

        setShowNextBowler(false);

        /*
         * --------------------------------------------------
         * BUILD LOCAL OPTIMISTIC STATE
         * --------------------------------------------------
         */

        const restoredBowlerCard =
          resultBowlingCard.find(
            b =>
              b?.player_id ===
              restoredBowlerId
          ) || {
            player_id:
              restoredBowlerId,

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
          };

        const restoredStrikerCard =
          resultBattingCard.find(
            b =>
              b?.player_id ===
              restoredStrikerId
          ) || {
            player_id:
              restoredStrikerId,

            runs:
              0,

            balls:
              0,

            fours:
              0,

            sixes:
              0,

            strike_rate:
              0
          };

        const restoredNonStrikerCard =
          resultBattingCard.find(
            b =>
              b?.player_id ===
              restoredNonStrikerId
          ) || {
            player_id:
              restoredNonStrikerId,

            runs:
              0,

            balls:
              0,

            fours:
              0,

            sixes:
              0,

            strike_rate:
              0
          };

        const restoredPartnership =
          result?.partnership ||
          latestCurrentInnings?.partnership ||
          {
            runs: 0,
            balls: 0
          };

        const restoredExtras =
          result?.extras ||
          latestCurrentInnings?.extras ||
          {
            wide: 0,
            noball: 0,
            bye: 0,
            legbye: 0,
            penalty: 0
          };

        const restoredFOW =
          Array.isArray(
            result?.fallOfWickets
          )
            ? result.fallOfWickets
            : safeArray(
                latestCurrentInnings.fallOfWickets
              );

        const restoredRunRate =
          restoredBalls > 0
            ? Number(
                (
                  restoredRuns /
                  (restoredBalls / 6)
                ).toFixed(2)
              )
            : 0;

        const restoredState = {
          total_runs:
            restoredRuns,

          total_wickets:
            restoredWickets,

          total_balls:
            restoredBalls,

          strikerId:
            restoredStrikerId,

          nonStrikerId:
            restoredNonStrikerId,

          /*
           * THIS IS THE IMPORTANT PART.
           */
          activeBowlerId:
            restoredBowlerId,

          /*
           * Undo should not force another bowler
           * unless the actual server state requires it.
           *
           * Because we explicitly preserve the bowler,
           * this remains false.
           */
          needsNextBowler:
            false,

          bowlerStats:
            restoredBowlerCard,

          bowlerBalls:
            (
              Math.floor(
                restoredBalls / 6
              ) * 6
            ) +
            (
              restoredBalls % 6
            ),

          strikerStats:
            restoredStrikerCard,

          nonStrikerStats:
            restoredNonStrikerCard,

          recentBalls:
            resultRecentBalls,

          extras:
            restoredExtras,

          partnership:
            restoredPartnership,

          fallOfWickets:
            restoredFOW,

          runRate:
            restoredRunRate
        };

        optimisticRef.current =
          restoredState;

        setOptimistic(
          restoredState
        );

        /*
         * --------------------------------------------------
         * RESTORE BOWLER IN BACKEND
         * --------------------------------------------------
         *
         * If backend cleared current_bowler_id during
         * Undo, restore it.
         *
         * This runs for EVERY Undo where a bowler existed.
         */

        if (
          restoredBowlerId
        ) {
          try {
            await Innings.setBowler(
              undoInn.id,
              {
                bowler_id:
                  restoredBowlerId
              }
            );
          } catch (bowlerError) {
            console.warn(
              'Unable to restore bowler after Undo:',
              bowlerError
            );
          }
        }

        /*
         * --------------------------------------------------
         * KEEP PRESERVATION ACTIVE BRIEFLY
         * --------------------------------------------------
         *
         * Socket update may arrive after this function.
         * The socket handler will also protect the state.
         */

        setTimeout(() => {
          const current =
            undoPreservedRef.current;

          if (
            current?.active
          ) {
            undoPreservedRef.current = {
              active: false,
              bowlerId: null,
              strikerId: null,
              nonStrikerId: null
            };
          }
        }, 2500);

      } catch (err) {
        undoPreservedRef.current = {
          active: false,
          bowlerId: null,
          strikerId: null,
          nonStrikerId: null
        };

        setError(
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Unable to undo'
        );

        await loadFull();
      }
    },
    [
      innings,
      loadFull,
      safeArray
    ]);

  /*
   * ====================================================
   * SAFE DISPLAY DATA
   * ====================================================
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

  /*
   * ----------------------------------------------------
   * EFFECTIVE BATSMEN
   * ----------------------------------------------------
   */

  const earlyStrikerId =
    optimistic?.strikerId ??
    earlyInn?.striker_id ??
    undoPreservedRef.current?.strikerId ??
    null;

  const earlyNonStrikerId =
    optimistic?.nonStrikerId ??
    earlyInn?.non_striker_id ??
    undoPreservedRef.current?.nonStrikerId ??
    null;

  /*
   * ----------------------------------------------------
   * EFFECTIVE BOWLER
   * ----------------------------------------------------
   */

  const earlyBowlerId =
    optimistic?.activeBowlerId ??
    earlyInn?.current_bowler_id ??
    undoPreservedRef.current?.bowlerId ??
    null;

  const earlyTotalBalls =
    optimistic?.total_balls ??
    Number(
      earlyInn?.total_balls || 0
    );

  /*
   * ----------------------------------------------------
   * INITIAL BOWLER REQUIREMENT
   * ----------------------------------------------------
   */

  const needsInitialBowler =
    !!earlyStrikerId &&
    !!earlyNonStrikerId &&
    !earlyBowlerId &&
    Number(earlyTotalBalls) === 0 &&
    !undoPreservedRef.current?.active;

  useEffect(() => {
    if (
      needsInitialBowler &&
      !showInitialBowler &&
      !undoPreservedRef.current?.active
    ) {
      setShowInitialBowler(true);
    }
  }, [
    needsInitialBowler,
    showInitialBowler
  ]);

  /*
   * ====================================================
   * EARLY LOADING
   * ====================================================
   */

  if (!match) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card text-center">
          Loading match…
        </div>
      </div>
    );
  }

  if (!currentInnings) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card text-center">
          Loading innings…
        </div>
      </div>
    );
  }

  const inn =
    currentInnings.innings;

  /*
   * ====================================================
   * TEAM PLAYERS
   * ====================================================
   */

  const battingTeamPlayers =
    safePlayers.filter(
      p =>
        p?.team_id ===
        inn?.batting_team_id
    );

  const bowlingTeamPlayers =
    safePlayers.filter(
      p =>
        p?.team_id ===
        inn?.bowling_team_id
    );

  /*
   * ====================================================
   * EFFECTIVE DISPLAY IDs
   * ====================================================
   */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn?.striker_id ??
    undoPreservedRef.current?.strikerId ??
    null;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn?.non_striker_id ??
    undoPreservedRef.current?.nonStrikerId ??
    null;

  const effectiveBowlerId =
    optimistic?.activeBowlerId ??
    inn?.current_bowler_id ??
    undoPreservedRef.current?.bowlerId ??
    null;

  const displayTotalRuns =
    Number(
      optimistic?.total_runs ??
      inn?.total_runs ??
      0
    );

  const displayTotalWickets =
    Number(
      optimistic?.total_wickets ??
      inn?.total_wickets ??
      0
    );

  const displayTotalBalls =
    Number(
      optimistic?.total_balls ??
      inn?.total_balls ??
      0
    );

  const displayOvers =
    `${Math.floor(
      displayTotalBalls / 6
    )}.${displayTotalBalls % 6}`;

  const displayRunRate =
    displayTotalBalls > 0
      ? (
          displayTotalRuns /
          (displayTotalBalls / 6)
        ).toFixed(2)
      : '0.00';

  /*
   * ====================================================
   * OUT IDS
   * ====================================================
   */

  const outIds =
    new Set();

  const battingCard =
    safeArray(
      optimistic?.battingCard ||
      currentInnings.battingCard
    );

  for (
    const stats of battingCard
  ) {
    if (
      stats?.is_out &&
      stats?.player_id
    ) {
      outIds.add(
        stats.player_id
      );
    }
  }

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

  /*
   * ====================================================
   * PLAYER OBJECTS
   * ====================================================
   */

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
   * ====================================================
   * NEED BATSMEN
   * ====================================================
   *
   * IMPORTANT:
   * Because effective IDs include the Undo-preserved IDs,
   * Undoing ball 1 will NOT reopen this screen.
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
   * ====================================================
   * BATSMAN STATS
   * ====================================================
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
   * ====================================================
   * BOWLER STATS
   * ====================================================
   */

  const bowlingCard =
    safeArray(
      optimistic?.bowlingCard ||
      currentInnings.bowlingCard
    );

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
   * ====================================================
   * RECENT BALLS
   * ====================================================
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
   * ====================================================
   * NEXT BOWLER
   * ====================================================
   *
   * If a bowler is already preserved/selected, do NOT
   * show next-bowler state.
   */

  const needsNextBowler =
    !effectiveBowlerId
      ? (
          optimistic?.needsNextBowler ||
          (
            !inn.current_bowler_id &&
            displayTotalBalls > 0 &&
            displayTotalBalls % 6 === 0 &&
            !undoPreservedRef.current?.active
          )
        )
      : false;

  /*
   * ====================================================
   * PARTNERSHIP
   * ====================================================
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

      {/* ==================================================
          SCORING CONTROLS
          ================================================== */}

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
                onClick={
                  handleUndo
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

      {/* ==================================================
          SELECT BOWLER BUTTON
          ================================================== */}

      {!effectiveBowlerId &&
        effectiveStrikerId &&
        effectiveNonStrikerId &&
        displayTotalBalls === 0 &&
        !undoPreservedRef.current?.active && (

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

      {/* ==================================================
          CURRENT PARTNERSHIP
          ================================================== */}

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

      {/* ==================================================
          FALL OF WICKETS
          ================================================== */}

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

      {/* ==================================================
          SCOREBOARD
          ================================================== */}

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

      {/* ==================================================
          INITIAL BOWLER MODAL
          ================================================== */}

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

              undoPreservedRef.current = {
                active: false,
                bowlerId: null,
                strikerId: null,
                nonStrikerId: null
              };

              setShowInitialBowler(
                false
              );

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

      {/* ==================================================
          NEXT BOWLER MODAL
          ================================================== */}

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

                undoPreservedRef.current = {
                  active: false,
                  bowlerId: null,
                  strikerId: null,
                  nonStrikerId: null
                };

                setShowNextBowler(
                  false
                );

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

      {/* ==================================================
          WICKET MODAL
          ================================================== */}

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
 * ======================================================
 * INITIAL BOWLER SELECTOR
 * ======================================================
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
 * ======================================================
 * NEXT BOWLER SELECTOR
 * ======================================================
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
 * ======================================================
 * FALL OF WICKETS
 * ======================================================
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
 * ======================================================
 * STAT
 * ======================================================
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
 * ======================================================
 * BOWLING STAT
 * ======================================================
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
 * ======================================================
 * BATSMAN CARD
 * ======================================================
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
 * ======================================================
 * BALL DISPLAY
 * ======================================================
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
 * ======================================================
 * BATSMEN SELECTION
 * ======================================================
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
