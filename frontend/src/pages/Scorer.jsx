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

  /*
  ============================================================
  ACTION QUEUE

  Every scoring action is processed in exact order.

  ball
  swap
  undo

  This prevents race conditions when the user clicks quickly.
  ============================================================
  */

  const actionQueueRef = useRef([]);
  const processingQueueRef = useRef(false);

  const pendingCountRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  /*
  ============================================================
  UNDO HISTORY

  Stores the screen state before every ball.

  This allows Undo to happen visually immediately.
  ============================================================
  */

  const undoHistoryRef = useRef([]);

  /*
  Latest socket data.

  While requests are pending, socket updates are stored instead
  of replacing optimistic UI.
  ============================================================
  */

  const latestSocketDataRef = useRef(null);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  const undoPreservedRef = useRef({
    active: false,
    bowlerId: null,
    strikerId: null,
    nonStrikerId: null
  });

  const clearUndoPreservation = useCallback(() => {
    undoPreservedRef.current = {
      active: false,
      bowlerId: null,
      strikerId: null,
      nonStrikerId: null
    };
  }, []);

  const safeArray = useCallback((value) => {
    return Array.isArray(value) ? value : [];
  }, []);

  const getPlayerId = useCallback((player) => {
    if (!player) return null;

    if (typeof player === 'string') {
      return player;
    }

    if (typeof player === 'object') {
      return player.id || null;
    }

    return null;
  }, []);

  const getBowlerId = useCallback((inn) => {
    if (!inn || typeof inn !== 'object') {
      return null;
    }

    return (
      inn.current_bowler_id ??
      inn.bowler_id ??
      inn.currentBowlerId ??
      inn.current_bowler ??
      null
    );
  }, []);

  const getBowlerBallsFromStats = useCallback((stats) => {
    if (!stats || typeof stats !== 'object') {
      return 0;
    }

    if (
      stats.balls != null &&
      Number.isFinite(Number(stats.balls))
    ) {
      return Number(stats.balls);
    }

    const oversText = String(stats.overs ?? '0.0');

    const parts = oversText.split('.');

    const completedOvers =
      Number(parts[0]) || 0;

    const ballsInCurrentOver =
      Number(parts[1]) || 0;

    return (
      completedOvers * 6 +
      ballsInCurrentOver
    );
  }, []);

  const getCurrentInningsEntry = useCallback(() => {
    const list =
      Array.isArray(innings)
        ? innings
        : [];

    return list[list.length - 1] || null;
  }, [innings]);

  /*
  ============================================================
  INNINGS COMPLETION CHECK
  ============================================================
  */

  const isInningsCompleteFor = useCallback(
    ({
      inningsData,
      totalRuns,
      totalBalls,
      totalWickets
    }) => {
      if (
        !inningsData ||
        typeof inningsData !== 'object'
      ) {
        return false;
      }

      const runs =
        Number(
          totalRuns ??
          inningsData.total_runs ??
          0
        );

      const balls =
        Number(
          totalBalls ??
          inningsData.total_balls ??
          0
        );

      const wickets =
        Number(
          totalWickets ??
          inningsData.total_wickets ??
          0
        );

      /*
      Already marked complete by backend.
      */

      if (
        inningsData.completed === true ||
        inningsData.is_completed === true ||
        inningsData.status === 'completed' ||
        inningsData.status === 'complete' ||
        inningsData.innings_status === 'completed'
      ) {
        return true;
      }

      /*
      Target reached.
      */

      if (
        inningsData.target != null &&
        Number(inningsData.target) > 0 &&
        runs >= Number(inningsData.target)
      ) {
        return true;
      }

      /*
      Overs completed.
      */

      const oversLimit =
        Number(
          inningsData.overs_limit ??
          match?.overs_limit ??
          0
        );

      if (
        oversLimit > 0 &&
        balls >= oversLimit * 6
      ) {
        return true;
      }

      /*
      All out.

      If player list is known, a normal innings ends after
      batting players - 1 wickets.
      */

      const battingTeamId =
        inningsData.batting_team_id;

      if (battingTeamId != null) {
        const battingPlayerCount =
          safeArray(players).filter(
            player =>
              String(player?.team_id) ===
              String(battingTeamId)
          ).length;

        if (
          battingPlayerCount > 1 &&
          wickets >= battingPlayerCount - 1
        ) {
          return true;
        }
      }

      /*
      Backend may expose max_wickets.
      */

      if (
        inningsData.max_wickets != null &&
        wickets >= Number(inningsData.max_wickets)
      ) {
        return true;
      }

      return false;
    },
    [match?.overs_limit, players, safeArray]
  );

  /*
  ============================================================
  APPLY SERVER DATA
  ============================================================
  */

  const applyServerData = useCallback(
    (data) => {
      if (
        !data ||
        typeof data !== 'object'
      ) {
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
      If backend returns a new innings, close all old
      bowler dialogs immediately.
      */

      const lastEntry =
        nextInnings[
          nextInnings.length - 1
        ];

      const lastInn =
        lastEntry?.innings;

      const completed =
        isInningsCompleteFor({
          inningsData: lastInn,
          totalRuns:
            lastInn?.total_runs,
          totalBalls:
            lastInn?.total_balls,
          totalWickets:
            lastInn?.total_wickets
        });

      if (completed) {
        setShowNextBowler(false);
      }

      /*
      Preserve undo state only when explicitly required.
      */

      const preserved =
        undoPreservedRef.current;

      if (
        preserved?.active &&
        nextInnings.length > 0
      ) {
        const lastIndex =
          nextInnings.length - 1;

        const entry =
          nextInnings[lastIndex];

        if (entry?.innings) {
          const patchedInn = {
            ...entry.innings
          };

          if (
            preserved.bowlerId &&
            !getBowlerId(patchedInn)
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

          nextInnings =
            [...nextInnings];

          nextInnings[lastIndex] = {
            ...entry,
            innings: patchedInn
          };
        }
      }

      setInnings(nextInnings);

      optimisticRef.current = null;
      setOptimistic(null);

      /*
      New innings => clear old undo history.
      */

      if (
        nextInnings.length > 0
      ) {
        const current =
          nextInnings[
            nextInnings.length - 1
          ];

        const currentId =
          current?.innings?.id;

        if (currentId != null) {
          undoHistoryRef.current =
            undoHistoryRef.current.filter(
              item =>
                String(item.inningsId) ===
                String(currentId)
            );
        }
      }
    },
    [
      getBowlerId,
      isInningsCompleteFor
    ]
  );

  /*
  ============================================================
  LOAD MATCH
  ============================================================
  */

  const loadFull = useCallback(
    async () => {
      try {
        /*
        Do not replace optimistic state while actions are
        waiting.
        */

        if (
          pendingCountRef.current > 0
        ) {
          return;
        }

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
    },
    [
      matchId,
      applyServerData
    ]
  );

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
  ============================================================
  PLAYER CREATED
  ============================================================
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
              String(p?.id) ===
              String(player.id)
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
  ============================================================
  SOCKET
  ============================================================
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
      const data = {
        match: updatedMatch,
        innings: updatedInnings
      };

      latestSocketDataRef.current =
        data;

      /*
      Do not destroy optimistic UI while saving.
      */

      if (
        pendingCountRef.current > 0
      ) {
        return;
      }

      if (
        updatedMatch &&
        typeof updatedMatch === 'object'
      ) {
        setMatch(updatedMatch);
      }

      if (
        Array.isArray(updatedInnings)
      ) {
        setInnings(updatedInnings);
      }

      optimisticRef.current = null;
      setOptimistic(null);

      /*
      A completed innings must never open the
      next-bowler modal.
      */

      const latest =
        Array.isArray(updatedInnings)
          ? updatedInnings[
              updatedInnings.length - 1
            ]
          : null;

      const latestInn =
        latest?.innings;

      if (
        isInningsCompleteFor({
          inningsData: latestInn,
          totalRuns:
            latestInn?.total_runs,
          totalBalls:
            latestInn?.total_balls,
          totalWickets:
            latestInn?.total_wickets
        })
      ) {
        setShowNextBowler(false);
        setShowInitialBowler(false);
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
  }, [
    matchId,
    isInningsCompleteFor
  ]);

  /*
  ============================================================
  CLEANUP
  ============================================================
  */

  useEffect(() => {
    return () => {
      clearTimeout(
        boundaryTimer.current
      );

      clearTimeout(
        wicketTimer.current
      );

      actionQueueRef.current = [];

      processingQueueRef.current =
        false;
    };
  }, []);

  /*
  ============================================================
  BOUNDARY
  ============================================================
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

  /*
  ============================================================
  WICKET FLASH
  ============================================================
  */

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
  ============================================================
  SAFE CURRENT DATA
  ============================================================
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
  ============================================================
  EFFECTIVE PLAYERS
  ============================================================
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

  const earlyServerBowlerId =
    getBowlerId(earlyInn);

  const earlyBowlerId =
    optimistic?.activeBowlerId ??
    earlyServerBowlerId ??
    undoPreservedRef.current?.bowlerId ??
    null;

  const earlyTotalBalls =
    optimistic?.total_balls ??
    Number(
      earlyInn?.total_balls || 0
    );

  const hasEarlyBatsmen =
    !!earlyStrikerId &&
    !!earlyNonStrikerId;

  const noEarlyBowler =
    !earlyBowlerId;

  const earlyBalls =
    Number(
      earlyTotalBalls || 0
    );

  const isFirstBall =
    earlyBalls === 0;

  const isCompletedOver =
    earlyBalls > 0 &&
    earlyBalls % 6 === 0;

  const earlyInningsComplete =
    isInningsCompleteFor({
      inningsData: earlyInn,
      totalRuns:
        optimistic?.total_runs ??
        earlyInn?.total_runs,
      totalBalls:
        optimistic?.total_balls ??
        earlyInn?.total_balls,
      totalWickets:
        optimistic?.total_wickets ??
        earlyInn?.total_wickets
    });

  /*
  ============================================================
  INITIAL BOWLER / NEXT BOWLER CONDITIONS
  ============================================================
  */

  const shouldSelectInitialBowler =
    hasEarlyBatsmen &&
    noEarlyBowler &&
    isFirstBall &&
    !earlyInningsComplete &&
    !undoPreservedRef.current?.active;

  const shouldSelectNextBowler =
    hasEarlyBatsmen &&
    noEarlyBowler &&
    isCompletedOver &&
    !earlyInningsComplete &&
    !undoPreservedRef.current?.active;

  useEffect(() => {
    if (
      shouldSelectInitialBowler &&
      !showInitialBowler &&
      !showNextBowler
    ) {
      setShowNextBowler(false);
      setShowInitialBowler(true);
    }
  }, [
    shouldSelectInitialBowler,
    showInitialBowler,
    showNextBowler
  ]);

  useEffect(() => {
    if (
      shouldSelectNextBowler &&
      !showNextBowler &&
      !showInitialBowler
    ) {
      setShowInitialBowler(false);
      setShowNextBowler(true);
    }
  }, [
    shouldSelectNextBowler,
    showNextBowler,
    showInitialBowler
  ]);

  useEffect(() => {
    if (
      optimistic?.needsNextBowler &&
      !optimistic?.inningsComplete &&
      !earlyInningsComplete &&
      Number(
        optimistic?.total_balls || 0
      ) > 0 &&
      Number(
        optimistic?.total_balls || 0
      ) % 6 === 0
    ) {
      setShowInitialBowler(false);
      setShowNextBowler(true);
    }
  }, [
    optimistic?.needsNextBowler,
    optimistic?.inningsComplete,
    optimistic?.total_balls,
    earlyInningsComplete
  ]);

  /*
  ============================================================
  BUILD OPTIMISTIC BALL
  ============================================================
  */

  const buildOptimisticBall =
    useCallback(
      ({
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
          getBowlerId(current);

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
          payload?.extra_type ||
          null;

        const isWicket =
          !!payload?.is_wicket;

        const legal =
          extraType === 'wide' ||
          extraType === 'noball'
            ? false
            : true;

        let teamRuns = 0;

        if (
          extraType === 'wide'
        ) {
          teamRuns =
            extraRuns;
        } else if (
          extraType === 'noball'
        ) {
          teamRuns =
            extraRuns + runs;
        } else if (
          extraType === 'bye' ||
          extraType === 'legbye'
        ) {
          teamRuns =
            extraRuns;
        } else {
          teamRuns =
            runs;
        }

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
        ========================================================
        BATTING STATS
        ========================================================
        */

        const serverBattingStatsMap = {};

        safeArray(
          currentInnings?.battingCard
        ).forEach(stat => {
          if (
            stat?.player_id != null
          ) {
            serverBattingStatsMap[
              String(stat.player_id)
            ] = stat;
          }
        });

        const battingStatsById = {
          ...serverBattingStatsMap,
          ...(
            previousOptimistic?.battingStatsById ||
            {}
          )
        };

        const previousStrikerStats =
          battingStatsById[
            String(strikerId)
          ] || {
            player_id:
              strikerId,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            strike_rate: 0
          };

        const previousNonStrikerStats =
          battingStatsById[
            String(nonStrikerId)
          ] || {
            player_id:
              nonStrikerId,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            strike_rate: 0
          };

        let strikerRuns =
          Number(
            previousStrikerStats.runs ||
            0
          );

        let strikerBalls =
          Number(
            previousStrikerStats.balls ||
            0
          );

        let strikerFours =
          Number(
            previousStrikerStats.fours ||
            0
          );

        let strikerSixes =
          Number(
            previousStrikerStats.sixes ||
            0
          );

        /*
        Batter gets ball only when it is not wide.
        Bye/legbye still count as a legal ball.
        */

        if (
          extraType !== 'wide' &&
          extraType !== 'bye' &&
          extraType !== 'legbye'
        ) {
          strikerRuns +=
            runs;

          if (legal) {
            strikerBalls +=
              1;
          }

          if (runs === 4) {
            strikerFours +=
              1;
          }

          if (runs === 6) {
            strikerSixes +=
              1;
          }
        } else if (
          legal
        ) {
          strikerBalls +=
            1;
        }

        const strikerSR =
          strikerBalls > 0
            ? (
                (
                  strikerRuns /
                  strikerBalls
                ) * 100
              ).toFixed(2)
            : '0.00';

        const updatedStrikerStats = {
          ...previousStrikerStats,
          player_id:
            strikerId,
          runs:
            strikerRuns,
          balls:
            strikerBalls,
          fours:
            strikerFours,
          sixes:
            strikerSixes,
          strike_rate:
            Number(strikerSR)
        };

        const updatedNonStrikerStats = {
          ...previousNonStrikerStats,
          player_id:
            nonStrikerId
        };

        battingStatsById[
          String(strikerId)
        ] =
          updatedStrikerStats;

        battingStatsById[
          String(nonStrikerId)
        ] =
          updatedNonStrikerStats;

        /*
        ========================================================
        BOWLING STATS
        ========================================================
        */

        const serverBowlerStats =
          currentInnings?.bowlingCard?.find(
            b =>
              String(
                b?.player_id
              ) ===
              String(
                scoringBowlerId
              )
          ) || null;

        const sameOptimisticBowler =
          previousOptimistic?.activeBowlerId &&
          String(
            previousOptimistic.activeBowlerId
          ) ===
          String(
            scoringBowlerId
          );

        const previousBowlerStats =
          sameOptimisticBowler &&
          previousOptimistic?.bowlerStats
            ? previousOptimistic.bowlerStats
            : (
                serverBowlerStats || {
                  player_id:
                    scoringBowlerId,
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
              );

        const previousBowlerBalls =
          sameOptimisticBowler
            ? Number(
                previousOptimistic.bowlerBalls ??
                getBowlerBallsFromStats(
                  previousBowlerStats
                )
              )
            : getBowlerBallsFromStats(
                previousBowlerStats
              );

        const newBowlerBalls =
          previousBowlerBalls +
          (legal ? 1 : 0);

        const bowlerRuns =
          Number(
            previousBowlerStats.runs ||
            0
          ) +
          (
            extraType === 'bye' ||
            extraType === 'legbye'
              ? 0
              : teamRuns
          );

        const bowlerWickets =
          Number(
            previousBowlerStats.wickets ||
            0
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
            ? Number(
                (
                  bowlerRuns /
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
            `${completedOvers}.${ballsInOver}`,
          runs:
            bowlerRuns,
          wickets:
            bowlerWickets,
          economy
        };

        /*
        ========================================================
        STRIKE
        ========================================================
        */

        let nextStrikerId =
          strikerId;

        let nextNonStrikerId =
          nonStrikerId;

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

        const overCompleted =
          legal &&
          newTotalBalls > 0 &&
          newTotalBalls % 6 === 0;

        /*
        At end of over, batsmen swap.
        */

        if (
          overCompleted
        ) {
          const temp =
            nextStrikerId;

          nextStrikerId =
            nextNonStrikerId;

          nextNonStrikerId =
            temp;
        }

        /*
        ========================================================
        INNINGS COMPLETE
        ========================================================
        */

        const inningsComplete =
          isInningsCompleteFor({
            inningsData:
              currentInnings,
            totalRuns:
              newTotalRuns,
            totalBalls:
              newTotalBalls,
            totalWickets:
              newTotalWickets
          });

        const needsNextBowler =
          overCompleted &&
          !inningsComplete;

        /*
        ========================================================
        DISMISSAL
        ========================================================
        */

        if (
          isWicket &&
          payload?.dismissed_id
        ) {
          const dismissedKey =
            String(
              payload.dismissed_id
            );

          if (
            battingStatsById[
              dismissedKey
            ]
          ) {
            battingStatsById[
              dismissedKey
            ] = {
              ...battingStatsById[
                dismissedKey
              ],
              is_out:
                true
            };
          }
        }

        /*
        ========================================================
        RECENT BALLS
        ========================================================
        */

        const oldRecentBalls =
          previousOptimistic?.recentBalls ||
          currentInnings?.recentBalls ||
          [];

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

        const newRecentBalls =
          [
            ...safeArray(
              oldRecentBalls
            ),
            ballObject
          ].slice(-18);

        /*
        ========================================================
        PARTNERSHIP
        ========================================================
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
              oldPartnership.runs ||
              0
            ) +
            teamRuns,

          balls:
            Number(
              oldPartnership.balls ||
              0
            ) +
            (
              legal
                ? 1
                : 0
            )
        };

        /*
        ========================================================
        EXTRAS
        ========================================================
        */

        const oldExtras =
          previousOptimistic?.extras ||
          currentInnings?.extras ||
          {};

        const newExtras = {
          wide:
            Number(
              oldExtras.wide || 0
            ),

          noball:
            Number(
              oldExtras.noball || 0
            ),

          bye:
            Number(
              oldExtras.bye || 0
            ),

          legbye:
            Number(
              oldExtras.legbye || 0
            ),

          penalty:
            Number(
              oldExtras.penalty || 0
            )
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
        ========================================================
        FALL OF WICKETS
        ========================================================
        */

        const oldFOW =
          previousOptimistic?.fallOfWickets ||
          currentInnings?.fallOfWickets ||
          [];

        const newFallOfWickets =
          isWicket
            ? [
                ...safeArray(oldFOW),
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
            ]
            : oldFOW;

        const runRate =
          newTotalBalls > 0
            ? (
                newTotalRuns /
                (
                  newTotalBalls / 6
                )
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

          inningsComplete,

          bowlerStats:
            updatedBowlerStats,

          bowlerBalls:
            newBowlerBalls,

          strikerStats:
            updatedStrikerStats,

          nonStrikerStats:
            updatedNonStrikerStats,

          battingStatsById,

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
      },
      [
        safeArray,
        getBowlerId,
        getBowlerBallsFromStats,
        isInningsCompleteFor
      ]
    );

  /*
  ============================================================
  PROCESS ACTION QUEUE
  ============================================================
  */

  const processActionQueue =
    useCallback(
      async () => {
        if (
          processingQueueRef.current
        ) {
          return;
        }

        processingQueueRef.current =
          true;

        while (
          actionQueueRef.current.length >
          0
        ) {
          const item =
            actionQueueRef.current.shift();

          if (!item) {
            continue;
          }

          try {
            /*
            ====================================================
            BALL
            ====================================================
            */

            if (
              item.type === 'ball'
            ) {
              await Innings.ball(
                item.inningsId,
                item.payload
              );
            }

            /*
            ====================================================
            SWAP
            ====================================================
            */

            else if (
              item.type === 'swap'
            ) {
              await Innings.swapStrike(
                item.inningsId
              );
            }

            /*
            ====================================================
            UNDO
            ====================================================
            */

            else if (
              item.type === 'undo'
            ) {
              await Innings.undo(
                item.inningsId
              );

              /*
              Backend/socket will provide the authoritative
              score. We intentionally don't block the UI.
              */
            }

            pendingCountRef.current =
              Math.max(
                0,
                pendingCountRef.current - 1
              );

            setPendingCount(
              pendingCountRef.current
            );

            /*
            ====================================================
            FINAL INNINGS BALL

            Refresh immediately after the final ball so that
            the second innings can appear.
            ====================================================
            */

            if (
              item.type === 'ball' &&
              item.inningsComplete
            ) {
              try {
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
              } catch (refreshError) {
                console.warn(
                  'Unable to refresh after innings completion:',
                  refreshError
                );
              }
            }
          } catch (err) {
            console.error(
              'Action queue error:',
              err
            );

            setError(
              err?.response?.data?.error ||
              err?.response?.data?.message ||
              err?.message ||
              'Unable to save action'
            );

            /*
            Clear remaining queue because backend state may
            no longer match optimistic state.
            */

            actionQueueRef.current =
              [];

            pendingCountRef.current =
              0;

            setPendingCount(0);

            optimisticRef.current =
              null;

            setOptimistic(null);

            try {
              const data =
                await Matches.get(
                  matchId
                );

              applyServerData(
                data
              );
            } catch (_) {}

            break;
          }
        }

        processingQueueRef.current =
          false;

        /*
        ========================================================
        QUEUE FINISHED

        Apply latest socket data if available.
        ========================================================
        */

        if (
          pendingCountRef.current ===
          0
        ) {
          const socketData =
            latestSocketDataRef.current;

          if (
            socketData &&
            Array.isArray(
              socketData.innings
            )
          ) {
            const latest =
              socketData.innings[
                socketData.innings.length - 1
              ];

            const latestInn =
              latest?.innings;

            const complete =
              isInningsCompleteFor({
                inningsData:
                  latestInn,
                totalRuns:
                  latestInn?.total_runs,
                totalBalls:
                  latestInn?.total_balls,
                totalWickets:
                  latestInn?.total_wickets
              });

            if (
              socketData.match
            ) {
              setMatch(
                socketData.match
              );
            }

            setInnings(
              socketData.innings
            );

            if (complete) {
              setShowNextBowler(false);
              setShowInitialBowler(false);
            }

            latestSocketDataRef.current =
              null;

            /*
            If there is no next innings yet, a final refresh
            is useful. This only happens when queue is empty.
            */

            if (
              complete &&
              socketData.innings.length ===
                safeInnings.length
            ) {
              try {
                const fresh =
                  await Matches.get(
                    matchId
                  );

                if (
                  pendingCountRef.current ===
                  0
                ) {
                  applyServerData(
                    fresh
                  );
                }
              } catch (_) {}
            }
          }
        }
      },
      [
        matchId,
        applyServerData,
        isInningsCompleteFor,
        safeInnings.length
      ]
    );

  /*
  ============================================================
  PLAY BALL
  ============================================================
  */

  const playBall =
    useCallback(
      (payload) => {
        if (
          undoPreservedRef.current?.active
        ) {
          clearUndoPreservation();
        }

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

        /*
        Do not allow scoring after innings completion.
        */

        const alreadyComplete =
          isInningsCompleteFor({
            inningsData:
              currentInn,
            totalRuns:
              optimisticRef.current?.total_runs ??
              currentInn.total_runs,
            totalBalls:
              optimisticRef.current?.total_balls ??
              currentInn.total_balls,
            totalWickets:
              optimisticRef.current?.total_wickets ??
              currentInn.total_wickets
          });

        if (alreadyComplete) {
          setShowNextBowler(false);
          setShowInitialBowler(false);
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
          getBowlerId(currentInn);

        /*
        If previous ball completed the over, wait for
        bowler selection.
        */

        if (
          optimisticRef.current?.needsNextBowler
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
            const balls =
              Number(
                currentInn.total_balls || 0
              );

            setShowInitialBowler(
              balls === 0
            );

            setShowNextBowler(
              balls > 0 &&
              balls % 6 === 0 &&
              !alreadyComplete
            );
          }

          return;
        }

        /*
        Boundary animation.
        */

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

        /*
        ========================================================
        SAVE UNDO SNAPSHOT BEFORE BALL
        ========================================================
        */

        undoHistoryRef.current.push({
          inningsId:
            currentInn.id,

          serverEntry:
            current,

          previousOptimistic:
            optimisticRef.current
        });

        /*
        Keep history reasonably small.
        */

        if (
          undoHistoryRef.current.length >
          30
        ) {
          undoHistoryRef.current =
            undoHistoryRef.current.slice(-30);
        }

        /*
        ========================================================
        OPTIMISTIC BALL
        ========================================================
        */

        const nextOptimistic =
          buildOptimisticBall({
            current:
              currentInn,

            currentInnings:
              current,

            payload,

            previousOptimistic:
              optimisticRef.current
          });

        optimisticRef.current =
          nextOptimistic;

        setOptimistic(
          nextOptimistic
        );

        /*
        If innings ended, don't show bowler selection.
        */

        if (
          nextOptimistic.inningsComplete
        ) {
          setShowInitialBowler(false);
          setShowNextBowler(false);
        }

        /*
        ========================================================
        QUEUE BALL
        ========================================================
        */

        actionQueueRef.current.push({
          type:
            'ball',

          inningsId:
            currentInn.id,

          payload,

          inningsComplete:
            nextOptimistic.inningsComplete
        });

        pendingCountRef.current +=
          1;

        setPendingCount(
          pendingCountRef.current
        );

        processActionQueue();
      },
      [
        innings,
        getBowlerId,
        buildOptimisticBall,
        processActionQueue,
        clearUndoPreservation,
        popBoundary,
        isInningsCompleteFor
      ]
    );

  /*
  ============================================================
  INSTANT SWAP BATSMEN
  ============================================================
  */

  const handleSwapStrike =
    useCallback(() => {
      const safeCurrentInningsList =
        Array.isArray(innings)
          ? innings
          : [];

      const current =
        safeCurrentInningsList[
          safeCurrentInningsList.length - 1
        ];

      if (
        !current?.innings
      ) {
        return;
      }

      const inn =
        current.innings;

      const strikerId =
        optimisticRef.current?.strikerId ??
        inn.striker_id;

      const nonStrikerId =
        optimisticRef.current?.nonStrikerId ??
        inn.non_striker_id;

      if (
        !strikerId ||
        !nonStrikerId
      ) {
        return;
      }

      /*
      ========================================================
      INSTANT UI CHANGE

      Do not wait for API.
      ========================================================
      */

      const nextState = {
        ...(optimisticRef.current || {}),

        strikerId:
          nonStrikerId,

        nonStrikerId:
          strikerId
      };

      optimisticRef.current =
        nextState;

      setOptimistic(
        nextState
      );

      /*
      ========================================================
      QUEUE BACKEND SWAP

      If a ball is currently saving, the swap waits behind it.
      ========================================================
      */

      actionQueueRef.current.push({
        type:
          'swap',

        inningsId:
          inn.id
      });

      pendingCountRef.current +=
        1;

      setPendingCount(
        pendingCountRef.current
      );

      processActionQueue();
    }, [
      innings,
      processActionQueue
    ]);

  /*
  ============================================================
  INSTANT UNDO
  ============================================================
  */

  const handleUndo =
    useCallback(() => {
      const safeCurrentInningsList =
        Array.isArray(innings)
          ? innings
          : [];

      const current =
        safeCurrentInningsList[
          safeCurrentInningsList.length - 1
        ];

      if (
        !current?.innings
      ) {
        return;
      }

      const undoInn =
        current.innings;

      /*
      Find the latest ball for this innings.
      */

      let historyIndex = -1;

      for (
        let i =
          undoHistoryRef.current.length - 1;
        i >= 0;
        i--
      ) {
        if (
          String(
            undoHistoryRef.current[i]?.inningsId
          ) ===
          String(
            undoInn.id
          )
        ) {
          historyIndex = i;
          break;
        }
      }

      const history =
        historyIndex >= 0
          ? undoHistoryRef.current[
              historyIndex
            ]
          : null;

      /*
      Remove that undo snapshot.
      */

      if (
        historyIndex >= 0
      ) {
        undoHistoryRef.current.splice(
          historyIndex,
          1
        );
      }

      /*
      ========================================================
      INSTANT ROLLBACK
      ========================================================
      */

      if (history) {
        if (
          history.serverEntry
        ) {
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

            const next =
              [...safePrev];

            const lastIndex =
              next.length - 1;

            next[lastIndex] = {
              ...history.serverEntry
            };

            return next;
          });
        }

        optimisticRef.current =
          history.previousOptimistic ||
          null;

        setOptimistic(
          history.previousOptimistic ||
          null
        );
      }

      /*
      Close bowler dialog immediately.
      */

      setShowNextBowler(false);
      setShowInitialBowler(false);
      setError('');

      /*
      ========================================================
      QUEUE BACKEND UNDO

      If balls are currently saving, the undo waits until
      those balls are completed. This prevents database races.
      ========================================================
      */

      actionQueueRef.current.push({
        type:
          'undo',

        inningsId:
          undoInn.id
      });

      pendingCountRef.current +=
        1;

      setPendingCount(
        pendingCountRef.current
      );

      processActionQueue();
    }, [
      innings,
      processActionQueue
    ]);

  /*
  ============================================================
  SIMPLE ACT HELPER
  ============================================================
  */

  const act =
    useCallback(
      async (fn) => {
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
      },
      [loadFull]
    );

  /*
  ============================================================
  EARLY LOADING
  ============================================================
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
  ============================================================
  TEAM PLAYERS
  ============================================================
  */

  const battingTeamPlayers =
    safePlayers.filter(
      p =>
        String(p?.team_id) ===
        String(inn?.batting_team_id)
    );

  const bowlingTeamPlayers =
    safePlayers.filter(
      p =>
        String(p?.team_id) ===
        String(inn?.bowling_team_id)
    );

  /*
  ============================================================
  EFFECTIVE IDS
  ============================================================
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
    getBowlerId(inn) ??
    undoPreservedRef.current?.bowlerId ??
    null;

  /*
  ============================================================
  SCORE DISPLAY
  ============================================================
  */

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
          (
            displayTotalBalls / 6
          )
        ).toFixed(2)
      : '0.00';

  /*
  ============================================================
  CURRENT INNINGS COMPLETION
  ============================================================
  */

  const inningsComplete =
    isInningsCompleteFor({
      inningsData:
        inn,

      totalRuns:
        displayTotalRuns,

      totalBalls:
        displayTotalBalls,

      totalWickets:
        displayTotalWickets
    });

  /*
  ============================================================
  OUT IDS
  ============================================================
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
    optimistic?.battingStatsById
  ) {
    Object.values(
      optimistic.battingStatsById
    ).forEach(stats => {
      if (
        stats?.is_out &&
        stats?.player_id
      ) {
        outIds.add(
          stats.player_id
        );
      }
    });
  }

  /*
  ============================================================
  PLAYER OBJECTS
  ============================================================
  */

  const striker =
    safePlayers.find(
      p =>
        String(p?.id) ===
        String(effectiveStrikerId)
    );

  const nonStriker =
    safePlayers.find(
      p =>
        String(p?.id) ===
        String(effectiveNonStrikerId)
    );

  const bowler =
    safePlayers.find(
      p =>
        String(p?.id) ===
        String(effectiveBowlerId)
    );

  /*
  ============================================================
  NEED BATSMEN
  ============================================================
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
                {match.team1_short} vs {match.team2_short}
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
          team={battingTeamPlayers}
          outIds={outIds}
          teamId={inn.batting_team_id}
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
            const finalStriker =
              getPlayerId(
                selectedStriker
              ) ||
              effectiveStrikerId ||
              null;

            const finalNonStriker =
              getPlayerId(
                selectedNonStriker
              ) ||
              effectiveNonStrikerId ||
              null;

            if (
              !finalStriker ||
              !finalNonStriker
            ) {
              setError(
                'Please select both batsmen.'
              );
              return;
            }

            if (
              String(finalStriker) ===
              String(finalNonStriker)
            ) {
              setError(
                'Striker and non-striker must be different.'
              );
              return;
            }

            setError('');

            act(
              async () => {
                await Innings.setBatsmen(
                  inn.id,
                  {
                    striker_id:
                      finalStriker,

                    non_striker_id:
                      finalNonStriker
                  }
                );

                const nextState = {
                  ...(optimisticRef.current || {}),

                  strikerId:
                    finalStriker,

                  nonStrikerId:
                    finalNonStriker
                };

                optimisticRef.current =
                  nextState;

                setOptimistic(
                  nextState
                );
              }
            );
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
  ============================================================
  BATSMAN STATS
  ============================================================
  */

  const serverStrikerStats =
    battingCard.find(
      b =>
        String(b?.player_id) ===
        String(effectiveStrikerId)
    ) || {
      player_id:
        effectiveStrikerId,
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

  const serverNonStrikerStats =
    battingCard.find(
      b =>
        String(b?.player_id) ===
        String(effectiveNonStrikerId)
    ) || {
      player_id:
        effectiveNonStrikerId,
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

  const optimisticStrikerStats =
    optimistic?.battingStatsById?.[
      String(
        effectiveStrikerId
      )
    ];

  const optimisticNonStrikerStats =
    optimistic?.battingStatsById?.[
      String(
        effectiveNonStrikerId
      )
    ];

  const strikerStats =
    optimisticStrikerStats ||
    serverStrikerStats;

  const nonStrikerStats =
    optimisticNonStrikerStats ||
    serverNonStrikerStats;

  /*
  ============================================================
  BOWLER STATS
  ============================================================
  */

  const bowlingCard =
    safeArray(
      currentInnings.bowlingCard
    );

  const serverBowlerStats =
    bowlingCard.find(
      b =>
        String(b?.player_id) ===
        String(effectiveBowlerId)
    ) || {
      player_id:
        effectiveBowlerId,
      overs:
        '0.0',
      runs:
        0,
      wickets:
        0,
      maidens:
        0,
      economy:
        0
    };

  const bowlerStats =
    optimistic?.bowlerStats &&
    String(
      optimistic.bowlerStats.player_id
    ) ===
    String(effectiveBowlerId)
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

  /*
  ============================================================
  RECENT BALLS
  ============================================================
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
  ============================================================
  NEXT BOWLER
  ============================================================
  */

  const needsNextBowler =
    !inningsComplete &&
    !effectiveBowlerId &&
    displayTotalBalls > 0 &&
    displayTotalBalls % 6 === 0 &&
    !undoPreservedRef.current?.active;

  /*
  ============================================================
  PARTNERSHIP
  ============================================================
  */

  const partnership =
    optimistic?.partnership ||
    (
      currentInnings.partnership &&
      typeof currentInnings.partnership ===
        'object'
        ? currentInnings.partnership
        : null
    ) || {
      runs:
        0,
      balls:
        0
    };

  /*
  ============================================================
  UI
  ============================================================
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

        <div className="flex justify-between items-center flex-wrap gap-3">

          <div>
            <div className="text-sm text-slate-400">
              {match.team1_short} vs {match.team2_short}
              {' · '}
              {match.overs_limit} overs
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">

              {displayTotalRuns}

              <span className="text-slate-400">
                /{displayTotalWickets}
              </span>

              <span className="text-lg text-slate-400 font-medium">
                {' '}({displayOvers} ov)
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
                    : inningsComplete
                      ? 'INNINGS COMPLETE'
                      : displayTotalBalls === 0
                        ? 'SELECT BOWLER TO START'
                        : 'SELECT NEXT BOWLER'}

                </div>

              </div>

              {effectiveBowlerId &&
                !inningsComplete && (
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

      {/*
      ========================================================
      INNINGS COMPLETE
      ========================================================
      */}

      {inningsComplete && (
        <div className="card">

          <div className="text-center">

            <div className="text-3xl mb-2">
              🏏
            </div>

            <div className="text-xl font-extrabold text-white">
              Innings Complete
            </div>

            <div className="text-sm text-slate-400 mt-1">
              {displayTotalRuns}/{displayTotalWickets}
              {' '}
              ({displayOvers} overs)
            </div>

            <div className="text-xs text-slate-500 mt-2">
              Loading next innings…
            </div>

          </div>

        </div>
      )}

      {/*
      ========================================================
      SCORING CONTROLS
      ========================================================
      */}

      {!needsNextBowler &&
        !inningsComplete &&
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
                          runs:
                            r,
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
                    handleSwapStrike
                  }
                >
                  ⇄ Swap
                </button>

                <button
                  className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm active:scale-95 transition-transform"
                  onClick={() =>
                    setShowWicket(true)
                  }
                >
                  OUT
                </button>

              </div>

            </div>

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
                              type === 'wide'
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

            <div className="grid grid-cols-2 gap-2">

              <button
                className="btn btn-secondary"
                onClick={
                  handleUndo
                }
              >
                ↺ Undo
              </button>

              <button
                className="btn btn-secondary"
                onClick={
                  handleSwapStrike
                }
              >
                ⇄ Swap Batsmen
              </button>

            </div>

          </>
        )}

      {/*
      ========================================================
      INITIAL BOWLER BUTTON
      ========================================================
      */}

      {!effectiveBowlerId &&
        effectiveStrikerId &&
        effectiveNonStrikerId &&
        displayTotalBalls === 0 &&
        !inningsComplete &&
        !undoPreservedRef.current?.active && (
          <div className="card">

            <button
              className="btn btn-primary w-full h-12 text-base font-bold"
              onClick={() =>
                setShowInitialBowler(true)
              }
            >
              🎯 Select Bowler to Start
            </button>

          </div>
        )}

      {/*
      ========================================================
      NEXT BOWLER BUTTON
      ========================================================
      */}

      {needsNextBowler && (
        <div className="card">

          <button
            className="btn btn-primary w-full h-12 text-base font-bold"
            onClick={() => {
              setShowInitialBowler(
                false
              );

              setShowNextBowler(
                true
              );
            }}
          >
            🎯 Select Next Bowler
          </button>

        </div>
      )}

      {/*
      ========================================================
      PARTNERSHIP
      ========================================================
      */}

      <div className="mt-2 bg-slate-900/70 rounded-xl p-2 border border-slate-700">

        <div className="flex justify-between items-center">

          <div>

            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Current Partnership
            </div>

            <div className="text-base font-bold text-white mt-1">

              {partnership.runs || 0}

              <span className="text-xs text-slate-400 font-normal">
                {' '}runs
              </span>

              {' · '}

              {partnership.balls || 0}

              <span className="text-xs text-slate-400 font-normal">
                {' '}balls
              </span>

            </div>

          </div>

          <div className="text-xl">
            🤝
          </div>

        </div>

      </div>

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

      {/*
      ========================================================
      INITIAL BOWLER MODAL
      ========================================================
      */}

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
          onSelect={async selected => {
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

              const currentEntry =
                getCurrentInningsEntry();

              const existingBowlerStats =
                safeArray(
                  currentEntry?.bowlingCard
                ).find(
                  b =>
                    String(
                      b?.player_id
                    ) ===
                    String(
                      bowlerId
                    )
                ) || null;

              const existingBowlerBalls =
                getBowlerBallsFromStats(
                  existingBowlerStats
                );

              const restoredBowlerStats =
                existingBowlerStats || {
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
                };

              const nextState = {
                ...(optimisticRef.current || {}),

                activeBowlerId:
                  bowlerId,

                needsNextBowler:
                  false,

                inningsComplete:
                  false,

                bowlerBalls:
                  existingBowlerBalls,

                bowlerStats:
                  restoredBowlerStats
              };

              optimisticRef.current =
                nextState;

              setOptimistic(
                nextState
              );

              clearUndoPreservation();

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

      {/*
      ========================================================
      NEXT BOWLER MODAL
      ========================================================
      */}

      {showNextBowler &&
        needsNextBowler &&
        !inningsComplete && (
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
            onSelect={async selected => {
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

                const currentEntry =
                  getCurrentInningsEntry();

                const existingBowlerStats =
                  safeArray(
                    currentEntry?.bowlingCard
                  ).find(
                    b =>
                      String(
                        b?.player_id
                      ) ===
                      String(
                        bowlerId
                      )
                  ) || null;

                const existingBowlerBalls =
                  getBowlerBallsFromStats(
                    existingBowlerStats
                  );

                const restoredBowlerStats =
                  existingBowlerStats || {
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
                  };

                const nextState = {
                  ...(optimisticRef.current || {}),

                  activeBowlerId:
                    bowlerId,

                  needsNextBowler:
                    false,

                  inningsComplete:
                    false,

                  bowlerBalls:
                    existingBowlerBalls,

                  bowlerStats:
                    restoredBowlerStats
                };

                optimisticRef.current =
                  nextState;

                setOptimistic(
                  nextState
                );

                clearUndoPreservation();

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

      {/*
      ========================================================
      WICKET MODAL
      ========================================================
      */}

      {showWicket && (
        <WicketModal
          striker={
            striker
          }
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
            setShowWicket(
              false
            );

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
================================================================
INITIAL BOWLER MODAL
================================================================
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
              disabled={!bowler}
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
================================================================
NEXT BOWLER MODAL
================================================================
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
              disabled={!bowler}
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
================================================================
FALL OF WICKETS
================================================================
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
                  String(
                    p?.id
                  ) ===
                  String(
                    item?.player_id
                  )
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
                      {player?.name ||
                        'Batsman'}
                    </div>

                    <div className="text-[11px] text-slate-500">

                      {item?.wicket_type ||
                        item?.how_out ||
                        'Wicket'}

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
================================================================
STAT
================================================================
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
================================================================
BOWLING STAT
================================================================
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
================================================================
BATSMAN CARD
================================================================
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
            (
              runs /
              balls
            ) * 100
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
              {player?.name ||
                'Batsman'}
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

      <div className="flex gap-4 mt-2 pt-2 border-t border-slate-800">

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
================================================================
BALL DISPLAY
================================================================
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
      safeBall.runs_batsman ??
      0
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
          safeBall.extra_runs ||
          1
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
================================================================
SELECT BATSMEN
================================================================
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

  const [localError, setLocalError] =
    useState('');

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
    typeof striker === 'object'
      ? striker?.id
      : striker;

  const nonStrikerId =
    typeof nonStriker === 'object'
      ? nonStriker?.id
      : nonStriker;

  const canConfirm =
    (
      hasStriker ||
      !!strikerId
    ) &&
    (
      hasNonStriker ||
      !!nonStrikerId
    );

  const handleConfirm =
    () => {
      const finalStriker =
        strikerId ||
        null;

      const finalNonStriker =
        nonStrikerId ||
        null;

      if (
        !hasStriker &&
        !finalStriker
      ) {
        setLocalError(
          'Please select the striker.'
        );
        return;
      }

      if (
        !hasNonStriker &&
        !finalNonStriker
      ) {
        setLocalError(
          'Please select the non-striker.'
        );
        return;
      }

      if (
        finalStriker &&
        finalNonStriker &&
        String(
          finalStriker
        ) ===
        String(
          finalNonStriker
        )
      ) {
        setLocalError(
          'Striker and non-striker must be different.'
        );
        return;
      }

      setLocalError('');

      onSelect(
        finalStriker,
        finalNonStriker
      );
    };

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
            onChange={value => {
              setLocalError('');
              setStriker(value);
            }}
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
            onChange={value => {
              setLocalError('');
              setNonStriker(value);
            }}
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

      {localError && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {localError}
        </div>
      )}

      <button
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
