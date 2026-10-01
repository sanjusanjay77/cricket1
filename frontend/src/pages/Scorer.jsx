import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
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

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  const [fixedBatsmen, setFixedBatsmen] = useState(null);
  const fixedBatsmenRef = useRef(null);
  const fixedBatsmenInningsRef = useRef(null);

  const visualStateRef = useRef(null);
  const visualHistoryRef = useRef([]);

  const undoRollbackRef = useRef(null);
  const swapRollbackRef = useRef(null);

  const [actionBusy, setActionBusy] = useState(null);
  const actionBusyRef = useRef(null);

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);

  const pendingCountRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * =========================================================
   * SERVER DATA
   * =========================================================
   */

  const applyServerData = useCallback((data) => {
    if (!data) return;

    const nextInnings = data.innings || [];
    const latest = nextInnings[nextInnings.length - 1];
    const latestInn = latest?.innings;
    const latestInningsId = latestInn?.id ?? null;

    setMatch(data.match);
    setPlayers(data.players || []);
    setInnings(nextInnings);

    setFixedBatsmen((previous) => {
      if (!latestInn || !latestInningsId) {
        fixedBatsmenRef.current = null;
        fixedBatsmenInningsRef.current = null;
        return null;
      }

      const battingCard = latest?.battingCard || [];

      const getStats = (playerId) => {
        if (!playerId) return null;

        return (
          battingCard.find(
            (b) =>
              String(b.player_id) === String(playerId)
          ) || {
            player_id: playerId,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            strike_rate: 0,
            is_out: false
          }
        );
      };

      const isNewInnings =
        !previous ||
        String(previous.inningsId) !==
          String(latestInningsId);

      if (isNewInnings) {
        const fresh = {
          inningsId: latestInningsId,
          leftPlayerId:
            latestInn.striker_id || null,
          rightPlayerId:
            latestInn.non_striker_id || null,
          leftStats:
            getStats(latestInn.striker_id),
          rightStats:
            getStats(latestInn.non_striker_id),
          strikerSide: 'left'
        };

        fixedBatsmenRef.current = fresh;
        fixedBatsmenInningsRef.current =
          latestInningsId;

        return fresh;
      }

      let leftPlayerId =
        previous.leftPlayerId;

      let rightPlayerId =
        previous.rightPlayerId;

      if (
        !leftPlayerId &&
        latestInn.striker_id &&
        String(latestInn.striker_id) !==
          String(rightPlayerId)
      ) {
        leftPlayerId =
          latestInn.striker_id;
      }

      if (
        !rightPlayerId &&
        latestInn.striker_id &&
        String(latestInn.striker_id) !==
          String(leftPlayerId)
      ) {
        rightPlayerId =
          latestInn.striker_id;
      }

      if (
        !leftPlayerId &&
        latestInn.non_striker_id &&
        String(latestInn.non_striker_id) !==
          String(rightPlayerId)
      ) {
        leftPlayerId =
          latestInn.non_striker_id;
      }

      if (
        !rightPlayerId &&
        latestInn.non_striker_id &&
        String(latestInn.non_striker_id) !==
          String(leftPlayerId)
      ) {
        rightPlayerId =
          latestInn.non_striker_id;
      }

      const strikerSide =
        String(latestInn.striker_id) ===
        String(leftPlayerId)
          ? 'left'
          : String(latestInn.striker_id) ===
            String(rightPlayerId)
          ? 'right'
          : previous.strikerSide;

      const synced = {
        ...previous,
        inningsId: latestInningsId,
        leftPlayerId,
        rightPlayerId,
        leftStats:
          getStats(leftPlayerId),
        rightStats:
          getStats(rightPlayerId),
        strikerSide
      };

      fixedBatsmenRef.current = synced;
      fixedBatsmenInningsRef.current =
        latestInningsId;

      return synced;
    });

    const latestState =
      visualStateRef.current;

    if (
      latestInn &&
      latestState &&
      String(latestState.inningsId) !==
        String(latestInn.id)
    ) {
      visualStateRef.current = null;
      visualHistoryRef.current = [];
    }

    optimisticRef.current = null;
    setOptimistic(null);

    const currentVisualState =
      visualStateRef.current;

    if (
      currentVisualState &&
      latestInn &&
      String(
        currentVisualState.inningsId ||
          latestInn.id
      ) === String(latestInn.id)
    ) {
      const battingCard =
        latest?.battingCard || [];

      const bowlingCard =
        latest?.bowlingCard || [];

      visualStateRef.current = {
        ...currentVisualState,

        total_runs:
          Number(latestInn.total_runs || 0),

        total_wickets:
          Number(
            latestInn.total_wickets || 0
          ),

        total_balls:
          Number(
            latestInn.total_balls || 0
          ),

        strikerId:
          latestInn.striker_id || null,

        nonStrikerId:
          latestInn.non_striker_id ||
          null,

        activeBowlerId:
          latestInn.current_bowler_id ||
          currentVisualState.activeBowlerId ||
          null,

        strikerStats:
          battingCard.find(
            (b) =>
              String(b.player_id) ===
              String(latestInn.striker_id)
          ) ||
          currentVisualState.strikerStats,

        nonStrikerStats:
          battingCard.find(
            (b) =>
              String(b.player_id) ===
              String(
                latestInn.non_striker_id
              )
          ) ||
          currentVisualState.nonStrikerStats,

        bowlerStats:
          bowlingCard.find(
            (b) =>
              String(b.player_id) ===
              String(
                latestInn.current_bowler_id
              )
          ) ||
          currentVisualState.bowlerStats,

        recentBalls:
          latest?.recentBalls ||
          currentVisualState.recentBalls ||
          [],

        partnership:
          latest?.partnership ||
          currentVisualState.partnership,

        fallOfWickets:
          latest?.fallOfWickets ||
          currentVisualState.fallOfWickets ||
          []
      };
    }
  }, []);

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

  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * =========================================================
   * IMPORTANT:
   * ALL HOOKS ARE ABOVE CONDITIONAL RETURNS
   * =========================================================
   */

  useEffect(() => {
    if (
      match?.status ===
        'innings-break' &&
      pendingCountRef.current === 0
    ) {
      navigate(
        `/match/${matchId}/target`,
        { replace: true }
      );
    }
  }, [
    match?.status,
    matchId,
    navigate
  ]);

  /*
   * =========================================================
   * PLAYER CREATED
   * =========================================================
   */

  const handlePlayerCreated =
    useCallback((player) => {
      setPlayers((prev) => {
        const exists =
          prev.some(
            (p) => p.id === player.id
          );

        if (exists) {
          return prev;
        }

        return [...prev, player];
      });
    }, []);

  /*
   * =========================================================
   * SOCKET
   * =========================================================
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
      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      const nextInnings =
        updatedInnings || [];

      const latest =
        nextInnings[
          nextInnings.length - 1
        ];

      const latestInn =
        latest?.innings;

      if (
        updatedMatch?.status ===
          'innings-break' ||
        updatedMatch?.status ===
          'completed'
      ) {
        setShowNextBowler(false);
      }

      setMatch(updatedMatch);
      setInnings(nextInnings);

      if (latestInn) {
        setFixedBatsmen(
          (previous) => {
            if (
              !previous ||
              String(
                previous.inningsId
              ) !==
                String(
                  latestInn.id
                )
            ) {
              return previous;
            }

            const card =
              latest?.battingCard ||
              [];

            const getStats = (id) =>
              id
                ? card.find(
                    (b) =>
                      String(
                        b.player_id
                      ) ===
                      String(id)
                  ) || {
                    player_id: id,
                    runs: 0,
                    balls: 0,
                    fours: 0,
                    sixes: 0,
                    strike_rate: 0
                  }
                : null;

            const strikerSide =
              String(
                latestInn.striker_id
              ) ===
              String(
                previous.leftPlayerId
              )
                ? 'left'
                : String(
                    latestInn.striker_id
                  ) ===
                  String(
                    previous.rightPlayerId
                  )
                ? 'right'
                : previous.strikerSide;

            const synced = {
              ...previous,
              leftStats:
                getStats(
                  previous.leftPlayerId
                ),
              rightStats:
                getStats(
                  previous.rightPlayerId
                ),
              strikerSide
            };

            fixedBatsmenRef.current =
              synced;

            return synced;
          }
        );
      }

      optimisticRef.current = null;
      setOptimistic(null);

      visualStateRef.current = null;
      visualHistoryRef.current = [];
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
   * =========================================================
   * CLEANUP
   * =========================================================
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
    };
  }, []);

  /*
   * =========================================================
   * VISUAL EFFECTS
   * =========================================================
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
   * =========================================================
   * NEXT BOWLER TRIGGER
   * =========================================================
   */

  useEffect(() => {
    if (
      !optimistic?.inningsCompleted &&
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
    optimistic?.total_balls,
    optimistic?.inningsCompleted
  ]);

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
     * BATSMAN STATS
     */

    const battingCard =
      currentInnings.battingCard ||
      [];

    const serverStrikerStats =
      battingCard.find(
        (b) =>
          String(b.player_id) ===
          String(strikerId)
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
          String(b.player_id) ===
          String(nonStrikerId)
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
              ) *
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
      strike_rate:
        newStrikerSR
    };

    let updatedNonStrikerStats = {
      ...previousNonStrikerStats,
      player_id: nonStrikerId
    };

    /*
     * WICKET
     */

    if (
      wicket &&
      payload.dismissed_id
    ) {
      if (
        String(
          payload.dismissed_id
        ) === String(strikerId)
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
        String(
          payload.dismissed_id
        ) ===
        String(nonStrikerId)
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
     * BOWLER
     */

    const bowlingCard =
      currentInnings.bowlingCard ||
      [];

    const serverBowlerStats =
      bowlingCard.find(
        (b) =>
          String(b.player_id) ===
          String(
            scoringBowlerId
          )
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
      const oversText =
        String(
          previousBowlerStats.overs ||
          '0.0'
        );

      const [overs, balls] =
        oversText.split('.');

      previousBowlerBalls =
        (
          Number(overs) || 0
        ) *
          6 +
        (
          Number(balls) || 0
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
        currentInnings.recentBalls ||
        [];

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
            String(
              ball.bowler_id
            ) ===
              String(
                scoringBowlerId
              )
        );

      let overRuns =
        bowlerRunsAdded;

      ballsForCompletedOver.forEach(
        (ball) => {
          const extra =
            ball.extra_type;

          if (
            extra === 'bye' ||
            extra === 'legbye' ||
            extra === 'penalty'
          ) {
            return;
          }

          if (
            extra === 'wide'
          ) {
            overRuns += Math.max(
              1,
              Number(
                ball.extra_runs || 1
              )
            );
          } else if (
            extra === 'noball'
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
            overRuns += Number(
              ball.runs_batsman ||
                0
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
      player_id:
        scoringBowlerId,
      overs: bowlerOvers,
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
     * END OF OVER
     */

    let needsNextBowler =
      previousOptimistic?.needsNextBowler ||
      false;

    if (
      overJustCompleted &&
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

      needsNextBowler = true;
    }

    /*
     * RECENT BALL
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

    const newRecentBalls = [
      ...previousRecentBalls,
      optimisticBall
    ].slice(-24);

    /*
     * EXTRAS
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
     * PARTNERSHIP
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

    /*
     * RUN RATE
     */

    const newRunRate =
      newTotalBalls > 0
        ? Number(
            (
              newTotalRuns /
              (newTotalBalls / 6)
            ).toFixed(2)
          )
        : 0;

    /*
     * FALL OF WICKETS
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

    /*
     * INNINGS COMPLETION
     */

    const inningsNumber =
      Number(
        current.innings_number ??
          current.innings_no ??
          current.number ??
          1
      );

    const maxBalls =
      Number(
        match?.overs_limit || 0
      ) > 0
        ? Number(
            match.overs_limit
          ) * 6
        : 0;

    const targetForChase =
      inningsNumber === 2
        ? Number(
            current.target ??
              match?.target ??
              match?.target_score ??
              0
          ) || null
        : null;

    const inningsCompleted =
      newTotalWickets >= 10 ||
      (
        maxBalls > 0 &&
        newTotalBalls >=
          maxBalls
      ) ||
      (
        targetForChase &&
        newTotalRuns >=
          targetForChase
      );

    return {
      inningsId:
        current.id,

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

      needsNextBowler:
        inningsCompleted
          ? false
          : needsNextBowler,

      inningsCompleted,

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
   * =========================================================
   * SCORE QUEUE
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
              pendingCountRef.current -
                1
            );

          setPendingCount(
            pendingCountRef.current
          );
        } catch (err) {
          failed = true;

          setError(
            err?.response?.data
              ?.error ||
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

          visualStateRef.current =
            null;

          visualHistoryRef.current =
            [];

          fixedBatsmenRef.current =
            null;

          fixedBatsmenInningsRef.current =
            null;

          setFixedBatsmen(null);

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

      /*
       * Background authoritative sync.
       * The UI does not wait for it.
       */

      if (
        !failed &&
        pendingCountRef.current ===
          0
      ) {
        Matches.get(matchId)
          .then((data) => {
            if (
              pendingCountRef.current ===
              0
            ) {
              applyServerData(data);
            }
          })
          .catch(() => {});
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
          optimisticRef.current
            ?.strikerId ??
          visualStateRef.current
            ?.strikerId ??
          current.striker_id;

        const effectiveNonStrikerId =
          optimisticRef.current
            ?.nonStrikerId ??
          visualStateRef.current
            ?.nonStrikerId ??
          current.non_striker_id;

        const effectiveBowlerId =
          optimisticRef.current
            ?.activeBowlerId ??
          visualStateRef.current
            ?.activeBowlerId ??
          current.current_bowler_id;

        /*
         * Never score while waiting
         * for the next bowler.
         */

        if (
          optimisticRef.current
            ?.needsNextBowler
        ) {
          return;
        }

        if (
          optimisticRef.current
            ?.inningsCompleted
        ) {
          return;
        }

        if (
          !effectiveStrikerId ||
          !effectiveNonStrikerId ||
          !effectiveBowlerId
        ) {
          return;
        }

        if (
          !payload.extra_type &&
          Number(payload.runs) ===
            4
        ) {
          popBoundary('four');
        }

        if (
          !payload.extra_type &&
          Number(payload.runs) ===
            6
        ) {
          popBoundary('six');
        }

        const previousVisual =
          optimisticRef.current ||
          visualStateRef.current ||
          null;

        /*
         * Save pre-ball state for Undo.
         */

        visualHistoryRef.current.push(
          {
            state:
              previousVisual
                ? JSON.parse(
                    JSON.stringify(
                      previousVisual
                    )
                  )
                : null,

            fixed:
              fixedBatsmenRef.current
                ? JSON.parse(
                    JSON.stringify(
                      fixedBatsmenRef.current
                    )
                  )
                : null
          }
        );

        if (
          visualHistoryRef.current
            .length > 50
        ) {
          visualHistoryRef.current.shift();
        }

        const nextOptimistic =
          buildOptimisticBall({
            current,
            currentInnings,
            payload,
            previousOptimistic:
              previousVisual
          });

        /*
         * FIXED BATSMAN CARDS
         */

        const previousFixed =
          fixedBatsmenRef.current;

        const initialLeftId =
          previousFixed?.leftPlayerId ??
          effectiveStrikerId;

        const initialRightId =
          previousFixed?.rightPlayerId ??
          effectiveNonStrikerId;

        const statsById = new Map();

        if (
          nextOptimistic
            .strikerStats
            ?.player_id
        ) {
          statsById.set(
            String(
              nextOptimistic
                .strikerStats
                .player_id
            ),
            nextOptimistic.strikerStats
          );
        }

        if (
          nextOptimistic
            .nonStrikerStats
            ?.player_id
        ) {
          statsById.set(
            String(
              nextOptimistic
                .nonStrikerStats
                .player_id
            ),
            nextOptimistic.nonStrikerStats
          );
        }

        let leftPlayerId =
          initialLeftId;

        let rightPlayerId =
          initialRightId;

        if (
          payload.is_wicket &&
          payload.dismissed_id
        ) {
          if (
            String(leftPlayerId) ===
            String(
              payload.dismissed_id
            )
          ) {
            leftPlayerId = null;
          }

          if (
            String(rightPlayerId) ===
            String(
              payload.dismissed_id
            )
          ) {
            rightPlayerId = null;
          }
        }

        const strikerSide =
          String(
            nextOptimistic.strikerId
          ) ===
          String(leftPlayerId)
            ? 'left'
            : String(
                nextOptimistic
                  .strikerId
              ) ===
              String(rightPlayerId)
            ? 'right'
            : previousFixed
                ?.strikerSide ||
              'left';

        const nextFixed = {
          inningsId:
            current.id,

          leftPlayerId,

          rightPlayerId,

          leftStats:
            leftPlayerId
              ? statsById.get(
                  String(
                    leftPlayerId
                  )
                ) ||
                previousFixed
                  ?.leftStats ||
                null
              : null,

          rightStats:
            rightPlayerId
              ? statsById.get(
                  String(
                    rightPlayerId
                  )
                ) ||
                previousFixed
                  ?.rightStats ||
                null
              : null,

          strikerSide
        };

        fixedBatsmenRef.current =
          nextFixed;

        visualStateRef.current =
          nextOptimistic;

        flushSync(() => {
          optimisticRef.current =
            nextOptimistic;

          setOptimistic(
            nextOptimistic
          );

          setFixedBatsmen(
            nextFixed
          );
        });

        /*
         * QUEUE SERVER SAVE
         */

        scoreQueueRef.current.push(
          {
            inningsId:
              current.id,

            payload
          }
        );

        pendingCountRef.current +=
          1;

        setPendingCount(
          pendingCountRef.current
        );

        /*
         * Start background save.
         */

        processScoreQueue();
      },
      [
        innings,
        popBoundary,
        processScoreQueue,
        match
      ]
    );

  /*
   * =========================================================
   * INSTANT SWAP
   * =========================================================
   */

  const fastSwapStrike =
    useCallback(async () => {
      if (
        actionBusyRef.current ||
        pendingCountRef.current >
          0
      ) {
        return;
      }

      const currentInnings =
        innings[
          innings.length - 1
        ];

      const current =
        currentInnings?.innings;

      if (!current) {
        return;
      }

      const previousState =
        optimisticRef.current ||
        visualStateRef.current ||
        {
          inningsId:
            current.id,

          total_runs:
            Number(
              current.total_runs ||
                0
            ),

          total_wickets:
            Number(
              current.total_wickets ||
                0
            ),

          total_balls:
            Number(
              current.total_balls ||
                0
            ),

          strikerId:
            current.striker_id,

          nonStrikerId:
            current.non_striker_id,

          activeBowlerId:
            current.current_bowler_id
        };

      if (
        !previousState.strikerId ||
        !previousState.nonStrikerId
      ) {
        return;
      }

      const nextState = {
        ...previousState,

        strikerId:
          previousState.nonStrikerId,

        nonStrikerId:
          previousState.strikerId,

        strikerStats:
          previousState.nonStrikerStats,

        nonStrikerStats:
          previousState.strikerStats
      };

      const previousFixed =
        fixedBatsmenRef.current;

      const nextFixed =
        previousFixed
          ? {
              ...previousFixed,

              strikerSide:
                previousFixed.strikerSide ===
                'left'
                  ? 'right'
                  : 'left'
            }
          : null;

      swapRollbackRef.current =
        {
          state: JSON.parse(
            JSON.stringify(
              previousState
            )
          ),

          fixed:
            previousFixed
              ? JSON.parse(
                  JSON.stringify(
                    previousFixed
                  )
                )
              : null
        };

      actionBusyRef.current =
        'swap';

      setActionBusy('swap');

      setError('');

      visualStateRef.current =
        nextState;

      optimisticRef.current =
        nextState;

      if (nextFixed) {
        fixedBatsmenRef.current =
          nextFixed;
      }

      flushSync(() => {
        setOptimistic(
          nextState
        );

        if (nextFixed) {
          setFixedBatsmen(
            nextFixed
          );
        }
      });

      try {
        await Innings.swapStrike(
          current.id
        );

        swapRollbackRef.current =
          null;

        /*
         * Background sync only.
         */

        Matches.get(matchId)
          .then((data) => {
            if (
              pendingCountRef.current ===
              0
            ) {
              applyServerData(data);
            }
          })
          .catch(() => {});
      } catch (err) {
        const rollback =
          swapRollbackRef.current;

        if (rollback) {
          visualStateRef.current =
            rollback.state;

          optimisticRef.current =
            rollback.state;

          fixedBatsmenRef.current =
            rollback.fixed;

          flushSync(() => {
            setOptimistic(
              rollback.state
            );

            setFixedBatsmen(
              rollback.fixed
            );
          });
        }

        setError(
          err?.response?.data
            ?.error ||
          err?.message ||
          'Unable to swap batsmen'
        );
      } finally {
        swapRollbackRef.current =
          null;

        actionBusyRef.current =
          null;

        setActionBusy(null);
      }
    }, [
      innings,
      matchId,
      applyServerData
    ]);

  /*
   * =========================================================
   * INSTANT UNDO
   * =========================================================
   */

  const fastUndo =
    useCallback(async () => {
      if (
        actionBusyRef.current ||
        pendingCountRef.current >
          0
      ) {
        return;
      }

      const currentInnings =
        innings[
          innings.length - 1
        ];

      const current =
        currentInnings?.innings;

      if (!current) {
        return;
      }

      const history =
        visualHistoryRef.current;

      if (!history.length) {
        setError(
          'Nothing to undo'
        );

        return;
      }

      const previous =
        history[
          history.length - 1
        ];

      const currentState =
        optimisticRef.current ||
        visualStateRef.current ||
        null;

      undoRollbackRef.current =
        {
          state:
            currentState
              ? JSON.parse(
                  JSON.stringify(
                    currentState
                  )
                )
              : null,

          fixed:
            fixedBatsmenRef.current
              ? JSON.parse(
                  JSON.stringify(
                    fixedBatsmenRef.current
                  )
                )
              : null
        };

      actionBusyRef.current =
        'undo';

      setActionBusy('undo');

      setError('');

      const restoredState =
        previous.state ||
        null;

      visualStateRef.current =
        restoredState;

      optimisticRef.current =
        restoredState;

      fixedBatsmenRef.current =
        previous.fixed ||
        null;

      flushSync(() => {
        setOptimistic(
          restoredState
        );

        setFixedBatsmen(
          previous.fixed ||
            null
        );
      });

      try {
        await Innings.undo(
          current.id
        );

        history.pop();

        undoRollbackRef.current =
          null;

        /*
         * Background sync.
         */

        Matches.get(matchId)
          .then((data) => {
            if (
              pendingCountRef.current ===
              0
            ) {
              applyServerData(data);
            }
          })
          .catch(() => {});
      } catch (err) {
        const rollback =
          undoRollbackRef.current;

        if (rollback?.state) {
          visualStateRef.current =
            rollback.state;

          optimisticRef.current =
            rollback.state;
        } else {
          visualStateRef.current =
            null;

          optimisticRef.current =
            null;
        }

        fixedBatsmenRef.current =
          rollback?.fixed ||
          null;

        flushSync(() => {
          setOptimistic(
            rollback?.state ||
              null
          );

          setFixedBatsmen(
            rollback?.fixed ||
              null
          );
        });

        setError(
          err?.response?.data
            ?.error ||
          err?.message ||
          'Unable to undo last ball'
        );
      } finally {
        undoRollbackRef.current =
          null;

        actionBusyRef.current =
          null;

        setActionBusy(null);
      }
    }, [
      innings,
      matchId,
      applyServerData
    ]);

  /*
   * =========================================================
   * START SECOND INNINGS
   *
   * This is kept as a fallback only.
   * Normally the separate target page handles this.
   * =========================================================
   */

  const startSecondInnings =
    useCallback(async () => {
      if (
        actionBusyRef.current
      ) {
        return;
      }

      actionBusyRef.current =
        'start';

      setActionBusy('start');

      setError('');

      try {
        await Matches.startSecondInnings(
          matchId
        );

        visualStateRef.current =
          null;

        optimisticRef.current =
          null;

        visualHistoryRef.current =
          [];

        fixedBatsmenRef.current =
          null;

        fixedBatsmenInningsRef.current =
          null;

        flushSync(() => {
          setOptimistic(null);
          setFixedBatsmen(null);
          setShowNextBowler(false);
        });

        await loadFull();
      } catch (err) {
        setError(
          err?.response?.data
            ?.error ||
          err?.message ||
          'Unable to start second innings'
        );
      } finally {
        actionBusyRef.current =
          null;

        setActionBusy(null);
      }
    }, [
      matchId,
      loadFull
    ]);

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
   * COMPLETED MATCH
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
   * FIRST INNINGS BREAK
   *
   * IMPORTANT:
   * No bowler selection here.
   * Target page is a separate route.
   * =========================================================
   */

  if (
    match.status ===
    'innings-break'
  ) {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3">

        <div className="text-emerald-400 font-semibold">
          Innings completed
        </div>

        <div className="text-slate-400 text-sm">
          Opening target screen…
        </div>

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
   * =========================================================
   * TARGET
   * =========================================================
   */

  const firstInnings =
    innings.find((item) => {
      const number =
        Number(
          item?.innings
            ?.innings_number ??
          item?.innings
            ?.innings_no ??
          item?.innings?.number
        );

      return number === 1;
    });

  const derivedTarget =
    Number(
      inn?.innings_number ??
        inn?.innings_no ??
        inn?.number
    ) === 2
      ? Number(
          firstInnings?.innings
            ?.total_runs || 0
        ) + 1
      : null;

  const displayTarget =
    inn.target != null
      ? Number(inn.target)
      : match.target != null
      ? Number(match.target)
      : match.target_score != null
      ? Number(match.target_score)
      : derivedTarget;

  /*
   * =========================================================
   * DISPLAY SCORE
   * =========================================================
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
          ) *
          6
        ).toFixed(2)
      : '0.00';

  /*
   * =========================================================
   * ACTIVE PLAYERS
   * =========================================================
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

  /*
   * OUT PLAYERS
   */

  const outIds =
    new Set(
      (
        currentInnings
          .battingCard ||
        []
      )
        .filter(
          (b) => b.is_out
        )
        .map(
          (b) => b.player_id
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
    optimistic
      ?.nonStrikerStats
      ?.is_out &&
    optimistic
      .nonStrikerStats
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
        String(p.id) ===
        String(
          effectiveStrikerId
        )
    );

  const nonStriker =
    players.find(
      (p) =>
        String(p.id) ===
        String(
          effectiveNonStrikerId
        )
    );

  const bowler =
    players.find(
      (p) =>
        String(p.id) ===
        String(
          effectiveBowlerId
        )
    );

  /*
   * =========================================================
   * NEED BATSMEN
   * =========================================================
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
                RR: {
                  displayRunRate
                }
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
          ) => {
            const nextStriker =
              selectedStriker ||
              effectiveStrikerId;

            const nextNonStriker =
              selectedNonStriker ||
              effectiveNonStrikerId;

            const previousFixed =
              fixedBatsmenRef.current;

            let leftPlayerId =
              previousFixed
                ?.leftPlayerId ??
              null;

            let rightPlayerId =
              previousFixed
                ?.rightPlayerId ??
              null;

            if (
              !leftPlayerId &&
              nextStriker &&
              String(
                nextStriker
              ) !==
                String(
                  rightPlayerId
                )
            ) {
              leftPlayerId =
                nextStriker;
            }

            if (
              !rightPlayerId &&
              nextStriker &&
              String(
                nextStriker
              ) !==
                String(
                  leftPlayerId
                )
            ) {
              rightPlayerId =
                nextStriker;
            }

            if (
              !leftPlayerId &&
              nextNonStriker &&
              String(
                nextNonStriker
              ) !==
                String(
                  rightPlayerId
                )
            ) {
              leftPlayerId =
                nextNonStriker;
            }

            if (
              !rightPlayerId &&
              nextNonStriker &&
              String(
                nextNonStriker
              ) !==
                String(
                  leftPlayerId
                )
            ) {
              rightPlayerId =
                nextNonStriker;
            }

            const battingCard =
              currentInnings
                .battingCard ||
              [];

            const getStats = (id) =>
              id
                ? battingCard.find(
                    (b) =>
                      String(
                        b.player_id
                      ) ===
                      String(id)
                  ) || {
                    player_id: id,
                    runs: 0,
                    balls: 0,
                    fours: 0,
                    sixes: 0,
                    strike_rate: 0
                  }
                : null;

            const nextFixed = {
              inningsId:
                inn.id,

              leftPlayerId,

              rightPlayerId,

              leftStats:
                getStats(
                  leftPlayerId
                ),

              rightStats:
                getStats(
                  rightPlayerId
                ),

              strikerSide:
                String(
                  nextStriker
                ) ===
                String(
                  leftPlayerId
                )
                  ? 'left'
                  : 'right'
            };

            fixedBatsmenRef.current =
              nextFixed;

            flushSync(() => {
              setFixedBatsmen(
                nextFixed
              );
            });

            (async () => {
              try {
                setError('');

                await Innings.setBatsmen(
                  inn.id,
                  {
                    striker_id:
                      nextStriker,

                    non_striker_id:
                      nextNonStriker
                  }
                );

                const bowlerAlreadySelected =
                  optimisticRef.current
                    ?.activeBowlerId ||
                  inn.current_bowler_id;

                if (
                  !bowlerAlreadySelected &&
                  !optimisticRef.current
                    ?.inningsCompleted &&
                  match.status !==
                    'innings-break' &&
                  match.status !==
                    'completed'
                ) {
                  setShowNextBowler(
                    true
                  );
                }

                Matches.get(matchId)
                  .then((data) => {
                    if (
                      pendingCountRef.current ===
                      0
                    ) {
                      applyServerData(
                        data
                      );
                    }
                  })
                  .catch(() => {});
              } catch (err) {
                setError(
                  err?.response?.data
                    ?.error ||
                    err?.message ||
                    'Unable to set batsmen'
                );
              }
            })();
          }}
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
   * =========================================================
   * FIXED BATSMAN CARDS
   * =========================================================
   */

  const battingCard =
    currentInnings.battingCard ||
    [];

  const getServerBattingStats =
    (playerId) => {
      if (!playerId) {
        return null;
      }

      return (
        battingCard.find(
          (b) =>
            String(b.player_id) ===
            String(playerId)
        ) || {
          player_id: playerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        }
      );
    };

  const fixedLeftId =
    fixedBatsmen?.leftPlayerId ??
    inn.striker_id;

  const fixedRightId =
    fixedBatsmen?.rightPlayerId ??
    inn.non_striker_id;

  const leftPlayer =
    players.find(
      (p) =>
        String(p.id) ===
        String(fixedLeftId)
    );

  const rightPlayer =
    players.find(
      (p) =>
        String(p.id) ===
        String(fixedRightId)
    );

  const leftStats =
    fixedBatsmen?.leftStats ||
    getServerBattingStats(
      fixedLeftId
    );

  const rightStats =
    fixedBatsmen?.rightStats ||
    getServerBattingStats(
      fixedRightId
    );

  const leftIsStriker =
    fixedBatsmen
      ? fixedBatsmen.strikerSide ===
        'left'
      : String(
          effectiveStrikerId
        ) ===
        String(fixedLeftId);

  const rightIsStriker =
    fixedBatsmen
      ? fixedBatsmen.strikerSide ===
        'right'
      : String(
          effectiveStrikerId
        ) ===
        String(fixedRightId);

  /*
   * =========================================================
   * BOWLER STATS
   * =========================================================
   */

  const serverBowlerStats =
    (
      currentInnings
        .bowlingCard || []
    ).find(
      (b) =>
        String(b.player_id) ===
        String(
          effectiveBowlerId
        )
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
    String(
      optimistic.bowlerStats
        .player_id
    ) ===
      String(
        effectiveBowlerId
      )
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

  /*
   * =========================================================
   * RECENT BALLS
   * =========================================================
   */

  const recentBalls =
    optimistic?.recentBalls ||
    currentInnings.recentBalls ||
    [];

  const overCompleted =
    displayTotalBalls > 0 &&
    displayTotalBalls % 6 ===
      0;

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
   * =========================================================
   * NEXT BOWLER
   * =========================================================
   */

  const needsNextBowler =
    !optimistic?.inningsCompleted &&
    (
      optimistic?.needsNextBowler ||
      (
        !effectiveBowlerId &&
        displayTotalBalls > 0 &&
        displayTotalBalls % 6 ===
          0
      )
    );

  /*
   * =========================================================
   * PARTNERSHIP
   * =========================================================
   */

  const partnership =
    optimistic?.partnership ||
    currentInnings.partnership ||
    {
      runs: 0,
      balls: 0
    };

  /*
   * =========================================================
   * RENDER
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

            {displayTarget !=
              null && (
              <div className="text-amber-300 font-semibold">
                Target:{' '}
                {displayTarget}
              </div>
            )}

            {pendingCount > 0 && (
              <div className="text-emerald-400 text-[10px] mt-1 font-medium">
                ● Syncing
              </div>
            )}

          </div>

        </div>

        {/* BATSMEN */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

          <BatsmanCard
            player={leftPlayer}
            stats={leftStats}
            striker={
              leftIsStriker
            }
          />

          <BatsmanCard
            player={rightPlayer}
            stats={rightStats}
            striker={
              rightIsStriker
            }
          />

        </div>

        {/* PARTNERSHIP */}

        <div className="mt-3 bg-slate-900/70 rounded-xl p-3 border border-slate-700">

          <div className="flex justify-between items-center">

            <div>

              <div className="text-xs text-slate-500 uppercase tracking-wide">
                Current Partnership
              </div>

              <div className="text-lg font-bold text-white mt-1">

                {partnership.runs ||
                  0}

                <span className="text-sm text-slate-400 font-normal">
                  {' '}
                  runs
                </span>

                {' · '}

                {partnership.balls ||
                  0}

                <span className="text-sm text-slate-400 font-normal">
                  {' '}
                  balls
                </span>

              </div>

            </div>

            <div className="text-2xl">
              🤝
            </div>

          </div>

        </div>

        {/* CURRENT BOWLER */}

        <div className="mt-2">

          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">

            <div className="flex justify-between items-center">

              <div>

                <div className="font-semibold text-white">
                  🎯{' '}
                  {bowler?.name ||
                    '—'}
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  CURRENT BOWLER
                </div>

              </div>

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

            </div>

          </div>

        </div>

        {/* FALL OF WICKETS */}

        <FallOfWickets
          wickets={
            optimistic?.fallOfWickets ||
            currentInnings.fallOfWickets ||
            []
          }
          players={players}
        />

        {/* CURRENT OVER */}

        <div className="mt-4 bg-slate-900/70 rounded-xl p-3">

          <div className="flex justify-between items-center mb-2">

            <h3 className="text-sm font-semibold text-slate-300">
              Current Over
            </h3>

            <span className="text-xs text-slate-500">
              Over{' '}
              {displayOverNumber +
                1}
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
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* =====================================================
          SCORING CONTROLS
          ===================================================== */}

      {!needsNextBowler &&
        !optimistic?.inningsCompleted && (
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
                  {displayTotalBalls %
                    6}
                  /6
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
                  className="h-10 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 font-semibold text-sm active:scale-95 transition-transform"
                  onClick={
                    fastSwapStrike
                  }
                  disabled={
                    pendingCount >
                      0 ||
                    !!actionBusy
                  }
                >
                  ⇄ Swap
                </button>

                <button
                  className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm active:scale-95 transition-transform"
                  onClick={() =>
                    setShowWicket(
                      true
                    )
                  }
                  disabled={
                    pendingCount >
                    0
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
                className="btn btn-secondary"
                disabled={
                  pendingCount >
                    0 ||
                  !!actionBusy ||
                  visualHistoryRef
                    .current
                    .length === 0
                }
                onClick={
                  fastUndo
                }
              >
                {actionBusy ===
                'undo'
                  ? '↺ Undoing…'
                  : '↺ Undo'}
              </button>

              <button
                className="btn btn-secondary"
                disabled={
                  pendingCount >
                    0 ||
                  !!actionBusy
                }
                onClick={
                  fastSwapStrike
                }
              >
                {actionBusy ===
                'swap'
                  ? '⇄ Swapping…'
                  : '⇄ Swap Batsmen'}
              </button>

            </div>

          </>
        )}

      {/* =====================================================
          SCOREBOARD
          ===================================================== */}

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
          NEXT BOWLER
          ===================================================== */}

      {showNextBowler &&
        !optimistic?.inningsCompleted &&
        match.status !==
          'innings-break' &&
        match.status !==
          'completed' &&
        (
          needsNextBowler ||
          !effectiveBowlerId
        ) && (
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

                  inningsId:
                    inn.id,

                  activeBowlerId:
                    bowlerId,

                  needsNextBowler:
                    false,

                  inningsCompleted:
                    false,

                  bowlerBalls: 0,

                  bowlerStats: {
                    player_id:
                      bowlerId,

                    overs: '0.0',

                    maidens: 0,

                    runs: 0,

                    wickets: 0,

                    economy: 0
                  }
                };

                optimisticRef.current =
                  nextState;

                visualStateRef.current =
                  nextState;

                setOptimistic(
                  nextState
                );

                setShowNextBowler(
                  false
                );

                Matches.get(matchId)
                  .then((data) => {
                    if (
                      pendingCountRef.current ===
                      0
                    ) {
                      applyServerData(
                        data
                      );
                    }
                  })
                  .catch(() => {});
              } catch (err) {
                setError(
                  err?.response?.data
                    ?.error ||
                    err?.message ||
                    'Unable to select bowler'
                );
              }
            }}
          />
        )}

      {/* =====================================================
          WICKET MODAL
          ===================================================== */}

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

              is_wicket: true,

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
 * =========================================================
 * BATSMAN CARD
 * =========================================================
 */

function BatsmanCard({
  player,
  stats,
  striker = false
}) {
  return (
    <div
      className={`bg-slate-900/70 rounded-xl p-3 border ${
        striker
          ? 'border-emerald-500/60'
          : 'border-slate-700'
      }`}
    >

      <div className="flex justify-between items-center">

        <div className="font-semibold text-white">

          🏏 {player?.name || '—'}

          {striker && (
            <span className="text-emerald-400 ml-1">
              ●
            </span>
          )}

        </div>

        {striker && (
          <span
            className="text-emerald-400 text-sm font-bold"
            title="Striker"
            aria-label="Striker"
          >
            🏏
          </span>
        )}

      </div>

      <div className="mt-2 flex items-center gap-4 flex-wrap">

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
            stats?.strike_rate ??
            0
          }
          label="SR"
        />

      </div>

    </div>
  );
}

/*
 * =========================================================
 * NEXT BOWLER MODAL
 * =========================================================
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
                players={team}
                value={bowler}
                onChange={
                  setBowler
                }
                teamId={teamId}
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
              disabled={!bowler}
              onClick={() =>
                onSelect(bowler)
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
 * =========================================================
 * FALL OF WICKETS
 * =========================================================
 */

function FallOfWickets({
  wickets,
  players
}) {
  if (
    !wickets ||
    wickets.length === 0
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
          (item, index) => {
            const player =
              players.find(
                (p) =>
                  String(
                    p.id
                  ) ===
                  String(
                    item.player_id
                  )
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
                      {
                        item.wicket_type ||
                        'Wicket'
                      }

                      {item.overs !=
                        null &&
                        ` · ${item.overs} ov`}
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
 * =========================================================
 * STAT
 * =========================================================
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
 * =========================================================
 * BOWLING STAT
 * =========================================================
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
 * =========================================================
 * BALL DISPLAY
 * =========================================================
 */

function BallDisplay({
  ball
}) {
  let label =
    String(
      ball.runs_batsman ?? 0
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
 * =========================================================
 * BATSMEN SELECTION
 * =========================================================
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

  const [
    nonStriker,
    setNonStriker
  ] = useState(null);

  const available =
    team.filter(
      (player) =>
        !outIds.has(player.id)
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

  const canConfirm =
    (hasStriker ||
      strikerId) &&
    (hasNonStriker ||
      nonStrikerId);

  const handleConfirm =
    () => {
      if (!canConfirm) {
        return;
      }

      onSelect(
        hasStriker
          ? null
          : strikerId,

        hasNonStriker
          ? null
          : nonStrikerId
      );
    };

  return (
    <div className="card space-y-4 fade-in">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-xl font-bold">
            {hasStriker ||
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
            players={available}
            value={striker}
            onChange={
              setStriker
            }
            teamId={teamId}
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
              strikerId
                ? [strikerId]
                : []
            }
            placeholder="Type or add non-striker's name…"
          />

        </div>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!canConfirm}
        onClick={
          handleConfirm
        }
      >
        Confirm
      </button>

    </div>
  );
}
