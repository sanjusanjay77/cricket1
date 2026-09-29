import {
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';

import {
  useParams,
  useNavigate
} from 'react-router-dom';

import {
  Matches,
  Innings
} from '../api/api.js';

import WicketModal
  from '../components/WicketModal.jsx';

import PlayerAutocomplete
  from '../components/PlayerAutocomplete.jsx';

import socket
  from '../socket.js';


/*
================================================================
SCORER
================================================================
*/

export default function Scorer() {

  const { matchId } =
    useParams();

  const navigate =
    useNavigate();


  /*
  ==============================================================
  STATE
  ==============================================================
  */

  const [match, setMatch] =
    useState(null);

  const [players, setPlayers] =
    useState([]);

  const [innings, setInnings] =
    useState([]);

  const [error, setError] =
    useState('');

  const [showWicket, setShowWicket] =
    useState(false);

  const [boundary, setBoundary] =
    useState(null);

  const [extraPicker, setExtraPicker] =
    useState(null);

  const [flashWicket, setFlashWicket] =
    useState(false);

  const [showInitialBowler, setShowInitialBowler] =
    useState(false);

  const [showNextBowler, setShowNextBowler] =
    useState(false);

  const [optimistic, setOptimistic] =
    useState(null);

  const [pendingCount, setPendingCount] =
    useState(0);


  /*
  ==============================================================
  REFS
  ==============================================================
  */

  const optimisticRef =
    useRef(null);

  const actionQueueRef =
    useRef([]);

  const processingQueueRef =
    useRef(false);

  const pendingCountRef =
    useRef(0);

  const latestSocketDataRef =
    useRef(null);

  const loadInProgressRef =
    useRef(false);

  const inningsPollRef =
    useRef(null);

  const boundaryTimer =
    useRef(null);

  const wicketTimer =
    useRef(null);

  const undoHistoryRef =
    useRef([]);

  const undoPreservedRef =
    useRef({
      active: false,
      bowlerId: null,
      strikerId: null,
      nonStrikerId: null
    });


  /*
  ==============================================================
  BASIC HELPERS
  ==============================================================
  */

  const safeArray = value =>
    Array.isArray(value)
      ? value
      : [];


  const getPlayerId = player => {

    if (
      player === undefined ||
      player === null
    ) {
      return null;
    }

    if (
      typeof player === 'object'
    ) {
      return (
        player.id ??
        player.player_id ??
        null
      );
    }

    return player;
  };


  const getBowlerId = inn => {

    if (!inn) {
      return null;
    }

    return (
      inn.current_bowler_id ??
      inn.bowler_id ??
      null
    );
  };


  const getCurrentInningsEntry = (
    sourceInnings = innings
  ) => {

    const list =
      safeArray(sourceInnings);

    if (!list.length) {
      return null;
    }

    const currentNumber =
      Number(
        match?.current_innings || 0
      );

    if (currentNumber > 0) {

      const exact =
        list.find(
          item =>
            Number(
              item?.innings
                ?.innings_number ??
              item?.innings_number ??
              0
            ) === currentNumber
        );

      if (exact) {
        return exact;
      }
    }

    return (
      list
        .slice()
        .sort(
          (a, b) =>
            Number(
              b?.innings
                ?.innings_number ??
              b?.innings_number ??
              0
            ) -
            Number(
              a?.innings
                ?.innings_number ??
              a?.innings_number ??
              0
            )
        )[0] || null
    );
  };


  const getInningsObject = entry => {

    if (!entry) {
      return null;
    }

    return (
      entry.innings ||
      entry
    );
  };


  const getInningsNumber = inn =>
    Number(
      inn?.innings_number ||
      0
    );


  const getBowlerBallsFromStats =
    stats => {

      if (!stats) {
        return 0;
      }

      if (
        stats.balls !== undefined &&
        stats.balls !== null
      ) {
        return Number(
          stats.balls
        );
      }

      const overs =
        String(
          stats.overs || '0.0'
        );

      const parts =
        overs.split('.');

      return (
        Number(parts[0] || 0) * 6 +
        Number(parts[1] || 0)
      );
    };


  /*
  ==============================================================
  CLEAR UNDO PRESERVATION
  ============================================================== 
  */

  const clearUndoPreservation =
    useCallback(() => {

      undoPreservedRef.current = {
        active: false,
        bowlerId: null,
        strikerId: null,
        nonStrikerId: null
      };

    }, []);


  /*
  ==============================================================
  INNINGS COMPLETION
  ============================================================== 
  */

  const isInningsCompleteFor =
    useCallback(({
      inningsData,
      totalRuns,
      totalBalls,
      totalWickets
    }) => {

      if (!inningsData) {
        return false;
      }

      if (
        inningsData.is_completed === true ||
        Number(
          inningsData.is_completed
        ) === 1
      ) {
        return true;
      }

      if (
        inningsData.status ===
        'completed'
      ) {
        return true;
      }

      if (
        inningsData.target != null &&
        Number(totalRuns) >=
          Number(inningsData.target)
      ) {
        return true;
      }

      if (
        Number(totalWickets) >= 10
      ) {
        return true;
      }

      const limit =
        Number(
          match?.overs_limit || 0
        );

      if (
        limit > 0 &&
        Number(totalBalls) >=
          limit * 6
      ) {
        return true;
      }

      return false;

    }, [match]);


  /*
  ==============================================================
  NORMALIZE SERVER RESPONSE
  ============================================================== 
  */

  const normalizeServerData =
    useCallback(data => {

      if (!data) {
        return null;
      }

      /*
      ------------------------------------------------------------
      POSSIBLE API SHAPES
      ------------------------------------------------------------
      */

      const serverMatch =
        data.match ||
        data.data?.match ||
        (
          data.team1_short ||
          data.team2_short ||
          data.id
            ? data
            : null
        );

      const serverPlayers =
        Array.isArray(
          data.players
        )
          ? data.players
          : Array.isArray(
              data.data?.players
            )
            ? data.data.players
            : null;

      const serverInnings =
        Array.isArray(
          data.innings
        )
          ? data.innings
          : Array.isArray(
              data.data?.innings
            )
            ? data.data.innings
            : null;

      return {
        match:
          serverMatch,

        players:
          serverPlayers,

        innings:
          serverInnings
      };

    }, []);


  /*
  ==============================================================
  APPLY SERVER DATA
  ============================================================== 
  */

  const applyServerData =
    useCallback(
      (
        data,
        {
          preserveOptimistic = false
        } = {}
      ) => {

        if (!data) {
          return;
        }

        const normalized =
          normalizeServerData(
            data
          );

        if (!normalized) {
          return;
        }

        if (
          normalized.match
        ) {
          setMatch(
            normalized.match
          );
        }

        /*
        IMPORTANT:
        Never replace players with [] just because
        a socket packet doesn't contain players.
        */

        if (
          Array.isArray(
            normalized.players
          )
        ) {
          setPlayers(
            normalized.players
          );
        }

        if (
          Array.isArray(
            normalized.innings
          )
        ) {

          setInnings(
            normalized.innings
          );

          const current =
            normalized.innings
              .slice()
              .sort(
                (a, b) =>
                  Number(
                    getInningsObject(b)
                      ?.innings_number ||
                    0
                  ) -
                  Number(
                    getInningsObject(a)
                      ?.innings_number ||
                    0
                  )
              )[0];

          const currentInn =
            getInningsObject(
              current
            );

          /*
          --------------------------------------------------------
          IMPORTANT FOR INNINGS 2
          --------------------------------------------------------
          */

          if (
            currentInn &&
            getInningsNumber(
              currentInn
            ) >= 2
          ) {

            setShowInitialBowler(
              false
            );

            setShowNextBowler(
              false
            );

            /*
            If this is a fresh second innings,
            remove stale first-innings optimistic data.
            */

            if (
              Number(
                currentInn.total_balls ||
                0
              ) === 0
            ) {

              optimisticRef.current =
                null;

              if (
                !preserveOptimistic
              ) {
                setOptimistic(
                  null
                );
              }

              clearUndoPreservation();
            }
          }

          /*
          --------------------------------------------------------
          MATCH COMPLETED
          --------------------------------------------------------
          */

          if (
            normalized.match?.status ===
            'completed'
          ) {

            setShowInitialBowler(
              false
            );

            setShowNextBowler(
              false
            );

            setOptimistic(
              null
            );

            optimisticRef.current =
              null;
          }
        }

        if (
          !preserveOptimistic
        ) {
          setOptimistic(
            null
          );

          optimisticRef.current =
            null;
        }

      },
      [
        normalizeServerData,
        clearUndoPreservation
      ]
    );


  /*
  ==============================================================
  LOAD FULL MATCH
  ============================================================== 
  */

  const loadFull =
    useCallback(
      async ({
        silent = false
      } = {}) => {

        if (
          !matchId ||
          loadInProgressRef.current
        ) {
          return null;
        }

        loadInProgressRef.current =
          true;

        try {

          const data =
            await Matches.get(
              matchId
            );

          applyServerData(
            data
          );

          if (
            !silent
          ) {
            setError('');
          }

          return data;

        } catch (err) {

          if (
            !silent
          ) {

            setError(
              err?.response?.data
                ?.error ||
              err?.response?.data
                ?.message ||
              err?.message ||
              'Unable to load match'
            );
          }

          return null;

        } finally {

          loadInProgressRef.current =
            false;
        }

      },
      [
        matchId,
        applyServerData
      ]
    );


  /*
  ==============================================================
  INITIAL LOAD
  ============================================================== 
  */

  useEffect(() => {

    loadFull();

  }, [loadFull]);


  /*
  ==============================================================
  SOCKET CONNECTION
  ============================================================== 
  */

  useEffect(() => {

    if (
      !matchId ||
      !socket
    ) {
      return;
    }

    const room =
      `match-${matchId}`;

    try {
      socket.emit(
        'join-match',
        matchId
      );
    } catch {
      // ignore
    }

    const handleScoreUpdate =
      data => {

        latestSocketDataRef.current =
          data;

        /*
        Don't overwrite optimistic UI while
        local saves are pending.
        */

        if (
          pendingCountRef.current > 0
        ) {
          return;
        }

        applyServerData(
          data
        );
      };

    socket.on(
      'score-update',
      handleScoreUpdate
    );

    return () => {

      socket.off(
        'score-update',
        handleScoreUpdate
      );

      try {
        socket.emit(
          'leave-match',
          matchId
        );
      } catch {
        // ignore
      }

    };

  }, [
    matchId,
    applyServerData
  ]);


  /*
  ==============================================================
  SECOND-INNINGS FALLBACK POLLING
  ============================================================== 
  */

  useEffect(() => {

    const currentEntry =
      getCurrentInningsEntry(
        innings
      );

    const currentInn =
      getInningsObject(
        currentEntry
      );

    if (
      !currentInn
    ) {
      return;
    }

    const complete =
      isInningsCompleteFor({
        inningsData:
          currentInn,

        totalRuns:
          Number(
            optimistic?.total_runs ??
            currentInn.total_runs ??
            0
          ),

        totalBalls:
          Number(
            optimistic?.total_balls ??
            currentInn.total_balls ??
            0
          ),

        totalWickets:
          Number(
            optimistic?.total_wickets ??
            currentInn.total_wickets ??
            0
          )
      });

    /*
    Only poll while a completed innings is waiting
    for the next innings.

    This is a fallback only. Normally Socket.IO
    will switch immediately.
    */

    if (
      complete &&
      getInningsNumber(
        currentInn
      ) === 1 &&
      match?.status !== 'completed'
    ) {

      if (
        inningsPollRef.current
      ) {
        return;
      }

      inningsPollRef.current =
        setInterval(
          async () => {

            try {

              const data =
                await Matches.get(
                  matchId
                );

              const normalized =
                normalizeServerData(
                  data
                );

              const list =
                safeArray(
                  normalized?.innings
                );

              const second =
                list.find(
                  item =>
                    getInningsNumber(
                      getInningsObject(
                        item
                      )
                    ) === 2
                );

              if (
                second
              ) {

                clearInterval(
                  inningsPollRef.current
                );

                inningsPollRef.current =
                  null;

                applyServerData(
                  data
                );
              }

            } catch {
              // retry
            }

          },
          700
        );

    } else {

      if (
        inningsPollRef.current
      ) {

        clearInterval(
          inningsPollRef.current
        );

        inningsPollRef.current =
          null;
      }
    }

    return () => {

      if (
        inningsPollRef.current
      ) {

        clearInterval(
          inningsPollRef.current
        );

        inningsPollRef.current =
          null;
      }

    };

  }, [
    matchId,
    innings,
    match,
    optimistic,
    normalizeServerData,
    applyServerData,
    isInningsCompleteFor
  ]);


  /*
  ==============================================================
  PLAYER CREATED
  ============================================================== 
  */

  const handlePlayerCreated =
    useCallback(player => {

      if (!player) {
        return;
      }

      setPlayers(
        previous => {

          const list =
            Array.isArray(
              previous
            )
              ? previous.slice()
              : [];

          const id =
            getPlayerId(
              player
            );

          const exists =
            list.some(
              p =>
                String(
                  p?.id
                ) ===
                String(id)
            );

          if (
            exists
          ) {
            return list;
          }

          return [
            ...list,
            player
          ];

        }
      );

    }, []);


  /*
  ==============================================================
  ACTION WRAPPER
  ============================================================== 
  */

  const act =
    useCallback(
      async action => {

        try {

          setError('');

          await action();

        } catch (err) {

          setError(
            err?.response?.data
              ?.error ||
            err?.response?.data
              ?.message ||
            err?.message ||
            'Action failed'
          );

        }

      },
      []
    );


  /*
  ==============================================================
  QUEUE COUNT
  ============================================================== 
  */

  const updatePendingCount =
    count => {

      pendingCountRef.current =
        Math.max(
          0,
          count
        );

      setPendingCount(
        Math.max(
          0,
          count
        )
      );
    };


  /*
  ==============================================================
  OPTIMISTIC BALL
  ============================================================== 
  */

  const buildOptimisticBall =
    useCallback(
      (
        previous,
        action
      ) => {

        const base =
          previous || {};

        const runs =
          Number(
            action?.runs || 0
          );

        const extraRuns =
          Number(
            action?.extra_runs || 0
          );

        const type =
          action?.extra_type ||
          null;

        const isWide =
          type === 'wide';

        const isNoBall =
          type === 'noball';

        const isBye =
          type === 'bye';

        const isLegBye =
          type === 'legbye';

        const legal =
          action?.is_legal !== false &&
          !isWide &&
          !isNoBall;

        const batsmanRuns =
          isBye ||
          isLegBye ||
          isWide
            ? 0
            : runs;

        const teamRuns =
          isWide
            ? Math.max(
                1,
                extraRuns
              )
            : isNoBall
              ? 1 +
                runs
              : isBye ||
                isLegBye
                ? Math.max(
                    1,
                    extraRuns
                  )
                : runs;

        const totalRuns =
          Number(
            base.total_runs || 0
          ) +
          teamRuns;

        const totalBalls =
          Number(
            base.total_balls || 0
          ) +
          (legal ? 1 : 0);

        const totalWickets =
          Number(
            base.total_wickets || 0
          ) +
          (action?.is_wicket ? 1 : 0);

        const strikerId =
          base.strikerId ||
          null;

        const nonStrikerId =
          base.nonStrikerId ||
          null;

        let nextStriker =
          strikerId;

        let nextNonStriker =
          nonStrikerId;

        /*
        Odd runs rotate strike.

        At the end of every legal over,
        strike also changes.
        */

        if (
          legal &&
          Math.abs(
            batsmanRuns +
            (
              isBye ||
              isLegBye
                ? extraRuns
                : 0
            )
          ) % 2 === 1
        ) {

          nextStriker =
            nonStrikerId;

          nextNonStriker =
            strikerId;
        }

        if (
          legal &&
          totalBalls > 0 &&
          totalBalls % 6 === 0
        ) {

          const temp =
            nextStriker;

          nextStriker =
            nextNonStriker;

          nextNonStriker =
            temp;
        }

        const next =
          {
            ...base,

            total_runs:
              totalRuns,

            total_balls:
              totalBalls,

            total_wickets:
              totalWickets,

            strikerId:
              nextStriker,

            nonStrikerId:
              nextNonStriker
          };

        /*
        ----------------------------------------------------------
        BATSMAN STATS
        ----------------------------------------------------------
        */

        const statsById = {
          ...(base.battingStatsById || {})
        };

        if (
          strikerId
        ) {

          const old =
            statsById[
              String(
                strikerId
              )
            ] || {
              player_id:
                strikerId,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              strike_rate: 0
            };

          const newRuns =
            Number(
              old.runs || 0
            ) +
            batsmanRuns;

          const newBalls =
            Number(
              old.balls || 0
            ) +
            (legal ? 1 : 0);

          statsById[
            String(
              strikerId
            )
          ] = {
            ...old,

            runs:
              newRuns,

            balls:
              newBalls,

            fours:
              Number(
                old.fours || 0
              ) +
              (
                batsmanRuns === 4
                  ? 1
                  : 0
              ),

            sixes:
              Number(
                old.sixes || 0
              ) +
              (
                batsmanRuns === 6
                  ? 1
                  : 0
              ),

            is_out:
              action?.is_wicket
                ? (
                    String(
                      action?.dismissed_id
                    ) ===
                    String(
                      strikerId
                    )
                  )
                : old.is_out,

            strike_rate:
              newBalls > 0
                ? (
                    newRuns /
                    newBalls *
                    100
                  ).toFixed(2)
                : 0
          };
        }

        next.battingStatsById =
          statsById;

        /*
        ----------------------------------------------------------
        RECENT BALL
        ----------------------------------------------------------
        */

        const ball = {
          id:
            `optimistic-${Date.now()}`,

          runs_batsman:
            batsmanRuns,

          extra_runs:
            extraRuns,

          extra_type:
            type,

          is_wicket:
            !!action?.is_wicket,

          is_legal:
            legal,

          over_number:
            Math.floor(
              (
                totalBalls -
                (legal ? 1 : 0)
              ) / 6
            )
        };

        next.recentBalls = [
          ...(base.recentBalls || []),
          ball
        ].slice(-24);

        return next;

      },
      []
    );


  /*
  ==============================================================
  PROCESS ACTION QUEUE
  ============================================================== 
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

        try {

          while (
            actionQueueRef.current
              .length
          ) {

            const item =
              actionQueueRef.current
                .shift();

            if (!item) {
              continue;
            }

            try {

              let result = null;

              if (
                item.type === 'ball'
              ) {

                result =
                  await Innings.ball(
                    item.inningsId,
                    item.payload
                  );

              } else if (
                item.type ===
                'swap'
              ) {

                result =
                  await Innings.swapStrike(
                    item.inningsId
                  );

              } else if (
                item.type ===
                'undo'
              ) {

                result =
                  await Innings.undo(
                    item.inningsId
                  );
              }

              item.resolve(
                result
              );

            } catch (err) {

              item.reject(
                err
              );
            }

            /*
            ------------------------------------------------------
            ONE SAVE FINISHED
            ------------------------------------------------------
            */

            const nextCount =
              Math.max(
                0,
                pendingCountRef.current -
                1
              );

            updatePendingCount(
              nextCount
            );
          }

        } finally {

          processingQueueRef.current =
            false;

          /*
          --------------------------------------------------------
          AFTER QUEUE FINISHES
          --------------------------------------------------------
          */

          if (
            pendingCountRef.current ===
            0
          ) {

            /*
            Don't rebuild the optimistic screen while
            a new innings is already being shown.
            */

            const data =
              await loadFull({
                silent: true
              });

            const normalized =
              normalizeServerData(
                data
              );

            const list =
              safeArray(
                normalized?.innings
              );

            const second =
              list.find(
                item =>
                  getInningsNumber(
                    getInningsObject(
                      item
                    )
                  ) === 2
              );

            if (
              second
            ) {

              setShowInitialBowler(
                false
              );

              setShowNextBowler(
                false
              );

              setOptimistic(
                null
              );

              optimisticRef.current =
                null;

              clearUndoPreservation();
            }
          }
        }

      },
      [
        loadFull,
        normalizeServerData,
        clearUndoPreservation
      ]
    );


  /*
  ==============================================================
  QUEUE ACTION
  ============================================================== 
  */

  const queueAction =
    useCallback(
      (
        type,
        inningsId,
        payload = null
      ) => {

        return new Promise(
          (
            resolve,
            reject
          ) => {

            actionQueueRef.current
              .push({
                type,
                inningsId,
                payload,
                resolve,
                reject
              });

            updatePendingCount(
              pendingCountRef.current +
              1
            );

            processActionQueue();

          }
        );

      },
      [
        processActionQueue
      ]
    );


  /*
  ==============================================================
  PLAY BALL
  ============================================================== 
  */

  const playBall =
    useCallback(
      action => {

        const entry =
          getCurrentInningsEntry();

        const inn =
          getInningsObject(
            entry
          );

        if (!inn) {
          return;
        }

        if (
          isInningsCompleteFor({
            inningsData:
              inn,

            totalRuns:
              Number(
                optimisticRef.current
                  ?.total_runs ??
                inn.total_runs ??
                0
              ),

            totalBalls:
              Number(
                optimisticRef.current
                  ?.total_balls ??
                inn.total_balls ??
                0
              ),

            totalWickets:
              Number(
                optimisticRef.current
                  ?.total_wickets ??
                inn.total_wickets ??
                0
              )
          })
        ) {
          return;
        }

        const currentOptimistic =
          optimisticRef.current || {
            total_runs:
              Number(
                inn.total_runs || 0
              ),

            total_balls:
              Number(
                inn.total_balls || 0
              ),

            total_wickets:
              Number(
                inn.total_wickets || 0
              ),

            strikerId:
              inn.striker_id,

            nonStrikerId:
              inn.non_striker_id,

            battingStatsById:
              {},

            recentBalls:
              safeArray(
                entry?.recentBalls
              )
          };

        /*
        ----------------------------------------------------------
        OPTIMISTIC UI FIRST
        ----------------------------------------------------------
        */

        const nextOptimistic =
          buildOptimisticBall(
            currentOptimistic,
            action
          );

        optimisticRef.current =
          nextOptimistic;

        setOptimistic(
          nextOptimistic
        );

        /*
        ----------------------------------------------------------
        VISUAL EFFECTS
        ----------------------------------------------------------
        */

        const batsmanRuns =
          Number(
            action?.runs || 0
          );

        if (
          batsmanRuns === 4
        ) {

          setBoundary(
            'four'
          );

          clearTimeout(
            boundaryTimer.current
          );

          boundaryTimer.current =
            setTimeout(
              () =>
                setBoundary(null),
              700
            );
        }

        if (
          batsmanRuns === 6
        ) {

          setBoundary(
            'six'
          );

          clearTimeout(
            boundaryTimer.current
          );

          boundaryTimer.current =
            setTimeout(
              () =>
                setBoundary(null),
              900
            );
        }

        if (
          action?.is_wicket
        ) {

          setFlashWicket(
            true
          );

          clearTimeout(
            wicketTimer.current
          );

          wicketTimer.current =
            setTimeout(
              () =>
                setFlashWicket(false),
              700
            );
        }

        /*
        ----------------------------------------------------------
        SAVE IN BACKGROUND
        ----------------------------------------------------------
        */

        queueAction(
          'ball',
          inn.id,
          action
        )
          .then(
            async result => {

              /*
              ----------------------------------------------------
              IMPORTANT:
              If backend has created innings 2,
              fetch it immediately.
              ----------------------------------------------------
              */

              const hasNextInnings =
                !!result?.nextInnings ||
                !!result?.next_innings;

              const completed =
                !!result?.inningsCompleted ||
                !!result?.innings_completed;

              if (
                hasNextInnings ||
                completed
              ) {

                const data =
                  await Matches.get(
                    matchId
                  );

                applyServerData(
                  data
                );

                const normalized =
                  normalizeServerData(
                    data
                  );

                const list =
                  safeArray(
                    normalized?.innings
                  );

                const second =
                  list.find(
                    item =>
                      getInningsNumber(
                        getInningsObject(
                          item
                        )
                      ) === 2
                  );

                if (
                  second
                ) {

                  setOptimistic(
                    null
                  );

                  optimisticRef.current =
                    null;

                  setShowInitialBowler(
                    false
                  );

                  setShowNextBowler(
                    false
                  );

                  clearUndoPreservation();
                }
              }

            }
          )
          .catch(
            err => {

              setError(
                err?.response?.data
                  ?.error ||
                err?.response?.data
                  ?.message ||
                err?.message ||
                'Unable to save ball'
              );

            }
          );

      },
      [
        matchId,
        buildOptimisticBall,
        queueAction,
        getCurrentInningsEntry,
        isInningsCompleteFor,
        applyServerData,
        normalizeServerData,
        clearUndoPreservation
      ]
    );


  /*
  ==============================================================
  SWAP STRIKE
  ============================================================== 
  */

  const handleSwapStrike =
    useCallback(
      () => {

        const entry =
          getCurrentInningsEntry();

        const inn =
          getInningsObject(
            entry
          );

        if (!inn) {
          return;
        }

        const current =
          optimisticRef.current || {};

        const strikerId =
          current.strikerId ??
          inn.striker_id ??
          null;

        const nonStrikerId =
          current.nonStrikerId ??
          inn.non_striker_id ??
          null;

        if (
          !strikerId ||
          !nonStrikerId
        ) {
          return;
        }

        /*
        ----------------------------------------------------------
        INSTANT UI SWAP
        ----------------------------------------------------------
        */

        const next = {
          ...(current || {}),

          strikerId:
            nonStrikerId,

          nonStrikerId:
            strikerId
        };

        optimisticRef.current =
          next;

        setOptimistic(
          next
        );

        /*
        ----------------------------------------------------------
        BACKGROUND SERVER SAVE
        ----------------------------------------------------------
        */

        queueAction(
          'swap',
          inn.id
        )
          .catch(
            err => {

              setError(
                err?.response?.data
                  ?.error ||
                err?.response?.data
                  ?.message ||
                err?.message ||
                'Unable to swap batsmen'
              );

              /*
              Reload authoritative state
              if swap failed.
              */

              loadFull({
                silent: true
              });

            }
          );

      },
      [
        getCurrentInningsEntry,
        queueAction,
        loadFull
      ]
    );


  /*
  ==============================================================
  UNDO
  ============================================================== 
  */

  const handleUndo =
    useCallback(
      async () => {

        const entry =
          getCurrentInningsEntry();

        const inn =
          getInningsObject(
            entry
          );

        if (!inn) {
          return;
        }

        try {

          setError('');

          /*
          --------------------------------------------------------
          PRESERVE CURRENT PLAYERS/BOWLER
          --------------------------------------------------------
          */

          undoPreservedRef.current = {
            active: true,

            bowlerId:
              getBowlerId(
                inn
              ),

            strikerId:
              inn.striker_id,

            nonStrikerId:
              inn.non_striker_id
          };

          await queueAction(
            'undo',
            inn.id
          );

          /*
          --------------------------------------------------------
          ALWAYS RELOAD AFTER UNDO
          --------------------------------------------------------
          */

          await loadFull({
            silent: true
          });

          optimisticRef.current =
            null;

          setOptimistic(
            null
          );

          /*
          --------------------------------------------------------
          KEEP BOWLER SELECTION STABLE
          --------------------------------------------------------
          */

          clearUndoPreservation();

        } catch (err) {

          clearUndoPreservation();

          setError(
            err?.response?.data
              ?.error ||
            err?.response?.data
              ?.message ||
            err?.message ||
            'Unable to undo'
          );

        }

      },
      [
        getCurrentInningsEntry,
        queueAction,
        loadFull,
        clearUndoPreservation
      ]
    );


  /*
  ==============================================================
  CLEANUP
  ============================================================== 
  */

  useEffect(() => {

    return () => {

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

      if (
        inningsPollRef.current
      ) {
        clearInterval(
          inningsPollRef.current
        );
      }

    };

  }, []);


  /*
  ==============================================================
  CURRENT INNINGS
  ============================================================== 
  */

  const currentEntry =
    getCurrentInningsEntry();

  const currentInnings =
    currentEntry || {};

  const inn =
    getInningsObject(
      currentEntry
    );


  /*
  ==============================================================
  LOADING
  ============================================================== 
  */

  if (
    !match ||
    !inn
  ) {

    return (
      <div className="max-w-2xl mx-auto">

        <div className="card text-center py-12">

          <div className="text-3xl mb-3">
            🏏
          </div>

          <div className="text-lg font-bold text-white">
            Loading match…
          </div>

          {error && (
            <div className="text-red-400 text-sm mt-3">
              {error}
            </div>
          )}

        </div>

      </div>
    );
  }


  /*
  ==============================================================
  MATCH COMPLETED
  ============================================================== 
  */

  if (
    match.status ===
    'completed'
  ) {

    return (
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="card text-center">

          <div className="text-4xl mb-3">
            🏆
          </div>

          <div className="text-2xl font-extrabold text-white">
            Match Complete
          </div>

          {match.result && (
            <div className="text-sm text-slate-400 mt-2">
              {match.result}
            </div>
          )}

          <button
            className="btn btn-primary w-full mt-5"
            onClick={() =>
              navigate(
                `/match/${matchId}/live`
              )
            }
          >
            View Full Scoreboard
          </button>

        </div>

      </div>
    );
  }


  /*
  ==============================================================
  SAFE PLAYERS
  ============================================================== 
  */

  const safePlayers =
    safeArray(
      players
    );


  /*
  ==============================================================
  TEAM PLAYERS
  ============================================================== 
  */

  const battingTeamPlayers =
    safePlayers.filter(
      p =>
        String(
          p?.team_id
        ) ===
        String(
          inn?.batting_team_id
        )
    );

  const bowlingTeamPlayers =
    safePlayers.filter(
      p =>
        String(
          p?.team_id
        ) ===
        String(
          inn?.bowling_team_id
        )
    );


  /*
  ==============================================================
  EFFECTIVE IDS
  ============================================================== 
  */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn?.striker_id ??
    undoPreservedRef.current
      ?.strikerId ??
    null;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn?.non_striker_id ??
    undoPreservedRef.current
      ?.nonStrikerId ??
    null;

  const effectiveBowlerId =
    optimistic?.activeBowlerId ??
    getBowlerId(
      inn
    ) ??
    undoPreservedRef.current
      ?.bowlerId ??
    null;


  /*
  ==============================================================
  SCORE
  ============================================================== 
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
  ==============================================================
  TARGET / COMPLETION
  ============================================================== 
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
  ==============================================================
  OUT IDS
  ============================================================== 
  */

  const outIds =
    new Set();

  const battingCard =
    safeArray(
      optimistic?.battingCard ||
      currentEntry?.battingCard
    );

  battingCard.forEach(
    stats => {

      if (
        stats?.is_out &&
        stats?.player_id
      ) {

        outIds.add(
          stats.player_id
        );
      }

    }
  );


  if (
    optimistic?.battingStatsById
  ) {

    Object.values(
      optimistic.battingStatsById
    ).forEach(
      stats => {

        if (
          stats?.is_out &&
          stats?.player_id
        ) {

          outIds.add(
            stats.player_id
          );
        }

      }
    );
  }


  /*
  ==============================================================
  PLAYER OBJECTS
  ============================================================== 
  */

  const striker =
    safePlayers.find(
      p =>
        String(
          p?.id
        ) ===
        String(
          effectiveStrikerId
        )
    );

  const nonStriker =
    safePlayers.find(
      p =>
        String(
          p?.id
        ) ===
        String(
          effectiveNonStrikerId
        )
    );

  const bowler =
    safePlayers.find(
      p =>
        String(
          p?.id
        ) ===
        String(
          effectiveBowlerId
        )
    );


  /*
  ==============================================================
  SELECT BATSMEN
  ============================================================== 
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
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="card">

          <div className="flex justify-between items-center">

            <div>

              <div className="text-sm text-slate-400">
                {match.team1_short} vs {match.team2_short}
              </div>

              <div className="text-3xl font-extrabold text-white">

                {displayTotalRuns}

                <span className="text-slate-400">
                  /{displayTotalWickets}
                </span>

              </div>

              {Number(
                inn.innings_number
              ) === 2 && (
                <div className="text-xs text-amber-400 mt-1 font-semibold">
                  2nd Innings · Target {inn.target}
                </div>
              )}

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

          outIds={
            outIds
          }

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
              String(
                finalStriker
              ) ===
              String(
                finalNonStriker
              )
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

                const next = {
                  ...(optimisticRef.current || {}),

                  strikerId:
                    finalStriker,

                  nonStrikerId:
                    finalNonStriker
                };

                optimisticRef.current =
                  next;

                setOptimistic(
                  next
                );

                /*
                Reload so the new innings/batsmen
                state is authoritative.
                */

                const data =
                  await Matches.get(
                    matchId
                  );

                applyServerData(
                  data,
                  {
                    preserveOptimistic:
                      true
                  }
                );

              }
            );

          }}
        />

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

      </div>
    );
  }


  /*
  ==============================================================
  BATSMAN STATS
  ============================================================== 
  */

  const serverStrikerStats =
    battingCard.find(
      b =>
        String(
          b?.player_id
        ) ===
        String(
          effectiveStrikerId
        )
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
        String(
          b?.player_id
        ) ===
        String(
          effectiveNonStrikerId
        )
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


  const strikerStats =
    optimistic
      ?.battingStatsById
      ?.[
        String(
          effectiveStrikerId
        )
      ] ||
    serverStrikerStats;


  const nonStrikerStats =
    optimistic
      ?.battingStatsById
      ?.[
        String(
          effectiveNonStrikerId
        )
      ] ||
    serverNonStrikerStats;


  /*
  ==============================================================
  BOWLER STATS
  ============================================================== 
  */

  const bowlingCard =
    safeArray(
      currentEntry?.bowlingCard
    );

  const serverBowlerStats =
    bowlingCard.find(
      b =>
        String(
          b?.player_id
        ) ===
        String(
          effectiveBowlerId
        )
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
    String(
      effectiveBowlerId
    )
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;


  /*
  ==============================================================
  RECENT BALLS
  ============================================================== 
  */

  const recentBalls =
    safeArray(
      optimistic?.recentBalls ||
      currentEntry?.recentBalls
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
  ==============================================================
  NEXT BOWLER
  ============================================================== 
  */

  const needsNextBowler =
    !inningsComplete &&
    !effectiveBowlerId &&
    displayTotalBalls > 0 &&
    displayTotalBalls % 6 === 0 &&
    !undoPreservedRef.current?.active;


  /*
  ==============================================================
  PARTNERSHIP
  ============================================================== 
  */

  const partnership =
    optimistic?.partnership ||
    (
      currentEntry?.partnership &&
      typeof currentEntry.partnership ===
        'object'
        ? currentEntry.partnership
        : null
    ) || {
      runs:
        0,

      balls:
        0
    };


  /*
  ==============================================================
  RENDER
  ============================================================== 
  */

  return (
    <div className="max-w-2xl mx-auto space-y-4">

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


      {/* =====================================================
          SCORE HEADER
      ===================================================== */}

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

            {Number(
              inn.innings_number
            ) === 2 && (
              <div className="text-xs text-amber-400 font-semibold mt-1">
                2ND INNINGS · TARGET {inn.target}
              </div>
            )}

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


        {/* ===================================================
            BATSMEN
        =================================================== */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">

          <BatsmanCard
            player={
              striker
            }
            stats={
              strikerStats
            }
            striker
          />

          <BatsmanCard
            player={
              nonStriker
            }
            stats={
              nonStrikerStats
            }
          />

        </div>


        {/* ===================================================
            BOWLER
        =================================================== */}

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


        {/* ===================================================
            CURRENT OVER
        =================================================== */}

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
                    ball={
                      ball
                    }
                  />

                )
              )}

            </div>

          )}

        </div>

      </div>


      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}


      {/* =====================================================
          INNINGS COMPLETE
      ===================================================== */}

      {inningsComplete && (

        <div className="card">

          <div className="text-center">

            <div className="text-3xl mb-2">
              🏏
            </div>

            <div className="text-xl font-extrabold text-white">

              {Number(
                inn.innings_number
              ) === 1
                ? '1st Innings Complete'
                : 'Innings Complete'}

            </div>

            <div className="text-sm text-slate-400 mt-1">

              {displayTotalRuns}/
              {displayTotalWickets}
              {' '}
              ({displayOvers} overs)

            </div>

            {Number(
              inn.innings_number
            ) === 1 ? (

              <div className="text-xs text-emerald-400 mt-2 font-medium">
                Preparing 2nd innings…
              </div>

            ) : (

              <div className="text-xs text-slate-500 mt-2">
                Match complete
              </div>

            )}

          </div>

        </div>

      )}


      {/* =====================================================
          SCORING CONTROLS
      ===================================================== */}

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
                    setShowWicket(
                      true
                    )
                  }
                >
                  OUT
                </button>

              </div>

            </div>


            {/* =================================================
                EXTRAS
            ================================================= */}

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

                <div>

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


            {/* =================================================
                ACTIONS
            ================================================= */}

            <div className="grid grid-cols-2 gap-2">

              <button
                className="btn btn-secondary"
                onClick={
                  handleUndo
                }
                disabled={
                  pendingCount > 0
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


      {/* =====================================================
          INITIAL BOWLER
      ===================================================== */}

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
                setShowInitialBowler(
                  true
                )
              }
            >
              🎯 Select Bowler to Start
            </button>

          </div>
        )}


      {/* =====================================================
          NEXT BOWLER
      ===================================================== */}

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


      {/* =====================================================
          PARTNERSHIP
      ===================================================== */}

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


      {/* =====================================================
          FALL OF WICKETS
      ===================================================== */}

      <FallOfWickets
        wickets={
          safeArray(
            optimistic?.fallOfWickets ||
            currentEntry?.fallOfWickets
          )
        }
        players={
          safePlayers
        }
      />


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
          INITIAL BOWLER MODAL
      ===================================================== */}

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

          error={
            error
          }

          onSelect={
            async selected => {

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

                const next = {
                  ...(optimisticRef.current || {}),

                  activeBowlerId:
                    bowlerId,

                  inningsComplete:
                    false
                };

                optimisticRef.current =
                  next;

                setOptimistic(
                  next
                );

                clearUndoPreservation();

                setShowInitialBowler(
                  false
                );

              } catch (err) {

                setError(
                  err?.response?.data
                    ?.error ||
                  err?.response?.data
                    ?.message ||
                  err?.message ||
                  'Unable to select bowler'
                );

              }

            }
          }
        />

      )}


      {/* =====================================================
          NEXT BOWLER MODAL
      ===================================================== */}

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

            error={
              error
            }

            onSelect={
              async selected => {

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

                  const next = {
                    ...(optimisticRef.current || {}),

                    activeBowlerId:
                      bowlerId,

                    inningsComplete:
                      false
                  };

                  optimisticRef.current =
                    next;

                  setOptimistic(
                    next
                  );

                  clearUndoPreservation();

                  setShowNextBowler(
                    false
                  );

                } catch (err) {

                  setError(
                    err?.response?.data
                      ?.error ||
                    err?.response?.data
                      ?.message ||
                    err?.message ||
                    'Unable to select bowler'
                  );

                }

              }
            }
          />

        )}


      {/* =====================================================
          WICKET MODAL
      ===================================================== */}

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
            setShowWicket(
              false
            )
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
                  Innings Starting
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
                Bowler
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
              Start Over →
            </button>

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
          value={
            fours
          }
          label="4s"
        />

        <Stat
          value={
            sixes
          }
          label="6s"
        />

        <Stat
          value={
            strikeRate
          }
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

    label =
      'W';

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

    label =
      '4';

    className =
      'bg-emerald-600';

  } else if (
    Number(
      safeBall.runs_batsman
    ) === 6
  ) {

    label =
      '6';

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

    <div className="card space-y-4">

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

              setStriker(
                value
              );

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

              setNonStriker(
                value
              );

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
        disabled={
          !canConfirm
        }
        onClick={
          handleConfirm
        }
      >
        Confirm
      </button>

    </div>
  );
}
