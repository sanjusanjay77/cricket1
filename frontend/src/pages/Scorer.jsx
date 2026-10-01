import {
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';

import { flushSync } from 'react-dom';

import {
  useParams,
  useNavigate
} from 'react-router-dom';

import {
  Matches,
  Innings
} from '../api/api.js';

import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';


/*
=========================================================
HELPERS
=========================================================
*/

function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}


function getPlayerId(player) {
  if (!player) {
    return null;
  }

  if (
    typeof player === 'string' ||
    typeof player === 'number'
  ) {
    return String(player);
  }

  if (typeof player === 'object') {
    return player.id || player.player_id || null;
  }

  return null;
}


function getInningsNumber(innings) {
  return Number(
    innings?.innings_number ??
    innings?.innings_no ??
    innings?.number ??
    1
  );
}


function getBowlerBallsFromOvers(overs) {
  const text = String(overs || '0.0');
  const parts = text.split('.');

  const completedOvers =
    Number(parts[0]) || 0;

  const balls =
    Number(parts[1]) || 0;

  return (
    completedOvers * 6 +
    balls
  );
}


function formatOvers(balls) {
  const legalBalls =
    Number(balls || 0);

  return `${Math.floor(
    legalBalls / 6
  )}.${legalBalls % 6}`;
}


function calculateEconomy(runs, balls) {
  const legalBalls =
    Number(balls || 0);

  const bowlerRuns =
    Number(runs || 0);

  if (legalBalls <= 0) {
    return 0;
  }

  return Number(
    (
      (bowlerRuns / legalBalls) *
      6
    ).toFixed(2)
  );
}


