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
====================================================
HELPERS
====================================================
*/

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getPlayerId(value) {
  if (!value) return null;

  if (typeof value === 'object') {
    return value.id ?? null;
  }

  return value;
}

function clone(value) {
  if (value == null) return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function getInningsNumber(innings) {
  return Number(
    innings?.innings_number ??
    innings?.innings_no ??
    innings?.number ??
    1
  );
}


/*
====================================================
MAIN SCORER
====================================================
*/

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();


  /*
  ==================================================
  STATE
  ==================================================
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


  /*
  ==================================================
  VISUAL HISTORY
  ==================================================
  */

  const visualStateRef =
    useRef(null);

  const visualHistoryRef =
    useRef([]);


  /*
  ==================================================
  ROLLBACK
  ==================================================
  */

  const undoRollbackRef =
    useRef(null);

  const swapRollbackRef =
    useRef(null);


  /*
  ==================================================
  ACTION BUSY
  ==================================================
  */

  const [actionBusy, setActionBusy] =
    useState(null);

  const actionBusyRef =
    useRef(null);


  /*
  ==================================================
  SINGLE SERVER ACTION QUEUE

  IMPORTANT:
  Every server mutation goes through this queue.

  Ball 1
      ↓
  Ball 2
      ↓
  Swap
      ↓
  Undo

  This prevents race conditions.
  ==================================================
  */

  const serverActionTailRef =
    useRef(Promise.resolve());


  const enqueueServerAction =
    useCallback((action) => {
      const run =
        serverActionTailRef.current
          .catch(() => {})
          .then(action);

      serverActionTailRef.current =
        run.catch(() => {});

      return run;
    }, []);


  /*
  ==================================================
  PENDING REQUESTS
  ==================================================
  */

  const pendingCountRef =
    useRef(0);

  const [pendingCount, setPendingCount] =
    useState(0);


  /*
  ==================================================
  TIMERS
  ==================================================
  */

  const boundaryTimer =
    useRef(null);

  const wicketTimer =
    useRef(null);


  /*
  ==================================================
  LOAD / APPLY SERVER DATA
  ==================================================
  */

  const applyServerData =
    useCallback((data) => {
      if (!data) return;

      const nextInnings =
        Array.isArray(data.innings)
          ? data.innings
          : [];

      const latest =
        nextInnings[
          nextInnings.length - 1
        ];

      const latestInn =
        latest?.innings;

      if (data.match) {
        setMatch(data.match);
      }

      if (Array.isArray(data.players)) {
        setPlayers(data.players);
      }

      setInnings(nextInnings);


      /*
      ================================================
      FIXED BATSMEN
      ================================================
      */

      if (latestInn) {
        const inningsId =
          latestInn.id;

        const oldFixed =
          fixedBatsmenRef.current;

        if (
          fixedBatsmenInningsRef.current !==
          inningsId
        ) {
          fixedBatsmenInningsRef.current =
            inningsId;

          fixedBatsmenRef.current =
            null;

          setFixedBatsmen(null);
        } else if (
          oldFixed
        ) {
          const strikerId =
            latestInn.striker_id;

          let strikerSide =
            oldFixed.strikerSide;

          if (
            strikerId &&
            String(
              strikerId
            ) ===
              String(
                oldFixed.leftPlayerId
              )
          ) {
            strikerSide = 'left';
          }

          if (
            strikerId &&
            String(
              strikerId
            ) ===
              String(
                oldFixed.rightPlayerId
              )
          ) {
            strikerSide = 'right';
          }

          const nextFixed = {
            ...oldFixed,
            strikerSide
          };

          fixedBatsmenRef.current =
            nextFixed;

          setFixedBatsmen(
            nextFixed
          );
        }


        /*
        ==============================================
        SYNC VISUAL STATE
        ==============================================
        */

        const currentVisual =
          visualStateRef.current;

        if (
          currentVisual &&
          String(
            currentVisual.inningsId
          ) ===
            String(inningsId)
        ) {
          const nextVisual = {
            ...currentVisual,

            total_runs:
              safeNumber(
                latestInn.total_runs
              ),

            total_wickets:
              safeNumber(
                latestInn.total_wickets
              ),

            total_balls:
              safeNumber(
                latestInn.total_balls
              ),

            strikerId:
              latestInn.striker_id,

            nonStrikerId:
              latestInn.non_striker_id,

            activeBowlerId:
              latestInn.current_bowler_id,

            recentBalls:
              latest.recentBalls ||
              currentVisual.recentBalls ||
              [],

            partnership:
              latest.partnership ||
              currentVisual.partnership ||
              {
                runs: 0,
                balls: 0
              },

            fallOfWickets:
              latest.fallOfWickets ||
              currentVisual.fallOfWickets ||
              []
          };

          visualStateRef.current =
            nextVisual;

          optimisticRef.current =
            nextVisual;

          setOptimistic(
            nextVisual
          );
        }
      }


      /*
      ================================================
      SERVER IS NOW AUTHORITATIVE
      ================================================
      */

      if (
        pendingCountRef.current ===
        0
      ) {
        optimisticRef.current =
          null;

        setOptimistic(null);
      }
    }, []);


  const loadFull =
    useCallback(async () => {
      try {
        const data =
          await Matches.get(
            matchId
          );

        /*
        Do not overwrite instant
        optimistic state while requests
        are still being saved.
        */
        if (
          pendingCountRef.current >
          0
        ) {
          return;
        }

        applyServerData(data);
      } catch (err) {
        setError(
          err?.response?.data
            ?.error ||
          err?.message ||
          'Unable to load match'
        );
      }
    }, [
      matchId,
      applyServerData
    ]);


  /*
  ==================================================
  INITIAL LOAD
  ==================================================
  */

  useEffect(() => {
    loadFull();
  }, [loadFull]);


  /*
  ==================================================
  SOCKET
  ==================================================
  */

  useEffect(() => {
    if (!matchId) return;

    socket.emit(
      'join-match',
      matchId
    );

    const onUpdate =
      ({
        match: updatedMatch,
        innings: updatedInnings
      }) => {
        /*
        Never overwrite instant UI
        while local mutations are pending.
        */
        if (
          pendingCountRef.current >
            0 ||
          actionBusyRef.current
        ) {
          return;
        }

        const nextInnings =
          Array.isArray(
            updatedInnings
          )
            ? updatedInnings
            : [];

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
          setFixedBatsmen(
            previous => {
              if (!previous) {
                return previous;
              }

              let strikerSide =
                previous.strikerSide;

              if (
                String(
                  latestInn.striker_id
                ) ===
                String(
                  previous.leftPlayerId
                )
              ) {
                strikerSide =
                  'left';
              }

              if (
                String(
                  latestInn.striker_id
                ) ===
                String(
                  previous.rightPlayerId
                )
              ) {
                strikerSide =
                  'right';
              }

              const next = {
                ...previous,
                strikerSide
              };

              fixedBatsmenRef.current =
                next;

              return next;
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

      if (
        boundaryTimer.current
      ) {
        clearTimeout(
          boundaryTimer.current
        );
      }

      if (
        wicketTimer.current
      ) {
        clearTimeout(
          wicketTimer.current
        );
      }
    };
  }, [matchId]);


  /*
  ==================================================
  VISUAL EFFECTS
  ==================================================
  */

  const popBoundary =
    useCallback((type) => {
      setBoundary(type);

      if (
        boundaryTimer.current
      ) {
        clearTimeout(
          boundaryTimer.current
        );
      }

      boundaryTimer.current =
        setTimeout(() => {
          setBoundary(null);
        }, 1100);
    }, []);


  const popWicket =
    useCallback(() => {
      setFlashWicket(true);

      if (
        wicketTimer.current
      ) {
        clearTimeout(
          wicketTimer.current
        );
      }

      wicketTimer.current =
        setTimeout(() => {
          setFlashWicket(false);
        }, 600);
    }, []);


  /*
  ==================================================
  PLAYER CREATED
  ==================================================
  */

  const handlePlayerCreated =
    useCallback((player) => {
      if (!player) return;

      setPlayers(
        previous => {
          const exists =
            previous.some(
              p =>
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
        }
      );
    }, []);


  /*
  ==================================================
  BUILD OPTIMISTIC BALL
  ==================================================
  */

  const buildOptimisticBall =
    useCallback(
      ({
        current,
        currentInnings,
        payload,
        previousOptimistic
      }) => {
        const inningsId =
          current.id;

        const previous =
          previousOptimistic ||
          visualStateRef.current ||
          {};

        const strikerId =
          previous.strikerId ??
          current.striker_id;

        const nonStrikerId =
          previous.nonStrikerId ??
          current.non_striker_id;

        const bowlerId =
          previous.activeBowlerId ??
          current.current_bowler_id;


        const extraType =
          payload.extra_type ||
          null;

        const extraRuns =
          safeNumber(
            payload.extra_runs,
            0
          );

        const batsmanRuns =
          safeNumber(
            payload.runs,
            0
          );


        const isWide =
          extraType === 'wide';

        const isNoBall =
          extraType === 'noball';

        const isBye =
          extraType === 'bye';

        const isLegBye =
          extraType === 'legbye';


        const legalBall =
          !isWide &&
          !isNoBall;


        let teamRuns =
          batsmanRuns;

        if (
          isWide ||
          isNoBall ||
          isBye ||
          isLegBye
        ) {
          teamRuns =
            extraRuns +
            (
              isNoBall
                ? batsmanRuns
                : 0
            );
        }


        if (
          !extraType
        ) {
          teamRuns =
            batsmanRuns;
        }


        let totalRuns =
          safeNumber(
            previous.total_runs ??
              current.total_runs
          ) +
          teamRuns;

        let totalWickets =
          safeNumber(
            previous.total_wickets ??
              current.total_wickets
          );

        let totalBalls =
          safeNumber(
            previous.total_balls ??
              current.total_balls
          );

        if (legalBall) {
          totalBalls += 1;
        }


        /*
        ==============================================
        BATTING STATS
        ==============================================
        */

        const serverBattingCard =
          currentInnings
            .battingCard ||
          [];

        const getBattingStats =
          playerId => {
            if (!playerId) {
              return null;
            }

            const old =
              serverBattingCard.find(
                b =>
                  String(
                    b.player_id
                  ) ===
                  String(
                    playerId
                  )
              );

            return {
              player_id:
                playerId,

              runs:
                safeNumber(
                  old?.runs
                ),

              balls:
                safeNumber(
                  old?.balls
                ),

              fours:
                safeNumber(
                  old?.fours
                ),

              sixes:
                safeNumber(
                  old?.sixes
                ),

              strike_rate:
                safeNumber(
                  old?.strike_rate
                ),

              is_out:
                !!old?.is_out
            };
          };


        let strikerStats =
          getBattingStats(
            strikerId
          );

        let nonStrikerStats =
          getBattingStats(
            nonStrikerId
          );


        if (
          previous.strikerStats &&
          String(
            previous.strikerStats
              .player_id
          ) ===
            String(strikerId)
        ) {
          strikerStats = {
            ...strikerStats,
            ...previous.strikerStats
          };
        }

        if (
          previous.nonStrikerStats &&
          String(
            previous.nonStrikerStats
              .player_id
          ) ===
            String(nonStrikerId)
        ) {
          nonStrikerStats = {
            ...nonStrikerStats,
            ...previous.nonStrikerStats
          };
        }


        if (strikerStats) {
          strikerStats = {
            ...strikerStats,

            runs:
              strikerStats.runs +
              batsmanRuns,

            balls:
              strikerStats.balls +
              (
                legalBall
                  ? 1
                  : 0
              ),

            fours:
              strikerStats.fours +
              (
                batsmanRuns === 4
                  ? 1
                  : 0
              ),

            sixes:
              strikerStats.sixes +
              (
                batsmanRuns === 6
                  ? 1
                  : 0
              )
          };

          strikerStats.strike_rate =
            strikerStats.balls >
            0
              ? Number(
                  (
                    strikerStats.runs /
                    strikerStats.balls
                  ) *
                    100
                ).toFixed(2)
              : 0;
        }


        /*
        ==============================================
        WICKET
        ==============================================
        */

        let nextStrikerId =
          strikerId;

        let nextNonStrikerId =
          nonStrikerId;

        if (
          payload.is_wicket
        ) {
          totalWickets += 1;

          const dismissedId =
            getPlayerId(
              payload.dismissed_id
            ) ||
            strikerId;

          if (
            strikerStats &&
            String(
              strikerStats.player_id
            ) ===
              String(
                dismissedId
              )
          ) {
            strikerStats = {
              ...strikerStats,
              is_out: true
            };
          }

          if (
            nonStrikerStats &&
            String(
              nonStrikerStats.player_id
            ) ===
              String(
                dismissedId
              )
            ) {
            nonStrikerStats = {
              ...nonStrikerStats,
              is_out: true
            };
          }

          if (
            String(
              dismissedId
            ) ===
              String(
                nextStrikerId
              )
          ) {
            nextStrikerId =
              null;
          }

          if (
            String(
              dismissedId
            ) ===
              String(
                nextNonStrikerId
              )
          ) {
            nextNonStrikerId =
              null;
          }
        } else if (
          (
            teamRuns %
              2
          ) === 1
        ) {
          const temp =
            nextStrikerId;

          nextStrikerId =
            nextNonStrikerId;

          nextNonStrikerId =
            temp;

          const tempStats =
            strikerStats;

          strikerStats =
            nonStrikerStats;

          nonStrikerStats =
            tempStats;
        }


        /*
        ==============================================
        BOWLER
        ==============================================
        */

        const serverBowlingCard =
          currentInnings
            .bowlingCard ||
          [];

        let bowlerStats =
          serverBowlingCard.find(
            b =>
              String(
                b.player_id
              ) ===
              String(
                bowlerId
              )
          ) || {
            player_id:
              bowlerId,

            overs: '0.0',
            runs: 0,
            wickets: 0,
            maidens: 0,
            economy: 0
          };


        if (
          previous.bowlerStats &&
          String(
            previous.bowlerStats
              .player_id
          ) ===
            String(
              bowlerId
            )
        ) {
          bowlerStats = {
            ...bowlerStats,
            ...previous.bowlerStats
          };
        }


        bowlerStats = {
          ...bowlerStats,

          runs:
            safeNumber(
              bowlerStats.runs
            ) +
            (
              isBye ||
              isLegBye
                ? 0
                : teamRuns
            ),

          wickets:
            safeNumber(
              bowlerStats.wickets
            ) +
            (
              payload.is_wicket &&
              payload.wicket_type !==
                'run-out'
                ? 1
                : 0
            )
        };


        const bowlerBalls =
          safeNumber(
            previous.bowlerBalls ??
              0
          ) +
          (
            legalBall
              ? 1
              : 0
          );


        bowlerStats.overs =
          `${Math.floor(
            bowlerBalls / 6
          )}.${bowlerBalls % 6}`;

        bowlerStats.economy =
          bowlerBalls > 0
            ? Number(
                (
                  bowlerStats.runs /
                  bowlerBalls
                ) *
                  6
              ).toFixed(2)
            : 0;


        /*
        ==============================================
        STRIKE AFTER LEGAL BALL
        ==============================================
        */

        let needsNextBowler =
          false;

        let inningsCompleted =
          false;

        if (
          legalBall &&
          totalBalls > 0 &&
          totalBalls % 6 === 0
        ) {
          const temp =
            nextStrikerId;

          nextStrikerId =
            nextNonStrikerId;

          nextNonStrikerId =
            temp;

          if (
            totalBalls <
              safeNumber(
                current.overs_limit ??
                currentInnings
                  ?.match
                  ?.overs_limit ??
                0
              ) *
                6
          ) {
            needsNextBowler =
              true;
          }
        }


        /*
        ==============================================
        RECENT BALL
        ==============================================
        */

        const oldRecentBalls =
          previous.recentBalls ||
          currentInnings.recentBalls ||
          [];

        const recentBall = {
          id:
            `optimistic-${Date.now()}-${Math.random()}`,

          runs_batsman:
            batsmanRuns,

          extra_runs:
            extraRuns,

          extra_type:
            extraType,

          is_legal:
            legalBall,

          is_wicket:
            !!payload.is_wicket,

          wicket_type:
            payload.wicket_type ||
            null,

          over_number:
            Math.floor(
              Math.max(
                totalBalls - 1,
                0
              ) / 6
            )
        };


        const recentBalls = [
          ...oldRecentBalls,
          recentBall
        ].slice(-30);


        /*
        ==============================================
        EXTRAS
        ==============================================
        */

        const oldExtras =
          previous.extras ||
          currentInnings.extras ||
          {
            wides: 0,
            no_balls: 0,
            byes: 0,
            leg_byes: 0,
            penalty: 0,
            total: 0
          };

        const extras = {
          ...oldExtras
        };

        if (
          isWide
        ) {
          extras.wides =
            safeNumber(
              extras.wides
            ) +
            extraRuns;
        }

        if (
          isNoBall
        ) {
          extras.no_balls =
            safeNumber(
              extras.no_balls
            ) + 1;
        }

        if (
          isBye
        ) {
          extras.byes =
            safeNumber(
              extras.byes
            ) +
            extraRuns;
        }

        if (
          isLegBye
        ) {
          extras.leg_byes =
            safeNumber(
              extras.leg_byes
            ) +
            extraRuns;
        }

        extras.total =
          safeNumber(
            extras.total
          ) +
          (
            extraType
              ? extraRuns
              : 0
          );


        /*
        ==============================================
        PARTNERSHIP
        ==============================================
        */

        const oldPartnership =
          previous.partnership ||
          currentInnings.partnership ||
          {
            runs: 0,
            balls: 0
          };

        const partnership = {
          runs:
            payload.is_wicket
              ? 0
              : safeNumber(
                  oldPartnership.runs
                ) +
                teamRuns,

          balls:
            payload.is_wicket
              ? 0
              : safeNumber(
                  oldPartnership.balls
                ) +
                (
                  legalBall
                    ? 1
                    : 0
                )
        };


        /*
        ==============================================
        FALL OF WICKETS
        ==============================================
        */

        const fallOfWickets =
          previous.fallOfWickets ||
          currentInnings.fallOfWickets ||
          [];

        let nextFallOfWickets =
          fallOfWickets;

        if (
          payload.is_wicket
        ) {
          nextFallOfWickets = [
            ...fallOfWickets,
            {
              wicket_number:
                totalWickets,

              player_id:
                getPlayerId(
                  payload.dismissed_id
                ) ||
                strikerId,

              score:
                totalRuns,

              overs:
                `${Math.floor(
                  totalBalls / 6
                )}.${totalBalls % 6}`,

              wicket_type:
                payload.wicket_type ||
                'Wicket'
            }
          ];
        }


        /*
        ==============================================
        RUN RATE
        ==============================================
        */

        const runRate =
          totalBalls > 0
            ? Number(
                (
                  totalRuns /
                  totalBalls
                ) * 6
              ).toFixed(2)
            : 0;


        /*
        ==============================================
        INNINGS COMPLETION
        ==============================================
        */

        const inningsNumber =
          getInningsNumber(
            current
          );

        const maxBalls =
          safeNumber(
            current.overs_limit ??
            currentInnings
              ?.overs_limit ??
            0
          ) * 6;

        const target =
          inningsNumber === 2
            ? safeNumber(
                current.target ??
                currentInnings
                  ?.target
              )
            : null;

        if (
          totalWickets >= 10
        ) {
          inningsCompleted =
            true;
        }

        if (
          maxBalls > 0 &&
          totalBalls >=
            maxBalls
        ) {
          inningsCompleted =
            true;
        }

        if (
          inningsNumber === 2 &&
          target > 0 &&
          totalRuns >= target
        ) {
          inningsCompleted =
            true;
        }

        if (
          inningsCompleted
        ) {
          needsNextBowler =
            false;
        }


        return {
          inningsId,

          total_runs:
            totalRuns,

          total_wickets:
            totalWickets,

          total_balls:
            totalBalls,

          strikerId:
            nextStrikerId,

          nonStrikerId:
            nextNonStrikerId,

          activeBowlerId:
            bowlerId,

          needsNextBowler,

          inningsCompleted,

          bowlerBalls,

          bowlerStats,

          strikerStats,

          nonStrikerStats,

          recentBalls,

          extras,

          partnership,

          fallOfWickets:
            nextFallOfWickets,

          runRate
        };
      },
      []
    );


  /*
  ==================================================
  PLAY BALL
  ==================================================
  */

  const playBall =
    useCallback(
      (payload = {}) => {
        if (
          actionBusyRef.current
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


        const currentVisual =
          optimisticRef.current ||
          visualStateRef.current ||
          null;


        if (
          currentVisual
            ?.inningsCompleted
        ) {
          return;
        }


        const strikerId =
          currentVisual?.strikerId ??
          current.striker_id;

        const nonStrikerId =
          currentVisual?.nonStrikerId ??
          current.non_striker_id;

        const bowlerId =
          currentVisual?.activeBowlerId ??
          current.current_bowler_id;


        if (
          !strikerId ||
          !nonStrikerId ||
          !bowlerId
        ) {
          setError(
            'Select batsmen and bowler first'
          );

          return;
        }


        if (
          currentVisual
            ?.needsNextBowler
        ) {
          setShowNextBowler(
            true
          );

          return;
        }


        /*
        ==============================================
        ANIMATIONS
        ==============================================
        */

        if (
          safeNumber(
            payload.runs
          ) === 4 &&
          !payload.extra_type
        ) {
          popBoundary('four');
        }

        if (
          safeNumber(
            payload.runs
          ) === 6 &&
          !payload.extra_type
        ) {
          popBoundary('six');
        }


        /*
        ==============================================
        SAVE HISTORY BEFORE CHANGE
        ==============================================
        */

        visualHistoryRef.current.push({
          state:
            currentVisual
              ? clone(
                  currentVisual
                )
              : {
                  inningsId:
                    current.id,

                  total_runs:
                    safeNumber(
                      current.total_runs
                    ),

                  total_wickets:
                    safeNumber(
                      current.total_wickets
                    ),

                  total_balls:
                    safeNumber(
                      current.total_balls
                    ),

                  strikerId:
                    current.striker_id,

                  nonStrikerId:
                    current.non_striker_id,

                  activeBowlerId:
                    current.current_bowler_id
                },

          fixed:
            fixedBatsmenRef.current
              ? clone(
                  fixedBatsmenRef.current
                )
              : null
        });


        /*
        ==============================================
        BUILD INSTANT STATE
        ==============================================
        */

        const nextOptimistic =
          buildOptimisticBall({
            current,
            currentInnings,
            payload,
            previousOptimistic:
              currentVisual
          });


        optimisticRef.current =
          nextOptimistic;

        visualStateRef.current =
          nextOptimistic;


        /*
        ==============================================
        FIXED BATSMEN
        ==============================================
        */

        const previousFixed =
          fixedBatsmenRef.current;

        if (
          previousFixed
        ) {
          const nextFixed = {
            ...previousFixed,

            strikerSide:
              String(
                nextOptimistic.strikerId
              ) ===
              String(
                previousFixed
                  .leftPlayerId
              )
                ? 'left'
                : 'right',

            leftStats:
              String(
                previousFixed
                  .leftPlayerId
              ) ===
              String(
                nextOptimistic
                  .strikerStats
                  ?.player_id
              )
                ? nextOptimistic
                    .strikerStats
                : String(
                    previousFixed
                      .leftPlayerId
                  ) ===
                  String(
                    nextOptimistic
                      .nonStrikerStats
                      ?.player_id
                  )
                ? nextOptimistic
                    .nonStrikerStats
                : previousFixed
                    .leftStats,

            rightStats:
              String(
                previousFixed
                  .rightPlayerId
              ) ===
              String(
                nextOptimistic
                  .strikerStats
                  ?.player_id
              )
                ? nextOptimistic
                    .strikerStats
                : String(
                    previousFixed
                      .rightPlayerId
                  ) ===
                  String(
                    nextOptimistic
                      .nonStrikerStats
                      ?.player_id
                  )
                ? nextOptimistic
                    .nonStrikerStats
                : previousFixed
                    .rightStats
          };

          fixedBatsmenRef.current =
            nextFixed;

          setFixedBatsmen(
            nextFixed
          );
        }


        /*
        ==============================================
        INSTANT RENDER
        ==============================================
        */

        flushSync(() => {
          setOptimistic(
            nextOptimistic
          );

          if (
            previousFixed
          ) {
            setFixedBatsmen(
              fixedBatsmenRef.current
            );
          }
        });


        /*
        ==============================================
        QUEUE SERVER SAVE

        IMPORTANT:
        We queue BEFORE navigating to target.
        ==============================================
        */

        pendingCountRef.current +=
          1;

        setPendingCount(
          pendingCountRef.current
        );


        const savePromise =
          enqueueServerAction(
            async () => {
              await Innings.ball(
                current.id,
                {
                  ...payload,

                  striker_id:
                    strikerId,

                  non_striker_id:
                    nonStrikerId,

                  bowler_id:
                    bowlerId
                }
              );
            }
          );


        savePromise
          .catch(err => {
            /*
            ==========================================
            SERVER SAVE FAILED
            ==========================================
            */

            const history =
              visualHistoryRef.current;

            const previous =
              history.length
                ? history[
                    history.length - 1
                  ]
                : null;

            if (
              previous
            ) {
              visualStateRef.current =
                previous.state;

              optimisticRef.current =
                previous.state;

              fixedBatsmenRef.current =
                previous.fixed;

              flushSync(() => {
                setOptimistic(
                  previous.state
                );

                setFixedBatsmen(
                  previous.fixed
                );
              });

              history.pop();
            }

            setError(
              err?.response?.data
                ?.error ||
              err?.message ||
              'Unable to save ball'
            );
          })
          .finally(() => {
            pendingCountRef.current =
              Math.max(
                0,
                pendingCountRef.current -
                  1
              );

            setPendingCount(
              pendingCountRef.current
            );
          });


        /*
        ==============================================
        FIRST INNINGS COMPLETE

        Navigate immediately.

        DO NOT wait for server.
        ==============================================
        */

        if (
          nextOptimistic
            .inningsCompleted
        ) {
          const inningsNumber =
            getInningsNumber(
              current
            );

          if (
            inningsNumber === 1
          ) {
            const score =
              safeNumber(
                nextOptimistic
                  .total_runs
              );

            navigate(
              `/match/${matchId}/target`,
              {
                replace: true,

                state: {
                  inningsCompleted:
                    true,

                  inningsNumber:
                    1,

                  score,

                  wickets:
                    safeNumber(
                      nextOptimistic
                        .total_wickets
                    ),

                  balls:
                    safeNumber(
                      nextOptimistic
                        .total_balls
                    ),

                  target:
                    score + 1,

                  battingTeam:
                    match
                      ?.team1_short ||
                    '',

                  bowlingTeam:
                    match
                      ?.team2_short ||
                    ''
                }
              }
            );

            return;
          }
        }


        /*
        ==============================================
        NEXT BOWLER
        ==============================================
        */

        if (
          nextOptimistic
            .needsNextBowler
        ) {
          setShowNextBowler(
            true
          );
        }
      },
      [
        innings,
        buildOptimisticBall,
        enqueueServerAction,
        navigate,
        matchId,
        match,
        popBoundary
      ]
    );


  /*
  ==================================================
  FAST SWAP STRIKE
  ==================================================
  */

  const fastSwapStrike =
    useCallback(() => {
      if (
        actionBusyRef.current
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


      const currentState =
        optimisticRef.current ||
        visualStateRef.current ||
        null;


      const strikerId =
        currentState?.strikerId ??
        current.striker_id;

      const nonStrikerId =
        currentState?.nonStrikerId ??
        current.non_striker_id;


      if (
        !strikerId ||
        !nonStrikerId
      ) {
        return;
      }


      /*
      ==============================================
      SAVE ROLLBACK
      ==============================================
      */

      swapRollbackRef.current = {
        state:
          clone(
            currentState
          ),

        fixed:
          clone(
            fixedBatsmenRef.current
          )
      };


      actionBusyRef.current =
        'swap';

      setActionBusy(
        'swap'
      );

      setError('');


      /*
      ==============================================
      INSTANT UI SWAP
      ==============================================
      */

      const nextState = {
        ...(currentState || {}),

        inningsId:
          current.id,

        strikerId:
          nonStrikerId,

        nonStrikerId:
          strikerId
      };


      const previousFixed =
        fixedBatsmenRef.current;


      let nextFixed =
        previousFixed;


      if (
        previousFixed
      ) {
        nextFixed = {
          ...previousFixed,

          strikerSide:
            previousFixed
              .strikerSide ===
            'left'
              ? 'right'
              : 'left',

          leftStats:
            previousFixed
              .rightStats,

          rightStats:
            previousFixed
              .leftStats
        };
      }


      visualStateRef.current =
        nextState;

      optimisticRef.current =
        nextState;

      fixedBatsmenRef.current =
        nextFixed;


      flushSync(() => {
        setOptimistic(
          nextState
        );

        setFixedBatsmen(
          nextFixed
        );
      });


      /*
      ==============================================
      QUEUE SERVER SWAP

      It automatically waits behind
      any balls already queued.
      ==============================================
      */

      enqueueServerAction(
        async () => {
          await Innings.swapStrike(
            current.id
          );
        }
      )
        .then(() => {
          swapRollbackRef.current =
            null;
        })
        .catch(err => {
          const rollback =
            swapRollbackRef.current;

          if (
            rollback
          ) {
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
        })
        .finally(() => {
          swapRollbackRef.current =
            null;

          actionBusyRef.current =
            null;

          setActionBusy(null);
        });
    }, [
      innings,
      enqueueServerAction
    ]);


  /*
  ==================================================
  FAST UNDO
  ==================================================
  */

  const fastUndo =
    useCallback(() => {
      if (
        actionBusyRef.current
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


      undoRollbackRef.current = {
        state:
          clone(
            currentState
          ),

        fixed:
          clone(
            fixedBatsmenRef.current
          )
      };


      actionBusyRef.current =
        'undo';

      setActionBusy(
        'undo'
      );

      setError('');


      /*
      ==============================================
      INSTANT UNDO
      ==============================================
      */

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


      /*
      Remove the history item immediately.
      */

      history.pop();


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
      ==============================================
      QUEUE SERVER UNDO

      It waits behind every score/save
      already queued.
      ==============================================
      */

      enqueueServerAction(
        async () => {
          await Innings.undo(
            current.id
          );
        }
      )
        .then(() => {
          undoRollbackRef.current =
            null;
        })
        .catch(err => {
          const rollback =
            undoRollbackRef.current;


          if (
            rollback
          ) {
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


          /*
          Put the undone history
          back at the top.
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


          setError(
            err?.response?.data
              ?.error ||
            err?.message ||
            'Unable to undo last ball'
          );
        })
        .finally(() => {
          undoRollbackRef.current =
            null;

          actionBusyRef.current =
            null;

          setActionBusy(null);
        });
    }, [
      innings,
      enqueueServerAction
    ]);


  /*
  ==================================================
  START SECOND INNINGS FALLBACK
  ==================================================
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
        /*
        Make sure all score requests
        have reached the server first.
        */
        await serverActionTailRef.current
          .catch(() => {});


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
  ==================================================
  LOADING
  ==================================================
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
  ==================================================
  COMPLETED MATCH
  ==================================================
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
  ==================================================
  IMPORTANT:

  DO NOT render an innings-break
  fallback page.

  The final ball now navigates directly
  to /target.

  This prevents the black / blank
  innings-break screen.
  ==================================================
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
  ==================================================
  TARGET
  ==================================================
  */

  const firstInnings =
    innings.find(item => {
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
    getInningsNumber(
      inn
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
  ==================================================
  DISPLAY SCORE
  ==================================================
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
  ==================================================
  ACTIVE PLAYERS
  ==================================================
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
      p =>
        p.team_id ===
          inn.batting_team_id &&
        p.active !== false
    );


  const bowlingTeamPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active !== false
    );


  /*
  ==================================================
  OUT PLAYERS
  ==================================================
  */

  const outIds =
    new Set(
      (
        currentInnings
          .battingCard ||
        []
      )
        .filter(
          b => b.is_out
        )
        .map(
          b => b.player_id
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
      p =>
        String(p.id) ===
        String(
          effectiveStrikerId
        )
    );


  const nonStriker =
    players.find(
      p =>
        String(p.id) ===
        String(
          effectiveNonStrikerId
        )
    );


  const bowler =
    players.find(
      p =>
        String(p.id) ===
        String(
          effectiveBowlerId
        )
    );


  /*
  ==================================================
  NEED BATSMEN
  ==================================================
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


            const getStats =
              id =>
                id
                  ? battingCard.find(
                      b =>
                        String(
                          b.player_id
                        ) ===
                        String(id)
                    ) || {
                      player_id:
                        id,
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
  ==================================================
  FIXED BATSMAN CARDS
  ==================================================
  */

  const battingCard =
    currentInnings.battingCard ||
    [];


  const getServerBattingStats =
    playerId => {
      if (!playerId) {
        return null;
      }

      return (
        battingCard.find(
          b =>
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
      p =>
        String(p.id) ===
        String(fixedLeftId)
    );


  const rightPlayer =
    players.find(
      p =>
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
        String(
          fixedLeftId
        );


  const rightIsStriker =
    fixedBatsmen
      ? fixedBatsmen.strikerSide ===
        'right'
      : String(
          effectiveStrikerId
        ) ===
        String(
          fixedRightId
        );


  /*
  ==================================================
  BOWLER STATS
  ==================================================
  */

  const serverBowlerStats =
    (
      currentInnings
        .bowlingCard || []
    ).find(
      b =>
        String(
          b.player_id
        ) ===
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
  ==================================================
  RECENT BALLS
  ==================================================
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
          ball =>
            Number(
              ball.over_number
            ) ===
            displayOverNumber
        );


  /*
  ==================================================
  NEXT BOWLER
  ==================================================
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
  ==================================================
  PARTNERSHIP
  ==================================================
  */

  const partnership =
    optimistic?.partnership ||
    currentInnings.partnership ||
    {
      runs: 0,
      balls: 0
    };


  /*
  ==================================================
  RENDER
  ==================================================
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


        <FallOfWickets
          wickets={
            optimistic?.fallOfWickets ||
            currentInnings.fallOfWickets ||
            []
          }
          players={players}
        />


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
                    !!actionBusy
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


            <div className="grid grid-cols-2 gap-2">

              <button
                className="btn btn-secondary"
                disabled={
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
====================================================
BATSMAN CARD
====================================================
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
====================================================
NEXT BOWLER MODAL
====================================================
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
====================================================
FALL OF WICKETS
====================================================
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
                p =>
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
====================================================
STAT
====================================================
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
====================================================
BOWLING STAT
====================================================
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
====================================================
BALL DISPLAY
====================================================
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
====================================================
BATSMEN SELECTION
====================================================
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
      player =>
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
