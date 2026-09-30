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

  /*
   * =========================================================
   * SCORE QUEUE
   * =========================================================
   *
   * UI changes immediately.
   *
   * API requests happen in the background.
   *
   * We intentionally keep requests ordered because cricket
   * balls must be saved in the same order the scorer entered
   * them.
   */

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  /*
   * =========================================================
   * FAST ACTION CONTROL
   * =========================================================
   *
   * null / 'swap' / 'undo' / 'start'
   */

  const actionBusyRef = useRef(null);
  const [actionBusy, setActionBusy] = useState(null);

  /*
   * Prevent an old background request from replacing newer
   * optimistic state.
   */

  const syncVersionRef = useRef(0);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * =========================================================
   * SERVER DATA
   * =========================================================
   */

  const applyServerData = useCallback((data) => {
    if (!data) return;

    setMatch(data.match);
    setPlayers(safeArray(data.players));
    setInnings(safeArray(data.innings));

    /*
     * Only clear optimistic data when absolutely everything
     * has already been saved.
     */
    if (pendingCountRef.current === 0) {
      optimisticRef.current = null;
      setOptimistic(null);
    }
  }, []);

  /*
   * =========================================================
   * BACKGROUND SYNC
   * =========================================================
   */

  const backgroundSync = useCallback(
    (version = syncVersionRef.current) => {
      Matches.get(matchId)
        .then((data) => {
          /*
           * A newer action happened.
           * Do not allow this older response to overwrite it.
           */
          if (version !== syncVersionRef.current) {
            return;
          }

          /*
           * Balls are still waiting to be saved.
           */
          if (pendingCountRef.current > 0) {
            return;
          }

          applyServerData(data);
        })
        .catch((err) => {
          console.error('Background sync failed:', err);
        });
    },
    [matchId, applyServerData]
  );

  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      if (pendingCountRef.current > 0) {
        return;
      }

      applyServerData(data);
    } catch (err) {
      console.error('Failed to load match:', err);
    }
  }, [matchId, applyServerData]);

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
      innings: updatedInnings
    }) => {
      /*
       * Never overwrite balls waiting in our local queue.
       */
      if (pendingCountRef.current > 0) {
        return;
      }

      /*
       * Wait for our authoritative background sync.
       */
      if (optimisticRef.current) {
        return;
      }

      /*
       * Do not overwrite fast actions while they are active.
       */
      if (actionBusyRef.current) {
        return;
      }

      setMatch(updatedMatch);
      setInnings(safeArray(updatedInnings));
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
      clearTimeout(wicketTimer.current);

      scoreQueueRef.current = [];
      processingQueueRef.current = false;
      actionBusyRef.current = null;
    };
  }, []);

  /*
   * =========================================================
   * PLAYER CREATED
   * =========================================================
   */

  const handlePlayerCreated = useCallback((player) => {
    if (!player) return;

    setPlayers((prev) => {
      const exists = prev.some((p) => p.id === player.id);

      if (exists) {
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

  const popBoundary = useCallback((type) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(type);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 1100);
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
   * GENERIC SERVER ACTION
   * =========================================================
   */

  const act = async (fn) => {
    setError('');

    try {
      await fn();

      ++syncVersionRef.current;

      backgroundSync(syncVersionRef.current);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Something went wrong'
      );

      ++syncVersionRef.current;

      backgroundSync(syncVersionRef.current);
    }
  };

  /*
   * =========================================================
   * PLAYER ID
   * =========================================================
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
   * =========================================================
   * OPTIMISTIC BALL BUILDER
   * =========================================================
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

    const runs = Number(payload.runs || 0);

    const inputExtraRuns = Number(
      payload.extra_runs || 0
    );

    let teamRuns = 0;
    let batsmanRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (payload.extra_type) {
      case 'wide':
        teamRuns = Math.max(
          1,
          inputExtraRuns || 1
        );

        batsmanRuns = 0;

        runsRun = Math.max(
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
        teamRuns = Math.max(
          0,
          inputExtraRuns
        );

        batsmanRuns = 0;
        runsRun = teamRuns;
        legal = true;
        break;

      case 'penalty':
        teamRuns = Math.max(
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

    const wicket = !!payload.is_wicket;

    const previousRuns =
      previousOptimistic?.total_runs ??
      Number(current.total_runs || 0);

    const previousWickets =
      previousOptimistic?.total_wickets ??
      Number(current.total_wickets || 0);

    const previousBalls =
      previousOptimistic?.total_balls ??
      Number(current.total_balls || 0);

    const newTotalRuns =
      previousRuns + teamRuns;

    const newTotalWickets =
      previousWickets +
      (wicket ? 1 : 0);

    const newTotalBalls =
      previousBalls +
      (legal ? 1 : 0);

    /*
     * =======================================================
     * BATSMAN STATS
     * =======================================================
     */

    const battingCard = safeArray(
      currentInnings.battingCard
    );

    const serverStrikerStats =
      battingCard.find(
        (b) =>
          b.player_id === strikerId
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
          b.player_id === nonStrikerId
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
      payload.extra_type === 'wide' ||
      payload.extra_type === 'noball'
        ? 0
        : 1;

    const batterGetsRuns =
      !payload.extra_type ||
      payload.extra_type === 'noball';

    const newStrikerRuns =
      Number(
        previousStrikerStats.runs || 0
      ) +
      (batterGetsRuns ? batsmanRuns : 0);

    const newStrikerBalls =
      Number(
        previousStrikerStats.balls || 0
      ) + strikerBallsAdded;

    const newStrikerFours =
      Number(
        previousStrikerStats.fours || 0
      ) +
      (batterGetsRuns &&
      batsmanRuns === 4
        ? 1
        : 0);

    const newStrikerSixes =
      Number(
        previousStrikerStats.sixes || 0
      ) +
      (batterGetsRuns &&
      batsmanRuns === 6
        ? 1
        : 0);

    const newStrikerSR =
      newStrikerBalls > 0
        ? Number(
            (
              (newStrikerRuns /
                newStrikerBalls) *
              100
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
     * =======================================================
     * WICKET
     * =======================================================
     */

    if (
      wicket &&
      payload.dismissed_id
    ) {
      if (
        payload.dismissed_id ===
        strikerId
      ) {
        updatedStrikerStats.is_out = true;

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
      const oldStrikerId = strikerId;
      const oldNonStrikerId = nonStrikerId;

      const oldStrikerStats =
        updatedStrikerStats;

      const oldNonStrikerStats =
        updatedNonStrikerStats;

      strikerId = oldNonStrikerId;
      nonStrikerId = oldStrikerId;

      updatedStrikerStats =
        oldNonStrikerStats;

      updatedNonStrikerStats =
        oldStrikerStats;
    }

    /*
     * =======================================================
     * BOWLER STATS
     * =======================================================
     */

    const bowlingCard = safeArray(
      currentInnings.bowlingCard
    );

    const serverBowlerStats =
      bowlingCard.find(
        (b) =>
          b.player_id ===
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
        ) + batsmanRuns;
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
      bowlerRunsAdded = batsmanRuns;
    }

    const newBowlerRuns =
      Number(
        previousBowlerStats.runs || 0
      ) + bowlerRunsAdded;

    const bowlerGetsWicket =
      wicket &&
      payload.wicket_type !==
        'run-out';

    const newBowlerWickets =
      Number(
        previousBowlerStats.wickets ||
          0
      ) +
      (bowlerGetsWicket ? 1 : 0);

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
      newTotalBalls > previousBalls;

    if (overJustCompleted) {
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
            ballExtra === 'bye' ||
            ballExtra === 'legbye' ||
            ballExtra === 'penalty'
          ) {
            return;
          }

          if (
            ballExtra === 'wide'
          ) {
            overRuns += Math.max(
              1,
              Number(
                ball.extra_runs || 1
              )
            );
          } else if (
            ballExtra === 'noball'
          ) {
            overRuns +=
              Math.max(
                1,
                Number(
                  ball.extra_runs || 1
                )
              ) +
              Number(
                ball.runs_batsman || 0
              );
          } else {
            overRuns += Number(
              ball.runs_batsman || 0
            );
          }
        }
      );

      if (overRuns === 0) {
        newMaidens += 1;
      }
    }

    const bowlerEconomy =
      newBowlerBalls > 0
        ? Number(
            (
              newBowlerRuns /
              (newBowlerBalls / 6)
            ).toFixed(2)
          )
        : 0;

    const updatedBowlerStats = {
      ...previousBowlerStats,
      player_id: scoringBowlerId,
      overs: bowlerOvers,
      maidens: newMaidens,
      runs: newBowlerRuns,
      wickets: newBowlerWickets,
      economy: bowlerEconomy
    };

    /*
     * =======================================================
     * END OF OVER
     * =======================================================
     */

    let needsNextBowler =
      previousOptimistic?.needsNextBowler ||
      false;

    if (overJustCompleted) {
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
     * =======================================================
     * RECENT BALL
     * =======================================================
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
        ? previousBalls % 6 + 1
        : previousBalls % 6;

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

      over_number: overNumber,

      ball_in_over: ballInOver,

      batsman_id:
        previousOptimistic?.strikerId ??
        current.striker_id,

      non_striker_id:
        previousOptimistic?.nonStrikerId ??
     