/*
=========================================================
SCORER
=========================================================
*/

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();


  /*
  ========================================================
  STATE
  ========================================================
  */

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);

  const [showWicket, setShowWicket] =
    useState(false);

  const [error, setError] =
    useState('');

  const [boundary, setBoundary] =
    useState(null);

  const [extraPicker, setExtraPicker] =
    useState(null);

  const [flashWicket, setFlashWicket] =
    useState(false);

  const [showNextBowler, setShowNextBowler] =
    useState(false);

  const [optimistic, setOptimistic] =
    useState(null);

  const optimisticRef =
    useRef(null);

  const [fixedBatsmen, setFixedBatsmen] =
    useState(null);

  const fixedBatsmenRef =
    useRef(null);

  const fixedBatsmenInningsRef =
    useRef(null);

  const visualStateRef =
    useRef(null);

  const visualHistoryRef =
    useRef([]);

  const undoRollbackRef =
    useRef(null);

  const swapRollbackRef =
    useRef(null);

  /*
   * actionBusy is now ONLY for operations which
   * genuinely need to lock the UI.
   *
   * Undo and Swap DO NOT use it.
   */

  const [actionBusy, setActionBusy] =
    useState(null);

  const actionBusyRef =
    useRef(null);

  /*
   * ======================================================
   * SINGLE SERVER ACTION CHAIN
   * ======================================================
   *
   * Every server operation is serialized:
   *
   * ball
   *   ↓
   * ball
   *   ↓
   * swap
   *   ↓
   * undo
   *
   * UI never waits for this chain.
   */

  const serverActionTailRef =
    useRef(Promise.resolve());

  const pendingCountRef =
    useRef(0);

  const [pendingCount, setPendingCount] =
    useState(0);

  const boundaryTimer =
    useRef(null);

  const wicketTimer =
    useRef(null);


  /*
  ========================================================
  SERVER DATA
  ========================================================
  */

  const applyServerData =
    useCallback((data) => {
      if (!data) {
        return;
      }

      const nextInnings =
        data.innings || [];

      const latest =
        nextInnings[
          nextInnings.length - 1
        ];

      const latestInn =
        latest?.innings;

      const latestInningsId =
        latestInn?.id ?? null;

      setMatch(data.match || null);

      setPlayers(
        data.players || []
      );

      setInnings(
        nextInnings
      );


      /*
       * FIXED BATSMEN
       */

      setFixedBatsmen(
        (previous) => {
          if (
            !latestInn ||
            !latestInningsId
          ) {
            fixedBatsmenRef.current =
              null;

            fixedBatsmenInningsRef.current =
              null;

            return null;
          }

          const battingCard =
            latest?.battingCard || [];


          const getStats = (playerId) => {
            if (!playerId) {
              return null;
            }

            return (
              battingCard.find(
                (b) =>
                  String(
                    b.player_id
                  ) ===
                  String(playerId)
              ) || {
                player_id:
                  playerId,

                runs: 0,
                balls: 0,
                fours: 0,
                sixes: 0,
                strike_rate: 0,
                is_out: false
              }
            );
          };


          const newInnings =
            !previous ||
            String(
              previous.inningsId
            ) !==
              String(
                latestInningsId
              );


          if (newInnings) {
            const fresh = {
              inningsId:
                latestInningsId,

              leftPlayerId:
                latestInn.striker_id ||
                null,

              rightPlayerId:
                latestInn.non_striker_id ||
                null,

              leftStats:
                getStats(
                  latestInn.striker_id
                ),

              rightStats:
                getStats(
                  latestInn.non_striker_id
                ),

              strikerSide: 'left'
            };

            fixedBatsmenRef.current =
              fresh;

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
            String(
              latestInn.striker_id
            ) !==
              String(rightPlayerId)
          ) {
            leftPlayerId =
              latestInn.striker_id;
          }


          if (
            !rightPlayerId &&
            latestInn.striker_id &&
            String(
              latestInn.striker_id
            ) !==
              String(leftPlayerId)
          ) {
            rightPlayerId =
              latestInn.striker_id;
          }


          if (
            !leftPlayerId &&
            latestInn.non_striker_id &&
            String(
              latestInn.non_striker_id
            ) !==
              String(rightPlayerId)
          ) {
            leftPlayerId =
              latestInn.non_striker_id;
          }


          if (
            !rightPlayerId &&
            latestInn.non_striker_id &&
            String(
              latestInn.non_striker_id
            ) !==
              String(leftPlayerId)
          ) {
            rightPlayerId =
              latestInn.non_striker_id;
          }


          const strikerSide =
            String(
              latestInn.striker_id
            ) ===
            String(leftPlayerId)
              ? 'left'
              : String(
                  latestInn.striker_id
                ) ===
                String(rightPlayerId)
              ? 'right'
              : previous.strikerSide;


          const synced = {
            ...previous,

            inningsId:
              latestInningsId,

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

            strikerSide
          };


          fixedBatsmenRef.current =
            synced;

          fixedBatsmenInningsRef.current =
            latestInningsId;

          return synced;
        }
      );


      /*
       * Never allow old visual state from another
       * innings to survive.
       */

      const latestState =
        visualStateRef.current;

      if (
        latestInn &&
        latestState &&
        String(
          latestState.inningsId
        ) !==
          String(latestInn.id)
      ) {
        visualStateRef.current =
          null;

        visualHistoryRef.current =
          [];
      }


      /*
       * Server data is authoritative only when
       * there are no pending local operations.
       */

      if (
        pendingCountRef.current === 0
      ) {
        optimisticRef.current =
          null;

        setOptimistic(null);

        visualStateRef.current =
          null;

        visualHistoryRef.current =
          [];
      }
    }, []);


  /*
  ========================================================
  LOAD
  ========================================================
  */

  const loadFull =
    useCallback(async () => {
      try {
        const data =
          await Matches.get(
            matchId
          );

        /*
         * Never let an old GET overwrite
         * instant local changes.
         */

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
  ========================================================
  PLAYER CREATED
  ========================================================
  */

  const handlePlayerCreated =
    useCallback((player) => {
      setPlayers((previous) => {
        const exists =
          previous.some(
            (p) =>
              String(p.id) ===
              String(player.id)
          );

        if (exists) {
          return previous;
        }

        return [
          ...previous,
          player
        ];
      });
    }, []);


  /*
  ========================================================
  SOCKET
  ========================================================
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
       * Do not allow socket packets to overwrite
       * instant local operations.
       */

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


      setMatch(
        updatedMatch
      );

      setInnings(
        nextInnings
      );


      if (latestInn) {
        const battingCard =
          latest?.battingCard || [];

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


            const getStats =
              (playerId) =>
                playerId
                  ? battingCard.find(
                      (b) =>
                        String(
                          b.player_id
                        ) ===
                        String(
                          playerId
                        )
                    ) || {
                      player_id:
                        playerId,
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


      optimisticRef.current =
        null;

      setOptimistic(null);

      visualStateRef.current =
        null;

      visualHistoryRef.current =
        [];
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
  ========================================================
  CLEANUP
  ========================================================
  */

  useEffect(() => {
    return () => {
      clearTimeout(
        boundaryTimer.current
      );

      clearTimeout(
        wicketTimer.current
      );
    };
  }, []);


  /*
  ========================================================
  VISUAL EFFECTS
  ========================================================
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
  ========================================================
  NEXT BOWLER
  ========================================================
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
  ========================================================
  SERVER ACTION QUEUE
  ========================================================
  */

  const updatePendingCount =
    useCallback((delta) => {
      pendingCountRef.current =
        Math.max(
          0,
          pendingCountRef.current +
            delta
        );

      setPendingCount(
        pendingCountRef.current
      );
    }, []);


  /*
   * This is the most important part.
   *
   * Every server action waits for the previous
   * server action, but the UI never waits.
   */

  const enqueueServerAction =
    useCallback(
      (action) => {
        const run =
          serverActionTailRef.current
            .catch(() => {})
            .then(() => action());

        /*
         * Keep chain alive after errors.
         */

        serverActionTailRef.current =
          run.catch(() => {});

        return run;
      },
      []
    );


  /*
  ========================================================
  BUILD OPTIMISTIC BALL
  ========================================================
  */

  const buildOptimisticBall =
    useCallback(
      ({
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
          Number(
            payload.runs || 0
          );

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

            batsmanRuns =
              runs;

            runsRun =
              runs;

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

            runsRun =
              teamRuns;

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
            teamRuns =
              runs;

            batsmanRuns =
              runs;

            runsRun =
              runs;

            legal = true;
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
          previousRuns +
          teamRuns;


        const newTotalWickets =
          previousWickets +
          (wicket ? 1 : 0);


        const newTotalBalls =
          previousBalls +
          (legal ? 1 : 0);


        /*
        =====================================================
        BATSMAN
        =====================================================
        */

        const battingCard =
          currentInnings.battingCard ||
          [];


        const serverStrikerStats =
          battingCard.find(
            (b) =>
              String(
                b.player_id
              ) ===
              String(strikerId)
          ) || {
            player_id:
              strikerId,
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
              String(
                b.player_id
              ) ===
              String(nonStrikerId)
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


        /*
         * Wide does not count as batsman ball.
         * No-ball does not count as batsman ball
         * in this scoring model.
         */

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


        let updatedStrikerStats = {
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


        let updatedNonStrikerStats = {
          ...previousNonStrikerStats,

          player_id:
            nonStrikerId
        };


        /*
        =====================================================
        WICKET
        =====================================================
        */

        if (
          wicket &&
          payload.dismissed_id
        ) {
          if (
            String(
              payload.dismissed_id
            ) ===
            String(strikerId)
          ) {
            updatedStrikerStats = {
              ...updatedStrikerStats,

              is_out: true,

              how_out:
                payload.wicket_type ||
                null,

              dismissed_by:
                scoringBowlerId ||
                null,

              fielder_id:
                payload.fielder_id ||
                null
            };

            strikerId = null;
          } else if (
            String(
              payload.dismissed_id
            ) ===
            String(nonStrikerId)
          ) {
            updatedNonStrikerStats = {
              ...updatedNonStrikerStats,

              is_out: true,

              how_out:
                payload.wicket_type ||
                null,

              dismissed_by:
                scoringBowlerId ||
                null,

              fielder_id:
                payload.fielder_id ||
                null
            };

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
        =====================================================
        BOWLER
        =====================================================
        */

        const bowlingCard =
          currentInnings.bowlingCard ||
          [];


        const serverBowlerStats =
          bowlingCard.find(
            (b) =>
              String(
                b.player_id
              ) ===
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
          Number(
            previousOptimistic?.bowlerBalls
          );


        if (
          !Number.isFinite(
            previousBowlerBalls
          )
        ) {
          previousBowlerBalls =
            getBowlerBallsFromOvers(
              previousBowlerStats.overs
            );
        }


        const newBowlerBalls =
          previousBowlerBalls +
          (legal ? 1 : 0);


        /*
         * Runs charged to bowler.
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


        /*
         * 0.1 = 1 ball
         * 0.2 = 2 balls
         * 0.5 = 5 balls
         * 1.0 = 6 balls
         */

        const bowlerOvers =
          formatOvers(
            newBowlerBalls
          );


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


        /*
        =====================================================
        MAIDEN
        =====================================================
        */

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
                overRuns +=
                  Math.max(
                    1,
                    Number(
                      ball.extra_runs ||
                        1
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


        /*
         * CORRECT ECONOMY
         *
         * NEVER:
         *
         * runs / parseFloat("0.1")
         *
         * because 0.1 is cricket notation,
         * not decimal overs.
         */

        const bowlerEconomy =
          calculateEconomy(
            newBowlerRuns,
            newBowlerBalls
          );


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
        =====================================================
        END OF OVER
        =====================================================
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
        =====================================================
        RECENT BALL
        =====================================================
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
        =====================================================
        EXTRAS
        =====================================================
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
        =====================================================
        PARTNERSHIP
        =====================================================
        */

        const previousPartnership =
          previousOptimistic?.partnership ||
          currentInnings.partnership || {
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
        =====================================================
        RUN RATE
        =====================================================
        */

        const newRunRate =
          newTotalBalls > 0
            ? Number(
                (
                  (
                    newTotalRuns /
                    newTotalBalls
                  ) * 6
                ).toFixed(2)
              )
            : 0;


        /*
        =====================================================
        FALL OF WICKETS
        =====================================================
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
                    formatOvers(
                      newTotalBalls
                    ),

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
        =====================================================
        INNINGS COMPLETION
        =====================================================
        */

        const inningsNumber =
          getInningsNumber(
            current
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
      },
      [match]
    );


  /*
  ========================================================
  SAVE BALL
  ========================================================
  */

  const queueBallToServer =
    useCallback(
      (
        inningsId,
        payload
      ) => {
        updatePendingCount(1);


        enqueueServerAction(
          async () => {
            try {
              await Innings.ball(
                inningsId,
                payload
              );
            } catch (err) {
              console.error(
                'Failed to save ball:',
                err
              );


              /*
               * Roll back from server only on failure.
               */

              try {
                const data =
                  await Matches.get(
                    matchId
                  );

                if (
                  pendingCountRef.current <=
                  1
                ) {
                  applyServerData(
                    data
                  );
                }
              } catch (_) {}


              setError(
                err?.response?.data?.error ||
                err?.message ||
                'Unable to save ball'
              );

              throw err;
            } finally {
              updatePendingCount(-1);
            }
          }
        );
      },
      [
        enqueueServerAction,
        updatePendingCount,
        matchId,
        applyServerData
      ]
    );


  /*
  ========================================================
  PLAY BALL
  ========================================================
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
         * Don't score while waiting for
         * the next bowler.
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


        /*
        =====================================================
        ANIMATION
        =====================================================
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


        if (
          payload.is_wicket
        ) {
          popWicket();
        }


        /*
        =====================================================
        PREVIOUS VISUAL STATE
        =====================================================
        */

        const previousVisual =
          optimisticRef.current ||
          visualStateRef.current ||
          null;


        /*
        =====================================================
        SAVE FOR UNDO
        =====================================================
        */

        visualHistoryRef.current.push({
          state:
            previousVisual
              ? clone(
                  previousVisual
                )
              : null,

          fixed:
            fixedBatsmenRef.current
              ? clone(
                  fixedBatsmenRef.current
                )
              : null
        });


        if (
          visualHistoryRef.current.length >
          50
        ) {
          visualHistoryRef.current.shift();
        }


        /*
        =====================================================
        BUILD NEXT STATE
        =====================================================
        */

        const nextOptimistic =
          buildOptimisticBall({
            current,
            currentInnings,
            payload,
            previousOptimistic:
              previousVisual
          });


        /*
        =====================================================
        FIXED BATSMEN
        =====================================================
        */

        const previousFixed =
          fixedBatsmenRef.current;


        const initialLeftId =
          previousFixed?.leftPlayerId ??
          effectiveStrikerId;


        const initialRightId =
          previousFixed?.rightPlayerId ??
          effectiveNonStrikerId;


        const statsById =
          new Map();


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
                nextOptimistic.strikerId
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

        optimisticRef.current =
          nextOptimistic;


        /*
        =====================================================
        INSTANT UI
        =====================================================
        */

        flushSync(() => {
          setOptimistic(
            nextOptimistic
          );

          setFixedBatsmen(
            nextFixed
          );
        });


        /*
        =====================================================
        FIRST INNINGS TARGET
        =====================================================
        *
        * Only innings 1 opens target page.
        *
        * No setTimeout.
        * No waiting for server.
        */

        const currentInningsNumber =
          getInningsNumber(
            current
          );


        if (
          nextOptimistic.inningsCompleted &&
          currentInningsNumber === 1
        ) {
          const target =
            Number(
              nextOptimistic.total_runs ||
                0
            ) + 1;


          navigate(
            `/match/${matchId}/target`,
            {
              replace: true,

              state: {
                inningsCompleted:
                  true,

                inningsNumber:
                  1,

                score:
                  Number(
                    nextOptimistic.total_runs ||
                      0
                  ),

                wickets:
                  Number(
                    nextOptimistic.total_wickets ||
                      0
                  ),

                balls:
                  Number(
                    nextOptimistic.total_balls ||
                      0
                  ),

                target,

                battingTeam:
                  match?.team1_short ||
                  '',

                bowlingTeam:
                  match?.team2_short ||
                  ''
              }
            }
          );
        }


        /*
        =====================================================
        BACKGROUND SERVER SAVE
        =====================================================
        */

        queueBallToServer(
          current.id,
          payload
        );
      },
      [
        innings,
        popBoundary,
        popWicket,
        buildOptimisticBall,
        queueBallToServer,
        navigate,
        matchId,
        match
      ]
    );


  /*
  ========================================================
  INSTANT SWAP
  ========================================================
  */

  const fastSwapStrike =
    useCallback(() => {
      const currentInnings =
        innings[
          innings.length - 1
        ];


      const current =
        currentInnings?.innings;


      if (!current) {
        return;
      }


      /*
       * NEVER block because of pending balls.
       */

      const previousState =
        optimisticRef.current ||
        visualStateRef.current ||
        {
          inningsId:
            current.id,

          total_runs:
            Number(
              current.total_runs || 0
            ),

          total_wickets:
            Number(
              current.total_wickets || 0
            ),

          total_balls:
            Number(
              current.total_balls || 0
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


      /*
       * Save rollback.
       */

      const previousFixed =
        fixedBatsmenRef.current;


      swapRollbackRef.current = {
        state:
          clone(
            previousState
          ),

        fixed:
          previousFixed
            ? clone(
                previousFixed
              )
            : null
      };


      /*
       * INSTANT STATE
       */

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


      visualStateRef.current =
        nextState;

      optimisticRef.current =
        nextState;


      if (nextFixed) {
        fixedBatsmenRef.current =
          nextFixed;
      }


      /*
       * THIS IS IMMEDIATE.
       *
       * No loading state.
       * No "Swapping..."
       */

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


      /*
       * SERVER
       */

      updatePendingCount(1);


      enqueueServerAction(
        async () => {
          try {
            await Innings.swapStrike(
              current.id
            );

            /*
             * Success:
             *
             * Do NOT call Matches.get().
             */

            swapRollbackRef.current =
              null;
          } catch (err) {
            console.error(
              'Swap failed:',
              err
            );


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
              err?.response?.data?.error ||
              err?.message ||
              'Unable to swap batsmen'
            );
          } finally {
            updatePendingCount(-1);

            swapRollbackRef.current =
              null;
          }
        }
      );
    }, [
      innings,
      enqueueServerAction,
      updatePendingCount
    ]);


  /*
  ========================================================
  INSTANT UNDO
  ========================================================
  */

  const fastUndo =
    useCallback(() => {
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


      if (
        !history.length
      ) {
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


      /*
       * Save rollback state.
       */

      undoRollbackRef.current = {
        state:
          currentState
            ? clone(
                currentState
              )
            : null,

        fixed:
          fixedBatsmenRef.current
            ? clone(
                fixedBatsmenRef.current
              )
            : null
      };


      /*
       * Remove history immediately.
       */

      history.pop();


      const restoredState =
        previous.state ||
        null;


      /*
       * INSTANT UI UNDO
       */

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


      /*
       * SERVER UNDO
       *
       * It waits behind all previous server
       * operations automatically.
       */

      updatePendingCount(1);


      enqueueServerAction(
        async () => {
          try {
            await Innings.undo(
              current.id
            );

            /*
             * Success.
             *
             * No GET.
             */

            undoRollbackRef.current =
              null;
          } catch (err) {
            console.error(
              'Undo failed:',
              err
            );


            const rollback =
              undoRollbackRef.current;


            if (rollback) {
              visualStateRef.current =
                rollback.state;

              optimisticRef.current =
                rollback.state;

              fixedBatsmenRef.current =
                rollback.fixed;


              /*
               * Restore history because
               * server rejected Undo.
               */

              visualHistoryRef.current.push({
                state:
                  restoredState
                    ? clone(
                        restoredState
                      )
                    : null,

                fixed:
                  previous.fixed
                    ? clone(
                        previous.fixed
                      )
                    : null
              });


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
              err?.response?.data?.error ||
              err?.message ||
              'Unable to undo last ball'
            );
          } finally {
            updatePendingCount(-1);

            undoRollbackRef.current =
              null;
          }
        }
      );
    }, [
      innings,
      enqueueServerAction,
      updatePendingCount
    ]);


  /*
  ========================================================
  START SECOND INNINGS
  ========================================================
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

      setActionBusy(
        'start'
      );

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
          err?.response?.data?.error ||
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
  ========================================================
  LOADING
  ========================================================
  */

  if (!match) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">
          Loading…
        </p>
      </div>
    );
  }


  const currentInnings =
    innings[
      innings.length - 1
    ];


  if (!currentInnings) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="card text-center">
          <p className="text-slate-400">
            No innings found.
          </p>
        </div>
      </div>
    );
  }


  const inn =
    currentInnings.innings;


  if (!inn) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">
          Loading innings…
        </p>
      </div>
    );
  }


  /*
  ========================================================
  COMPLETED MATCH
  ========================================================
  */

  if (
    match.status === 'completed' &&
    pendingCount === 0
  ) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="card text-center space-y-4">
          <h1 className="text-2xl font-bold">
            🏆 Match Completed
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
      </div>
    );
  }


  /*
  ========================================================
  INNINGS BREAK
  ========================================================
  *
  * We no longer redirect from here.
  *
  * The final ball already navigates to target.
  */

  if (
    match.status ===
      'innings-break' &&
    getInningsNumber(inn) === 1
  ) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="card text-center space-y-3">
          <div className="text-emerald-400 font-semibold">
            Innings completed
          </div>

          <div className="text-slate-400 text-sm">
            Opening target screen…
          </div>
        </div>
      </div>
    );
  }


  /*
  ========================================================
  TARGET
  ========================================================
  */

  const firstInnings =
    innings.find((item) => {
      return (
        getInningsNumber(
          item?.innings
        ) === 1
      );
    });


  const derivedTarget =
    getInningsNumber(inn) === 2
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
      ? Number(
          match.target_score
        )
      : derivedTarget;


  /*
  ========================================================
  DISPLAY TOTALS
  ========================================================
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
    formatOvers(
      displayTotalBalls
    );


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
  ========================================================
  EFFECTIVE PLAYERS
  ========================================================
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


  const needsNextBowler =
    !optimistic?.inningsCompleted &&
    (
      optimistic?.needsNextBowler ||
      (
        !effectiveBowlerId &&
        displayTotalBalls > 0 &&
        displayTotalBalls % 6 === 0
      )
    );


  /*
  ========================================================
  BATSMEN
  ========================================================
  */

  const battingCard =
    currentInnings.battingCard ||
    [];


  const getBattingStats =
    (playerId) => {
      if (!playerId) {
        return null;
      }

      return (
        battingCard.find(
          (b) =>
            String(
              b.player_id
            ) ===
            String(playerId)
        ) || {
          player_id:
            playerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0
        }
      );
    };


  const strikerStats =
    optimistic?.strikerStats ||
    getBattingStats(
      effectiveStrikerId
    );


  const nonStrikerStats =
    optimistic?.nonStrikerStats ||
    getBattingStats(
      effectiveNonStrikerId
    );


  const getPlayer =
    (playerId) =>
      players.find(
        (p) =>
          String(p.id) ===
          String(playerId)
      );


  const strikerPlayer =
    getPlayer(
      effectiveStrikerId
    );


  const nonStrikerPlayer =
    getPlayer(
      effectiveNonStrikerId
    );


  /*
  ========================================================
  BOWLER
  ========================================================
  */

  const bowlingCard =
    currentInnings.bowlingCard ||
    [];


  const serverBowlerStats =
    bowlingCard.find(
      (b) =>
        String(
          b.player_id
        ) ===
        String(
          effectiveBowlerId
        )
    ) || null;


  const bowlerStats =
    optimistic?.bowlerStats ||
    serverBowlerStats;


  const bowlerBalls =
    optimistic?.bowlerBalls ??
    (
      bowlerStats
        ? getBowlerBallsFromOvers(
            bowlerStats.overs
          )
        : 0
    );


  /*
  ========================================================
  PARTNERSHIP
  ========================================================
  */

  const partnership =
    optimistic?.partnership ||
    currentInnings.partnership || {
      runs: 0,
      balls: 0
    };


  /*
  ========================================================
  RECENT BALLS
  ========================================================
  */

  const recentBalls =
    optimistic?.recentBalls ||
    currentInnings.recentBalls ||
    [];


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
  ========================================================
  EXTRAS
  ========================================================
  */

  const extras =
    optimistic?.extras || {
      wide:
        Number(
          inn.extras_wide || 0
        ),

      noball:
        Number(
          inn.extras_noball || 0
        ),

      bye:
        Number(
          inn.extras_bye || 0
        ),

      legbye:
        Number(
          inn.extras_legbye || 0
        ),

      penalty:
        Number(
          inn.extras_penalty || 0
        )
    };


  /*
  ========================================================
  FALL OF WICKETS
  ========================================================
  */

  const fallOfWickets =
    optimistic?.fallOfWickets ||
    currentInnings.fallOfWickets ||
    [];


  /*
  ========================================================
  RENDER
  ========================================================
  */

  return (
    <div className="max-w-6xl mx-auto p-3 md:p-5 space-y-4">

      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 p-3 text-sm">
          {error}
        </div>
      )}


      {/* BOUNDARY */}

      {boundary && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="text-7xl md:text-9xl font-black animate-pulse">
            {boundary === 'four'
              ? '4️⃣'
              : '6️⃣'}
          </div>
        </div>
      )}


      {/* WICKET */}

      {flashWicket && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="text-7xl md:text-9xl font-black animate-pulse">
            🏏💥
          </div>
        </div>
      )}


      {/* HEADER */}

      <div className="card">
        <div className="flex items-center justify-between gap-3">

          <div>
            <div className="text-xs text-slate-400">
              {match.team1_short ||
                match.team1_name ||
                'Team 1'}
              {' vs '}
              {match.team2_short ||
                match.team2_name ||
                'Team 2'}
            </div>

            <h1 className="text-xl md:text-2xl font-bold">
              {getInningsNumber(inn) === 1
                ? '1st Innings'
                : '2nd Innings'}
            </h1>
          </div>


          <div className="text-right">
            <div className="text-3xl md:text-4xl font-black">
              {displayTotalRuns}
              /
              {displayTotalWickets}
            </div>

            <div className="text-sm text-slate-400">
              {displayOvers} overs
            </div>
          </div>

        </div>
      </div>


      {/* SCORE SUMMARY */}

      <div className="grid grid-cols-3 gap-2">

        <div className="card text-center">
          <div className="text-xs text-slate-400">
            Score
          </div>

          <div className="text-xl font-bold">
            {displayTotalRuns}/
            {displayTotalWickets}
          </div>
        </div>


        <div className="card text-center">
          <div className="text-xs text-slate-400">
            Overs
          </div>

          <div className="text-xl font-bold">
            {displayOvers}
          </div>
        </div>


        <div className="card text-center">
          <div className="text-xs text-slate-400">
            Run Rate
          </div>

          <div className="text-xl font-bold">
            {displayRunRate}
          </div>
        </div>

      </div>


      {/* TARGET */}

      {getInningsNumber(inn) === 2 &&
        displayTarget && (
          <div className="card border border-emerald-500/30">
            <div className="text-xs text-slate-400">
              Target
            </div>

            <div className="text-2xl font-black text-emerald-400">
              {displayTarget}
            </div>

            <div className="text-sm text-slate-400">
              Need{' '}
              {Math.max(
                0,
                displayTarget -
                  displayTotalRuns
              )}{' '}
              runs
            </div>
          </div>
        )}


      {/* BATSMEN */}

      <div className="grid md:grid-cols-2 gap-3">

        <BatsmanCard
          title="Striker"
          player={
            strikerPlayer
          }
          stats={
            strikerStats
          }
          active
        />

        <BatsmanCard
          title="Non-Striker"
          player={
            nonStrikerPlayer
          }
          stats={
            nonStrikerStats
          }
        />

      </div>


      {/* BOWLER */}

      <div className="card">

        <div className="flex items-center justify-between">

          <div>
            <div className="text-xs text-slate-400">
              Bowler
            </div>

            <div className="font-bold">
              {getPlayer(
                effectiveBowlerId
              )?.name ||
                bowlerStats?.player_name ||
                'Select bowler'}
            </div>
          </div>


          <div className="text-right">

            <div className="font-bold">
              {formatOvers(
                bowlerBalls
              )}
            </div>

            <div className="text-xs text-slate-400">
              {Number(
                bowlerStats?.runs || 0
              )}{' '}
              runs ·{' '}
              {Number(
                bowlerStats?.wickets ||
                  0
              )}{' '}
              wkts
            </div>

            <div className="text-xs text-emerald-400">
              Econ{' '}
              {calculateEconomy(
                bowlerStats?.runs ||
                  0,
                bowlerBalls
              ).toFixed(2)}
            </div>

          </div>

        </div>

      </div>


      {/* NEXT BOWLER */}

      {needsNextBowler &&
        !optimistic?.inningsCompleted && (
          <div className="card border border-yellow-500/30">

            <div className="font-semibold text-yellow-400">
              Over completed
            </div>

            <div className="text-sm text-slate-400 mt-1">
              Select the next bowler to continue.
            </div>

            <button
              className="btn btn-primary mt-3"
              onClick={() =>
                setShowNextBowler(true)
              }
            >
              Select Next Bowler
            </button>

          </div>
        )}


      {/* CURRENT OVER */}

      <div className="card">

        <div className="flex items-center justify-between mb-3">

          <h2 className="font-bold">
            Current Over
          </h2>

          <span className="text-xs text-slate-400">
            Over{' '}
            {displayOverNumber + 1}
          </span>

        </div>


        <div className="flex flex-wrap gap-2">

          {currentOverBalls.length === 0 ? (
            <span className="text-slate-500 text-sm">
              No balls yet
            </span>
          ) : (
            currentOverBalls.map(
              (ball, index) => (
                <BallDisplay
                  key={
                    ball.id ||
                    ball.ball_sequence ||
                    index
                  }
                  ball={ball}
                />
              )
            )
          )}

        </div>

      </div>


      {/* SCORING */}

      {!optimistic?.inningsCompleted &&
        !needsNextBowler && (
          <div className="card space-y-3">

            <div className="grid grid-cols-4 gap-2">

              {[0, 1, 2, 3].map(
                (runs) => (
                  <button
                    key={runs}
                    className="btn btn-secondary text-lg"
                    onClick={() =>
                      playBall({
                        runs,
                        extra_type: null
                      })
                    }
                  >
                    {runs}
                  </button>
                )
              )}

              <button
                className="btn btn-secondary text-lg"
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
                className="btn btn-secondary text-lg"
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
                className="btn btn-secondary"
                onClick={() =>
                  setExtraPicker(
                    extraPicker
                      ? null
                      : 'wide'
                  )
                }
              >
                Extras
              </button>

              <button
                className="btn btn-danger"
                onClick={() =>
                  setShowWicket(true)
                }
              >
                OUT
              </button>

            </div>


            {/* EXTRA PICKER */}

            {extraPicker && (
              <div className="rounded-xl border border-slate-700 p-3 space-y-2">

                <div className="font-semibold">
                  {extraPicker ===
                  'wide'
                    ? 'Wide'
                    : extraPicker ===
                      'noball'
                    ? 'No Ball'
                    : extraPicker ===
                      'bye'
                    ? 'Bye'
                    : 'Leg Bye'}
                </div>


                <div className="grid grid-cols-4 gap-2">

                  {[1, 2, 3, 4].map(
                    (runs) => (
                      <button
                        key={runs}
                        className="btn btn-secondary"
                        onClick={() => {
                          const type =
                            extraPicker;

                          if (
                            type ===
                            'wide'
                          ) {
                            playBall({
                              runs: 0,
                              extra_type:
                                'wide',
                              extra_runs:
                                runs
                            });
                          } else if (
                            type ===
                            'noball'
                          ) {
                            playBall({
                              runs: 0,
                              extra_type:
                                'noball',
                              extra_runs:
                                runs
                            });
                          } else {
                            playBall({
                              runs: 0,
                              extra_type:
                                type,
                              extra_runs:
                                runs
                            });
                          }

                          setExtraPicker(
                            null
                          );
                        }}
                      >
                        {runs}
                      </button>
                    )
                  )}

                </div>


                <div className="grid grid-cols-4 gap-2">

                  {[
                    'wide',
                    'noball',
                    'bye',
                    'legbye'
                  ].map(
                    (type) => (
                      <button
                        key={type}
                        className="btn btn-secondary text-xs"
                        onClick={() =>
                          setExtraPicker(
                            type
                          )
                        }
                      >
                        {type ===
                        'legbye'
                          ? 'Leg Bye'
                          : type ===
                            'noball'
                          ? 'No Ball'
                          : type
                              .charAt(
                                0
                              )
                              .toUpperCase() +
                            type.slice(1)}
                      </button>
                    )
                  )}

                </div>

              </div>
            )}


            {/* UNDO / SWAP */}

            <div className="grid grid-cols-2 gap-2">

              <button
                className="btn btn-secondary"
                disabled={
                  visualHistoryRef.current
                    .length === 0
                }
                onClick={
                  fastUndo
                }
              >
                ↺ Undo
              </button>


              <button
                className="btn btn-secondary"
                onClick={
                  fastSwapStrike
                }
              >
                ⇄ Swap Batsmen
              </button>

            </div>

          </div>
        )}


      {/* PARTNERSHIP */}

      <div className="card">

        <h2 className="font-bold mb-2">
          Partnership
        </h2>

        <div className="flex gap-6">

          <div>
            <div className="text-xs text-slate-400">
              Runs
            </div>

            <div className="text-xl font-bold">
              {Number(
                partnership.runs || 0
              )}
            </div>
          </div>


          <div>
            <div className="text-xs text-slate-400">
              Balls
            </div>

            <div className="text-xl font-bold">
              {Number(
                partnership.balls || 0
              )}
            </div>
          </div>

        </div>

      </div>


      {/* FALL OF WICKETS */}

      {fallOfWickets.length >
        0 && (
        <div className="card">

          <h2 className="font-bold mb-3">
            Fall of Wickets
          </h2>

          <div className="space-y-2">

            {fallOfWickets.map(
              (wicket, index) => (
                <div
                  key={
                    wicket.id ||
                    `${wicket.wicket_number}-${index}`
                  }
                  className="flex justify-between border-b border-slate-800 pb-2"
                >

                  <span>
                    {wicket.wicket_number ||
                      index + 1}
                    .{' '}
                    {getPlayer(
                      wicket.player_id
                    )?.name ||
                      'Batter'}
                  </span>

                  <span className="text-slate-400">
                    {wicket.score} (
                    {wicket.overs})
                  </span>

                </div>
              )
            )}

          </div>

        </div>
      )}


      {/* EXTRAS */}

      <div className="card">

        <h2 className="font-bold mb-3">
          Extras
        </h2>

        <div className="grid grid-cols-5 gap-2 text-center text-sm">

          <Stat
            label="WD"
            value={
              extras.wide
            }
          />

          <Stat
            label="NB"
            value={
              extras.noball
            }
          />

          <Stat
            label="B"
            value={
              extras.bye
            }
          />

          <Stat
            label="LB"
            value={
              extras.legbye
            }
          />

          <Stat
            label="P"
            value={
              extras.penalty
            }
          />

        </div>

      </div>


      {/* PENDING SERVER */}

      {pendingCount > 0 && (
        <div className="text-center text-xs text-slate-500">
          Syncing…
        </div>
      )}


      {/* WICKET MODAL */}

      {showWicket && (
        <WicketModal
          players={players}
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


      {/* NEXT BOWLER MODAL */}

      {showNextBowler &&
        !optimistic?.inningsCompleted && (
          <NextBowlerModal
            players={players}
            onCreated={
              handlePlayerCreated
            }
            onClose={() =>
              setShowNextBowler(false)
            }
            onSelect={async (
              player
            ) => {
              const bowlerId =
                getPlayerId(
                  player
                );

              if (!bowlerId) {
                return;
              }


              try {
                await Innings.setBowler(
                  inn.id,
                  {
                    bowler_id:
                      bowlerId
                  }
                );


                const previous =
                  optimisticRef.current ||
                  visualStateRef.current;


                const newBowlerStats = {
                  player_id:
                    bowlerId,

                  overs: '0.0',

                  maidens: 0,

                  runs: 0,

                  wickets: 0,

                  economy: 0
                };


                const next =
                  previous
                    ? {
                        ...previous,

                        activeBowlerId:
                          bowlerId,

                        needsNextBowler:
                          false,

                        inningsCompleted:
                          false,

                        bowlerBalls:
                          0,

                        bowlerStats:
                          newBowlerStats
                      }
                    : null;


                if (next) {
                  optimisticRef.current =
                    next;

                  visualStateRef.current =
                    next;


                  flushSync(() => {
                    setOptimistic(
                      next
                    );
                  });
                }


                setShowNextBowler(
                  false
                );
              } catch (err) {
                setError(
                  err?.response?.data
                    ?.error ||
                  err?.message ||
                  'Unable to set bowler'
                );
              }
            }}
          />
        )}

    </div>
  );
}


/*
=========================================================
BATSMAN CARD
=========================================================
*/

function BatsmanCard({
  title,
  player,
  stats,
  active
}) {
  return (
    <div
      className={`card ${
        active
          ? 'border border-emerald-500/40'
          : ''
      }`}
    >

      <div className="flex items-center justify-between">

        <div>

          <div className="text-xs text-slate-400">
            {active
              ? '🏏 '
              : ''}
            {title}
          </div>

          <div className="font-bold">
            {player?.name ||
              stats?.player_name ||
              'Batter'}
          </div>

        </div>


        {active && (
          <div className="text-xs text-emerald-400">
            STRIKER
          </div>
        )}

      </div>


      <div className="grid grid-cols-5 gap-2 mt-3 text-center">

        <Stat
          label="R"
          value={
            stats?.runs || 0
          }
        />

        <Stat
          label="B"
          value={
            stats?.balls || 0
          }
        />

        <Stat
          label="4s"
          value={
            stats?.fours || 0
          }
        />

        <Stat
          label="6s"
          value={
            stats?.sixes || 0
          }
        />

        <Stat
          label="SR"
          value={
            Number(
              stats?.strike_rate ||
                0
            ).toFixed(2)
          }
        />

      </div>

    </div>
  );
}


/*
=========================================================
STAT
=========================================================
*/

function Stat({
  label,
  value
}) {
  return (
    <div>
      <div className="text-[10px] text-slate-500">
        {label}
      </div>

      <div className="font-semibold">
        {value}
      </div>
    </div>
  );
}


/*
=========================================================
BALL DISPLAY
=========================================================
*/

function BallDisplay({
  ball
}) {
  const extra =
    ball.extra_type;


  let text =
    Number(
      ball.runs_batsman || 0
    );


  if (
    extra === 'wide'
  ) {
    text =
      `Wd ${
        Number(
          ball.extra_runs || 1
        )
      }`;
  } else if (
    extra === 'noball'
  ) {
    text =
      `Nb ${
        Number(
          ball.extra_runs || 1
        )
      }`;
  } else if (
    extra === 'bye'
  ) {
    text =
      `B ${
        Number(
          ball.extra_runs || 0
        )
      }`;
  } else if (
    extra === 'legbye'
  ) {
    text =
      `LB ${
        Number(
          ball.extra_runs || 0
        )
      }`;
  }


  if (
    ball.is_wicket
  ) {
    text = 'W';
  }


  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border ${
        ball.is_wicket
          ? 'border-red-500 text-red-400'
          : Number(
              ball.runs_batsman
            ) === 4
          ? 'border-blue-500 text-blue-400'
          : Number(
              ball.runs_batsman
            ) === 6
          ? 'border-purple-500 text-purple-400'
          : 'border-slate-700'
      }`}
    >
      {text}
    </div>
  );
}


/*
=========================================================
NEXT BOWLER MODAL
=========================================================
*/

function NextBowlerModal({
  players,
  onCreated,
  onClose,
  onSelect
}) {
  const [selected, setSelected] =
    useState(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">

      <div className="w-full max-w-md card space-y-4">

        <div className="flex items-center justify-between">

          <h2 className="text-xl font-bold">
            Select Next Bowler
          </h2>

          <button
            className="text-slate-400"
            onClick={onClose}
          >
            ✕
          </button>

        </div>


        <PlayerAutocomplete
          players={players}
          value={selected}
          onChange={setSelected}
          onPlayerCreated={
            onCreated
          }
          placeholder="Search bowler..."
        />


        <button
          className="btn btn-primary w-full"
          disabled={!selected}
          onClick={() =>
            onSelect(
              selected
            )
          }
        >
          Start New Over
        </button>

      </div>

    </div>
  );
}
