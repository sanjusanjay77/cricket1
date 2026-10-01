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


/* =========================================================
   HELPERS
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanId(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  return String(value);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getInningsNumber(inn) {
  return numberValue(
    inn?.innings_number ??
      inn?.innings_no ??
      inn?.number ??
      inn?.innings?.innings_number ??
      inn?.innings?.innings_no ??
      inn?.innings?.number,
    1
  );
}

function getPlayerName(players, id) {
  if (!id) return '—';

  const found = safeArray(players).find(
    (p) =>
      cleanId(p?.id) === cleanId(id) ||
      cleanId(p?.player_id) === cleanId(id)
  );

  return (
    found?.name ||
    found?.player_name ||
    found?.full_name ||
    'Unknown'
  );
}

function parseCricketOvers(overs) {
  if (overs === null || overs === undefined) {
    return 0;
  }

  const text = String(overs);

  if (!text.includes('.')) {
    return numberValue(text, 0) * 6;
  }

  const [overPart, ballPart] = text.split('.');

  const completedOvers = numberValue(overPart, 0);
  const balls = numberValue(ballPart, 0);

  return completedOvers * 6 + balls;
}

function ballsToOvers(balls) {
  const totalBalls = Math.max(
    0,
    Math.floor(numberValue(balls, 0))
  );

  return `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;
}

function calculateEconomy(runs, legalBalls) {
  const r = numberValue(runs, 0);
  const b = numberValue(legalBalls, 0);

  if (b <= 0) return 0;

  return Number(((r / b) * 6).toFixed(2));
}

function calculateStrikeRate(runs, balls) {
  const r = numberValue(runs, 0);
  const b = numberValue(balls, 0);

  if (b <= 0) return 0;

  return Number(((r / b) * 100).toFixed(2));
}

function getBattingRuns(stat) {
  return numberValue(
    stat?.runs ??
      stat?.runs_scored ??
      stat?.score,
    0
  );
}

function getBattingBalls(stat) {
  return numberValue(
    stat?.balls ??
      stat?.balls_faced ??
      stat?.deliveries,
    0
  );
}

function getBowlingRuns(stat) {
  return numberValue(
    stat?.runs ??
      stat?.runs_conceded ??
      stat?.conceded,
    0
  );
}

function getBowlingBalls(stat) {
  if (
    stat?.legal_balls !== undefined &&
    stat?.legal_balls !== null
  ) {
    return numberValue(stat.legal_balls, 0);
  }

  if (
    stat?.balls !== undefined &&
    stat?.balls !== null
  ) {
    return numberValue(stat.balls, 0);
  }

  return parseCricketOvers(stat?.overs);
}

function isRunScoringExtra(type) {
  return (
    type === 'wide' ||
    type === 'noball' ||
    type === 'bye' ||
    type === 'legbye' ||
    type === 'penalty'
  );
}


/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  const [fixedBatsmen, setFixedBatsmen] = useState(null);
  const fixedBatsmenRef = useRef(null);

  const [showWicket, setShowWicket] = useState(false);

  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const [showBowlerSetup, setShowBowlerSetup] = useState(false);

  const [selectedStriker, setSelectedStriker] = useState('');
  const [selectedNonStriker, setSelectedNonStriker] = useState('');
  const [selectedBowler, setSelectedBowler] = useState('');

  const [setupStarting, setSetupStarting] = useState(false);

  const [pendingCount, setPendingCount] = useState(0);
  const pendingCountRef = useRef(0);

  /*
   * IMPORTANT:
   *
   * Every server action goes through this same queue.
   *
   * Example:
   *
   * score 4
   * swap
   * score 1
   * undo
   *
   * Server receives:
   *
   * score 4
   * swap
   * score 1
   * undo
   *
   * in exactly that order.
   */
  const serverActionTailRef = useRef(Promise.resolve());

  const visualHistoryRef = useRef([]);

  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  const startingSetupRef = useRef(false);

  const syncAfterFailure = useRef(false);


  /* =======================================================
     PENDING COUNT
  ======================================================= */

  const increasePending = useCallback(() => {
    pendingCountRef.current += 1;
    setPendingCount(pendingCountRef.current);
  }, []);

  const decreasePending = useCallback(() => {
    pendingCountRef.current = Math.max(
      0,
      pendingCountRef.current - 1
    );

    setPendingCount(pendingCountRef.current);
  }, []);


  /* =======================================================
     SERIAL SERVER QUEUE
  ======================================================= */

  const enqueueServerAction = useCallback(
    (action) => {
      const run =
        serverActionTailRef.current
          .catch(() => {})
          .then(action);

      serverActionTailRef.current =
        run.catch(() => {});

      return run;
    },
    []
  );


  /* =======================================================
     APPLY SERVER DATA
  ======================================================= */

  const applyServerData = useCallback(
    (data, resetLocal = false) => {
      if (!data) return;

      const nextMatch =
        data?.match ??
        data?.data?.match ??
        null;

      const nextPlayers =
        data?.players ??
        data?.data?.players ??
        [];

      const nextInnings =
        data?.innings ??
        data?.data?.innings ??
        [];

      if (nextMatch) {
        setMatch(nextMatch);
      }

      if (Array.isArray(nextPlayers)) {
        setPlayers(nextPlayers);
      }

      if (Array.isArray(nextInnings)) {
        setInnings(nextInnings);
      }

      if (resetLocal) {
        optimisticRef.current = null;
        setOptimistic(null);

        visualHistoryRef.current = [];

        fixedBatsmenRef.current = null;
        setFixedBatsmen(null);
      }
    },
    []
  );


  /* =======================================================
     LOAD EVERYTHING
  ======================================================= */

  const loadFull = useCallback(
    async (resetLocal = true) => {
      try {
        setError('');

        const result = await Matches.get(matchId);

        if (!result) {
          throw new Error('Match data not found');
        }

        applyServerData(result, resetLocal);

        return result;
      } catch (err) {
        console.error('Scorer load error:', err);

        setError(
          err?.message ||
            'Unable to load match'
        );

        throw err;
      }
    },
    [matchId, applyServerData]
  );


  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoading(true);

      try {
        const result = await Matches.get(matchId);

        if (!alive) return;

        applyServerData(result, true);
      } catch (err) {
        if (!alive) return;

        console.error(err);

        setError(
          err?.message ||
            'Unable to load match'
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      alive = false;
    };
  }, [matchId, applyServerData]);


  /* =======================================================
     SOCKET
  ======================================================= */

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (data) => {
      /*
       * Never allow an old socket packet to overwrite
       * our instant optimistic UI while a local request
       * is still waiting.
       */
      if (pendingCountRef.current > 0) {
        return;
      }

      if (!data) return;

      if (
        data?.match ||
        data?.innings ||
        data?.players
      ) {
        applyServerData(data, false);
      }
    };

    socket.on(
      'match-update',
      handleUpdate
    );

    socket.on(
      'score-update',
      handleUpdate
    );

    socket.on(
      'innings-update',
      handleUpdate
    );

    return () => {
      socket.off(
        'match-update',
        handleUpdate
      );

      socket.off(
        'score-update',
        handleUpdate
      );

      socket.off(
        'innings-update',
        handleUpdate
      );
    };
  }, [applyServerData]);


  /* =======================================================
     CURRENT INNINGS
  ======================================================= */

  const currentInnings =
    innings.length > 0
      ? innings[innings.length - 1]
      : null;

  const inn =
    currentInnings?.innings ||
    currentInnings ||
    {};

  const inningsNumber =
    getInningsNumber(currentInnings);


  /* =======================================================
     EFFECTIVE STATE
  ======================================================= */

  const effectiveStrikerId =
    optimistic?.strikerId ??
    inn?.striker_id ??
    inn?.strikerId ??
    null;

  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ??
    inn?.non_striker_id ??
    inn?.nonStrikerId ??
    null;

  const effectiveBowlerId =
    optimistic?.activeBowlerId ??
    inn?.current_bowler_id ??
    inn?.currentBowlerId ??
    null;


  /* =======================================================
     TOTALS
  ======================================================= */

  const totalRuns =
    optimistic?.total_runs ??
    numberValue(
      inn?.total_runs ??
        inn?.runs ??
        inn?.score,
      0
    );

  const totalWickets =
    optimistic?.total_wickets ??
    numberValue(
      inn?.total_wickets ??
        inn?.wickets,
      0
    );

  const totalBalls =
    optimistic?.total_balls ??
    numberValue(
      inn?.total_balls ??
        inn?.balls,
      0
    );

  const displayOvers =
    ballsToOvers(totalBalls);

  const displayRunRate =
    totalBalls > 0
      ? (
          (totalRuns / totalBalls) *
          6
        ).toFixed(2)
      : '0.00';


  /* =======================================================
     SETUP DETECTION
  ======================================================= */

  /*
   * IMPORTANT:
   *
   * Initial innings setup requires:
   * - striker
   * - non striker
   * - bowler
   *
   * But after an over, only the bowler is missing.
   */

  const needsBatsmanSetup =
    !effectiveStrikerId ||
    !effectiveNonStrikerId;

  const needsBowlerSetup =
    !effectiveBowlerId;

  const inningsCompleted =
    Boolean(
      optimistic?.inningsCompleted ||
      inn?.completed ||
      inn?.is_completed
    );


  /* =======================================================
     TARGET
  ======================================================= */

  const firstInnings =
    innings.find(
      (item) =>
        getInningsNumber(item) === 1
    );

  const firstInningsData =
    firstInnings?.innings ||
    firstInnings ||
    {};

  const target =
    inn?.target != null
      ? numberValue(inn.target)
      : match?.target != null
      ? numberValue(match.target)
      : match?.target_score != null
      ? numberValue(match.target_score)
      : inningsNumber === 2
      ? numberValue(
          firstInningsData?.total_runs,
          0
        ) + 1
      : null;


  /* =======================================================
     GET PLAYER ID
  ======================================================= */

  const getPlayerId = useCallback(
    (value) => {
      if (!value) return null;

      if (
        typeof value === 'object'
      ) {
        return cleanId(
          value.id ??
            value.player_id ??
            value.value
        );
      }

      return cleanId(value);
    },
    []
  );


  /* =======================================================
     PLAYER CREATION
  ======================================================= */

  const handlePlayerCreated =
    useCallback(
      (created) => {
        if (!created) return;

        const createdId =
          getPlayerId(created);

        if (!createdId) return;

        setPlayers((prev) => {
          const exists = prev.some(
            (p) =>
              cleanId(
                p?.id ??
                  p?.player_id
              ) === createdId
          );

          if (exists) {
            return prev;
          }

          return [
            ...prev,
            created
          ];
        });
      },
      [getPlayerId]
    );


  /* =======================================================
     START / SETUP INNINGS
  ======================================================= */

  const startInnings =
    useCallback(
      async () => {
        const striker =
          getPlayerId(selectedStriker);

        const nonStriker =
          getPlayerId(
            selectedNonStriker
          );

        const bowler =
          getPlayerId(selectedBowler);

        if (!striker) {
          setError(
            'Please select the striker.'
          );
          return;
        }

        if (!nonStriker) {
          setError(
            'Please select the non-striker.'
          );
          return;
        }

        if (
          striker === nonStriker
        ) {
          setError(
            'Striker and non-striker must be different.'
          );
          return;
        }

        if (!bowler) {
          setError(
            'Please select the bowler.'
          );
          return;
        }

        if (startingSetupRef.current) {
          return;
        }

        startingSetupRef.current = true;
        setSetupStarting(true);
        setError('');

        try {
          /*
           * If batsmen are missing, set them first.
           */
          if (
            !effectiveStrikerId ||
            !effectiveNonStrikerId
          ) {
            if (
              typeof Innings.setBatsmen ===
              'function'
            ) {
              await Innings.setBatsmen(
                inn.id,
                {
                  striker_id: striker,
                  non_striker_id:
                    nonStriker
                }
              );
            }
          }

          /*
           * Set bowler.
           */
          await Innings.setBowler(
            inn.id,
            {
              bowler_id: bowler
            }
          );

          /*
           * Update local UI immediately.
           */
          const next = {
            ...(optimisticRef.current ||
              {}),
            inningsId: inn.id,
            strikerId: striker,
            nonStrikerId:
              nonStriker,
            activeBowlerId:
              bowler,
            needsNextBowler:
              false,
            inningsCompleted:
              false,
            bowlerBalls: 0
          };

          optimisticRef.current =
            next;

          flushSync(() => {
            setOptimistic(next);
            setFixedBatsmen({
              strikerId: striker,
              nonStrikerId:
                nonStriker
            });
            setShowBowlerSetup(false);
          });

          fixedBatsmenRef.current =
            {
              strikerId: striker,
              nonStrikerId:
                nonStriker
            };
        } catch (err) {
          console.error(
            'Start innings error:',
            err
          );

          setError(
            err?.message ||
              'Unable to start innings'
          );
        } finally {
          startingSetupRef.current =
            false;

          setSetupStarting(false);
        }
      },
      [
        selectedStriker,
        selectedNonStriker,
        selectedBowler,
        getPlayerId,
        effectiveStrikerId,
        effectiveNonStrikerId,
        inn.id,
        optimistic
      ]
    );


  /* =======================================================
     SET BOWLER
  ======================================================= */

  const selectNextBowler =
    useCallback(
      async (value) => {
        const bowler =
          getPlayerId(value);

        if (!bowler) {
          setError(
            'Please select a bowler.'
          );
          return;
        }

        if (!inn.id) return;

        setError('');

        /*
         * Local update first.
         */
        const next = {
          ...(optimisticRef.current ||
            {}),
          inningsId: inn.id,
          activeBowlerId:
            bowler,
          needsNextBowler:
            false,
          inningsCompleted:
            false,
          bowlerBalls: 0,
          bowlerStats: {
            runs: 0,
            wickets: 0,
            balls: 0,
            legal_balls: 0,
            overs: '0.0',
            economy: 0,
            maidens: 0
          }
        };

        optimisticRef.current =
          next;

        flushSync(() => {
          setOptimistic(next);
          setShowBowlerSetup(false);
        });

        increasePending();

        enqueueServerAction(
          async () => {
            try {
              await Innings.setBowler(
                inn.id,
                {
                  bowler_id: bowler
                }
              );
            } catch (err) {
              console.error(
                'Set bowler error:',
                err
              );

              setError(
                err?.message ||
                  'Unable to set bowler'
              );

              await loadFull(true);
            } finally {
              decreasePending();
            }
          }
        );
      },
      [
        getPlayerId,
        inn.id,
        increasePending,
        decreasePending,
        enqueueServerAction,
        loadFull
      ]
    );


  /* =======================================================
     BUILD OPTIMISTIC BALL
  ======================================================= */

  const buildOptimisticBall =
    useCallback(
      ({
        runs = 0,
        extra_type = null,
        is_wicket = false,
        wicket_type = null,
        dismissed_id = null,
        fielder_id = null
      }) => {
        const previous =
          optimisticRef.current;

        const baseRuns =
          numberValue(runs, 0);

        const extraType =
          extra_type || null;

        let teamRuns = baseRuns;
        let batsmanRuns = baseRuns;

        let legal = true;
        let bowlerRunsAdded =
          baseRuns;

        let extraRuns = 0;

        /*
         * WIDE
         */
        if (extraType === 'wide') {
          legal = false;

          teamRuns =
            Math.max(1, baseRuns);

          extraRuns = teamRuns;

          batsmanRuns = 0;

          bowlerRunsAdded =
            teamRuns;
        }

        /*
         * NO BALL
         */
        else if (
          extraType === 'noball' ||
          extraType === 'no-ball'
        ) {
          legal = false;

          const batRuns =
            numberValue(runs, 0);

          batsmanRuns =
            batRuns;

          extraRuns = 1;

          teamRuns =
            batRuns + 1;

          bowlerRunsAdded =
            batRuns + 1;
        }

        /*
         * BYE
         */
        else if (extraType === 'bye') {
          legal = true;

          extraRuns =
            Math.max(0, baseRuns);

          teamRuns =
            extraRuns;

          batsmanRuns = 0;

          bowlerRunsAdded = 0;
        }

        /*
         * LEG BYE
         */
        else if (
          extraType === 'legbye' ||
          extraType === 'leg-bye'
        ) {
          legal = true;

          extraRuns =
            Math.max(0, baseRuns);

          teamRuns =
            extraRuns;

          batsmanRuns = 0;

          bowlerRunsAdded = 0;
        }

        /*
         * PENALTY
         */
        else if (
          extraType === 'penalty'
        ) {
          legal = false;

          extraRuns =
            Math.max(0, baseRuns);

          teamRuns =
            extraRuns;

          batsmanRuns = 0;

          bowlerRunsAdded = 0;
        }

        /*
         * NORMAL DELIVERY
         */
        else {
          legal = true;

          teamRuns =
            baseRuns;

          batsmanRuns =
            baseRuns;

          bowlerRunsAdded =
            baseRuns;
        }

        const oldRuns =
          numberValue(
            previous?.total_runs,
            totalRuns
          );

        const oldWickets =
          numberValue(
            previous?.total_wickets,
            totalWickets
          );

        const oldBalls =
          numberValue(
            previous?.total_balls,
            totalBalls
          );

        const newTotalRuns =
          oldRuns + teamRuns;

        const newTotalWickets =
          oldWickets +
          (is_wicket ? 1 : 0);

        const newTotalBalls =
          oldBalls +
          (legal ? 1 : 0);


        /* ---------------------------------------------------
           BATSMAN STATS
        --------------------------------------------------- */

        const oldStrikerStats =
          previous?.strikerStats ||
          inn?.striker_stats ||
          {};

        const oldNonStrikerStats =
          previous?.nonStrikerStats ||
          inn?.non_striker_stats ||
          {};

        const strikerRuns =
          getBattingRuns(
            oldStrikerStats
          ) + batsmanRuns;

        const strikerBalls =
          getBattingBalls(
            oldStrikerStats
          ) +
          (
            extraType === 'wide' ||
            extraType === 'noball' ||
            extraType === 'no-ball'
              ? 0
              : 1
          );

        let nextStrikerId =
          previous?.strikerId ??
          effectiveStrikerId;

        let nextNonStrikerId =
          previous?.nonStrikerId ??
          effectiveNonStrikerId;


        /* ---------------------------------------------------
           WICKET
        --------------------------------------------------- */

        if (is_wicket) {
          const dismissed =
            getPlayerId(
              dismissed_id
            );

          if (
            dismissed &&
            cleanId(dismissed) ===
              cleanId(nextStrikerId)
          ) {
            nextStrikerId = null;
          }

          if (
            dismissed &&
            cleanId(dismissed) ===
              cleanId(nextNonStrikerId)
          ) {
            nextNonStrikerId = null;
          }
        }

        /*
         * Odd RUN swaps strike.
         *
         * Only do this for legal normal runs.
         */
        else if (
          legal &&
          batsmanRuns % 2 === 1
        ) {
          const temp =
            nextStrikerId;

          nextStrikerId =
            nextNonStrikerId;

          nextNonStrikerId =
            temp;
        }


        /* ---------------------------------------------------
           BOWLER STATS
        --------------------------------------------------- */

        const oldBowlerStats =
          previous?.bowlerStats ||
          {};

        let oldBowlerBalls =
          numberValue(
            previous?.bowlerBalls,
            NaN
          );

        if (
          !Number.isFinite(
            oldBowlerBalls
          )
        ) {
          oldBowlerBalls =
            getBowlingBalls(
              oldBowlerStats
            );

          if (
            !Number.isFinite(
              oldBowlerBalls
            )
          ) {
            oldBowlerBalls = 0;
          }
        }

        const oldBowlerRuns =
          getBowlingRuns(
            oldBowlerStats
          );

        const newBowlerBalls =
          oldBowlerBalls +
          (legal ? 1 : 0);

        const newBowlerRuns =
          oldBowlerRuns +
          bowlerRunsAdded;

        const oldBowlerWickets =
          numberValue(
            oldBowlerStats?.wickets,
            0
          );

        const bowlerWicketAdded =
          is_wicket &&
          wicket_type !== 'run-out' &&
          wicket_type !== 'retired-hurt';

        const newBowlerWickets =
          oldBowlerWickets +
          (
            bowlerWicketAdded
              ? 1
              : 0
          );

        const newEconomy =
          calculateEconomy(
            newBowlerRuns,
            newBowlerBalls
          );


        /* ---------------------------------------------------
           CURRENT OVER
        --------------------------------------------------- */

        const oldRecentBalls =
          safeArray(
            previous?.recentBalls
          );

        const nextBallNumber =
          oldBalls + 1;

        const overNumber =
          Math.floor(
            oldBalls / 6
          );

        const ballInOver =
          (oldBalls % 6) + 1;

        const newBall = {
          id:
            `local-${Date.now()}-${Math.random()}`,
          ball_sequence:
            nextBallNumber,
          over_number:
            overNumber,
          ball_in_over:
            ballInOver,
          batsman_id:
            effectiveStrikerId,
          non_striker_id:
            effectiveNonStrikerId,
          bowler_id:
            effectiveBowlerId,
          runs_batsman:
            batsmanRuns,
          extra_type:
            extraType,
          extra_runs:
            extraRuns,
          is_wicket:
            is_wicket,
          wicket_type:
            wicket_type,
          dismissed_id:
            dismissed_id,
          fielder_id:
            fielder_id,
          is_legal:
            legal
        };

        const recentBalls =
          [
            ...oldRecentBalls,
            newBall
          ].slice(-24);


        /* ---------------------------------------------------
           EXTRAS
        --------------------------------------------------- */

        const oldExtras =
          previous?.extras ||
          {
            wides: 0,
            no_balls: 0,
            byes: 0,
            leg_byes: 0,
            penalty: 0
          };

        const extras = {
          ...oldExtras
        };

        if (extraType === 'wide') {
          extras.wides =
            numberValue(
              extras.wides,
              0
            ) + teamRuns;
        }

        if (
          extraType === 'noball' ||
          extraType === 'no-ball'
        ) {
          extras.no_balls =
            numberValue(
              extras.no_balls,
              0
            ) + 1;
        }

        if (extraType === 'bye') {
          extras.byes =
            numberValue(
              extras.byes,
              0
            ) + extraRuns;
        }

        if (
          extraType === 'legbye' ||
          extraType === 'leg-bye'
        ) {
          extras.leg_byes =
            numberValue(
              extras.leg_byes,
              0
            ) + extraRuns;
        }

        if (
          extraType === 'penalty'
        ) {
          extras.penalty =
            numberValue(
              extras.penalty,
              0
            ) + extraRuns;
        }


        /* ---------------------------------------------------
           PARTNERSHIP
        --------------------------------------------------- */

        const oldPartnership =
          previous?.partnership ||
          {
            runs: 0,
            balls: 0
          };

        const partnership = {
          runs:
            numberValue(
              oldPartnership.runs,
              0
            ) + teamRuns,
          balls:
            numberValue(
              oldPartnership.balls,
              0
            ) +
            (legal ? 1 : 0)
        };

        if (is_wicket) {
          partnership.runs = 0;
          partnership.balls = 0;
        }


        /* ---------------------------------------------------
           FALL OF WICKET
        --------------------------------------------------- */

        const oldFow =
          safeArray(
            previous?.fallOfWickets
          );

        const fallOfWickets =
          [...oldFow];

        if (is_wicket) {
          fallOfWickets.push({
            wicket:
              newTotalWickets,
            score:
              newTotalRuns,
            overs:
              ballsToOvers(
                newTotalBalls
              ),
            player_id:
              dismissed_id
          });
        }


        /* ---------------------------------------------------
           END OF OVER
        --------------------------------------------------- */

        const overEnded =
          legal &&
          newTotalBalls > 0 &&
          newTotalBalls % 6 === 0;

        if (
          overEnded &&
          !is_wicket
        ) {
          const temp =
            nextStrikerId;

          nextStrikerId =
            nextNonStrikerId;

          nextNonStrikerId =
            temp;
        }


        /* ---------------------------------------------------
           INNINGS COMPLETION
        --------------------------------------------------- */

        const maxOvers =
          numberValue(
            match?.overs ??
              match?.total_overs ??
              match?.max_overs,
            0
          );

        const maxBalls =
          maxOvers > 0
            ? maxOvers * 6
            : 0;

        let completed = false;

        if (
          newTotalWickets >= 10
        ) {
          completed = true;
        }

        if (
          maxBalls > 0 &&
          newTotalBalls >=
            maxBalls
        ) {
          completed = true;
        }

        /*
         * Target reached only in second innings.
         */
        if (
          inningsNumber === 2 &&
          target != null &&
          newTotalRuns >=
            numberValue(target, 0)
        ) {
          completed = true;
        }


        /* ---------------------------------------------------
           NEXT BOWLER
        --------------------------------------------------- */

        const needsNextBowler =
          overEnded &&
          !completed;

        const strikerStats = {
          ...oldStrikerStats,
          runs: strikerRuns,
          balls: strikerBalls,
          strike_rate:
            calculateStrikeRate(
              strikerRuns,
              strikerBalls
            )
        };

        const bowlerStats = {
          ...oldBowlerStats,
          runs: newBowlerRuns,
          runs_conceded:
            newBowlerRuns,
          wickets:
            newBowlerWickets,
          balls:
            newBowlerBalls,
          legal_balls:
            newBowlerBalls,
          overs:
            ballsToOvers(
              newBowlerBalls
            ),
          economy:
            newEconomy
        };

        return {
          inningsId: inn.id,

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
            needsNextBowler
              ? null
              : effectiveBowlerId,

          needsNextBowler,

          inningsCompleted:
            completed,

          bowlerStats,

          bowlerBalls:
            newBowlerBalls,

          strikerStats,

          nonStrikerStats:
            oldNonStrikerStats,

          recentBalls,

          extras,

          partnership,

          fallOfWickets,

          runRate:
            newTotalBalls > 0
              ? Number(
                  (
                    (newTotalRuns /
                      newTotalBalls) *
                    6
                  ).toFixed(2)
                )
              : 0,

          lastBall:
            newBall
        };
      },
      [
        effectiveStrikerId,
        effectiveNonStrikerId,
        effectiveBowlerId,
        totalRuns,
        totalWickets,
        totalBalls,
        inn,
        inningsNumber,
        target,
        match,
        getPlayerId
      ]
    );


  /* =======================================================
     PLAY BALL
  ======================================================= */

  const playBall =
    useCallback(
      ({
        runs = 0,
        extra_type = null,
        is_wicket = false,
        wicket_type = null,
        dismissed_id = null,
        fielder_id = null
      }) => {
        const current =
          optimisticRef.current;

        const striker =
          current?.strikerId ??
          effectiveStrikerId;

        const nonStriker =
          current?.nonStrikerId ??
          effectiveNonStrikerId;

        const bowler =
          current?.activeBowlerId ??
          effectiveBowlerId;

        /*
         * Do not allow scoring until
         * initial setup is complete.
         */
        if (
          !striker ||
          !nonStriker ||
          !bowler
        ) {
          setError(
            'Select both batsmen and the bowler before scoring.'
          );
          return;
        }

        if (
          current?.needsNextBowler
        ) {
          setError(
            'Select the next bowler first.'
          );
          return;
        }

        if (
          current?.inningsCompleted
        ) {
          return;
        }

        setError('');

        const next =
          buildOptimisticBall({
            runs,
            extra_type,
            is_wicket,
            wicket_type,
            dismissed_id,
            fielder_id
          });

        /*
         * Save previous state for instant Undo.
         */
        visualHistoryRef.current.push(
          current
            ? {
                ...current
              }
            : {
                inningsId:
                  inn.id,
                total_runs:
                  totalRuns,
                total_wickets:
                  totalWickets,
                total_balls:
                  totalBalls,
                strikerId:
                  effectiveStrikerId,
                nonStrikerId:
                  effectiveNonStrikerId,
                activeBowlerId:
                  effectiveBowlerId,
                needsNextBowler:
                  false,
                inningsCompleted:
                  false,
                bowlerBalls:
                  0,
                bowlerStats: {},
                strikerStats: {},
                nonStrikerStats: {},
                recentBalls: [],
                extras: {},
                partnership: {
                  runs: 0,
                  balls: 0
                },
                fallOfWickets: [],
                runRate: 0
              }
          );

        optimisticRef.current =
          next;

        /*
         * Instant UI.
         */
        flushSync(() => {
          setOptimistic(next);
        });

        if (
          next.strikerId &&
          next.nonStrikerId
        ) {
          const batsmen = {
            strikerId:
              next.strikerId,
            nonStrikerId:
              next.nonStrikerId
          };

          fixedBatsmenRef.current =
            batsmen;

          setFixedBatsmen(
            batsmen
          );
        }

        if (
          is_wicket
        ) {
          setFlashWicket(true);

          clearTimeout(
            wicketTimer.current
          );

          wicketTimer.current =
            setTimeout(() => {
              setFlashWicket(false);
            }, 500);
        }

        if (
          Number(runs) >= 4 &&
          !extra_type
        ) {
          setBoundary(
            Number(runs) >= 6
              ? 6
              : 4
          );

          clearTimeout(
            boundaryTimer.current
          );

          boundaryTimer.current =
            setTimeout(() => {
              setBoundary(null);
            }, 600);
        }

        const request = {
          runs:
            numberValue(runs, 0),
          extra_type:
            extra_type || null,
          is_wicket:
            Boolean(is_wicket),
          wicket_type:
            wicket_type || null,
          dismissed_id:
            getPlayerId(
              dismissed_id
            ),
          fielder_id:
            getPlayerId(
              fielder_id
            )
        };

        increasePending();

        enqueueServerAction(
          async () => {
            try {
              await Innings.ball(
                inn.id,
                request
              );
            } catch (err) {
              console.error(
                'Ball save error:',
                err
              );

              setError(
                err?.message ||
                  'Unable to save ball'
              );

              /*
               * Server is authoritative after
               * a failed optimistic action.
               */
              if (
                pendingCountRef.current <=
                1
              ) {
                try {
                  await loadFull(true);
                } catch (_) {}
              }
            } finally {
              decreasePending();
            }
          }
        );

        /*
         * FIRST INNINGS:
         *
         * Go to target immediately.
         *
         * Do NOT wait for another GET.
         */
        if (
          next.inningsCompleted &&
          inningsNumber === 1
        ) {
          navigate(
            `/match/${matchId}/target`,
            {
              replace: true,
              state: {
                inningsCompleted:
                  true,
                inningsNumber: 1,
                score:
                  next.total_runs,
                wickets:
                  next.total_wickets,
                balls:
                  next.total_balls,
                target:
                  next.total_runs + 1,
                battingTeam:
                  match?.team1_short ||
                  match?.team1_name ||
                  '',
                bowlingTeam:
                  match?.team2_short ||
                  match?.team2_name ||
                  ''
              }
            }
          );

          return;
        }

        /*
         * SECOND INNINGS:
         *
         * Stay on scorer.
         */
      },
      [
        effectiveStrikerId,
        effectiveNonStrikerId,
        effectiveBowlerId,
        buildOptimisticBall,
        inn.id,
        totalRuns,
        totalWickets,
        totalBalls,
        inningsNumber,
        match,
        getPlayerId,
        increasePending,
        decreasePending,
        enqueueServerAction,
        loadFull,
        navigate,
        matchId
      ]
    );


  /* =======================================================
     FAST SWAP
  ======================================================= */

  const fastSwapStrike =
    useCallback(
      () => {
        const current =
          optimisticRef.current;

        if (!current) return;

        const striker =
          current.strikerId ??
          effectiveStrikerId;

        const nonStriker =
          current.nonStrikerId ??
          effectiveNonStrikerId;

        if (
          !striker ||
          !nonStriker
        ) {
          return;
        }

        /*
         * INSTANT LOCAL SWAP.
         */
        const next = {
          ...current,
          strikerId:
            nonStriker,
          nonStrikerId:
            striker
        };

        optimisticRef.current =
          next;

        fixedBatsmenRef.current =
          {
            strikerId:
              nonStriker,
            nonStrikerId:
              striker
          };

        flushSync(() => {
          setOptimistic(next);

          setFixedBatsmen({
            strikerId:
              nonStriker,
            nonStrikerId:
              striker
          });
        });

        /*
         * Server action is queued.
         */
        increasePending();

        enqueueServerAction(
          async () => {
            try {
              await Innings.swapStrike(
                current.inningsId ??
                  inn.id
              );
            } catch (err) {
              console.error(
                'Swap error:',
                err
              );

              setError(
                err?.message ||
                  'Unable to swap batsmen'
              );

              try {
                await loadFull(true);
              } catch (_) {}
            } finally {
              decreasePending();
            }
          }
        );
      },
      [
        effectiveStrikerId,
        effectiveNonStrikerId,
        inn.id,
        increasePending,
        decreasePending,
        enqueueServerAction,
        loadFull
      ]
    );


  /* =======================================================
     FAST UNDO
  ======================================================= */

  const fastUndo =
    useCallback(
      () => {
        const history =
          visualHistoryRef.current;

        if (
          history.length === 0
        ) {
          return;
        }

        /*
         * INSTANTLY RESTORE PREVIOUS STATE.
         */
        const previous =
          history.pop();

        if (!previous) return;

        optimisticRef.current =
          previous;

        flushSync(() => {
          setOptimistic(
            previous
          );

          if (
            previous.strikerId &&
            previous.nonStrikerId
          ) {
            const batsmen = {
              strikerId:
                previous.strikerId,
              nonStrikerId:
                previous.nonStrikerId
            };

            fixedBatsmenRef.current =
              batsmen;

            setFixedBatsmen(
              batsmen
            );
          }
        });

        /*
         * Undo server request goes into
         * the SAME queue.
         *
         * So:
         *
         * score → swap → undo
         *
         * stays:
         *
         * score → swap → undo
         */
        increasePending();

        enqueueServerAction(
          async () => {
            try {
              await Innings.undo(
                previous.inningsId ??
                  inn.id
              );
            } catch (err) {
              console.error(
                'Undo error:',
                err
              );

              setError(
                err?.message ||
                  'Unable to undo'
              );

              try {
                await loadFull(true);
              } catch (_) {}
            } finally {
              decreasePending();
            }
          }
        );
      },
      [
        inn.id,
        increasePending,
        decreasePending,
        enqueueServerAction,
        loadFull
      ]
    );


  /* =======================================================
     BATSMAN SELECT
  ======================================================= */

  const setSelectedBatsman =
    useCallback(
      (
        setter,
        value
      ) => {
        setter(
          getPlayerId(value) || ''
        );
      },
      [getPlayerId]
    );


  /* =======================================================
     WICKET BATSMAN
  ======================================================= */

  const handleWicketConfirm =
    useCallback(
      ({
        wicketType,
        dismissedId,
        fielderId,
        runsBeforeWicket = 0
      }) => {
        playBall({
          runs:
            wicketType ===
            'run-out'
              ? numberValue(
                  runsBeforeWicket,
                  0
                )
              : 0,

          extra_type:
            null,

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

        setShowWicket(false);
      },
      [playBall, getPlayerId]
    );


  /* =======================================================
     SECOND INNINGS
  ======================================================= */

  const startSecondInnings =
    useCallback(
      async () => {
        if (
          startingSetupRef.current
        ) {
          return;
        }

        startingSetupRef.current =
          true;

        setSetupStarting(true);
        setError('');

        try {
          await Matches.startSecondInnings(
            matchId
          );

          /*
           * Clear old first-innings
           * local state.
           */
          optimisticRef.current =
            null;

          visualHistoryRef.current =
            [];

          fixedBatsmenRef.current =
            null;

          flushSync(() => {
            setOptimistic(null);
            setFixedBatsmen(null);
            setSelectedStriker('');
            setSelectedNonStriker('');
            setSelectedBowler('');
            setShowBowlerSetup(false);
          });

          await loadFull(true);
        } catch (err) {
          console.error(
            'Second innings error:',
            err
          );

          setError(
            err?.message ||
              'Unable to start second innings'
          );
        } finally {
          startingSetupRef.current =
            false;

          setSetupStarting(false);
        }
      },
      [
        matchId,
        loadFull
      ]
    );


  /* =======================================================
     CLEANUP
  ======================================================= */

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


  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center text-slate-400">
        Loading scorer…
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center">
        <p className="text-red-400">
          {error ||
            'Match not found'}
        </p>
      </div>
    );
  }


  /* =======================================================
     COMPLETED MATCH
  ======================================================= */

  if (
    match.status === 'completed' &&
    pendingCount === 0
  ) {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-4">
        <div className="text-4xl">
          🏆
        </div>

        <h1 className="text-2xl font-bold">
          Match Completed
        </h1>

        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text ||
            match.result ||
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
    );
  }


  /* =======================================================
     INITIAL INNINGS SETUP
  ======================================================= */

  /*
   * If both batsmen OR bowler are missing,
   * show the setup screen.
   *
   * This happens in BOTH innings.
   */
  if (
    !inningsCompleted &&
    needsBatsmanSetup
  ) {
    return (
      <InningsSetup
        title={
          inningsNumber === 1
            ? 'Start 1st Innings'
            : 'Start 2nd Innings'
        }
        subtitle={
          inningsNumber === 1
            ? 'Select the opening batsmen and bowler'
            : 'Select the opening batsmen and bowler for the chase'
        }
        players={players}
        striker={selectedStriker}
        nonStriker={
          selectedNonStriker
        }
        bowler={selectedBowler}
        setStriker={(v) =>
          setSelectedBatsman(
            setSelectedStriker,
            v
          )
        }
        setNonStriker={(v) =>
          setSelectedBatsman(
            setSelectedNonStriker,
            v
          )
        }
        setBowler={(v) =>
          setSelectedBatsman(
            setSelectedBowler,
            v
          )
        }
        onCreated={
          handlePlayerCreated
        }
        onStart={
          startInnings
        }
        starting={setupStarting}
        error={error}
      />
    );
  }


  /* =======================================================
     BOWLER SETUP
  ======================================================= */

  /*
   * If batsmen exist but bowler does not,
   * show ONLY bowler selection.
   */
  if (
    !inningsCompleted &&
    !needsBatsmanSetup &&
    needsBowlerSetup
  ) {
    return (
      <BowlerSetup
        players={players}
        value={selectedBowler}
        onChange={(value) => {
          setSelectedBowler(
            getPlayerId(value) || ''
          );
        }}
        onCreated={
          handlePlayerCreated
        }
        onStart={() =>
          selectNextBowler(
            selectedBowler
          )
        }
        starting={setupStarting}
        title={
          totalBalls === 0
            ? 'Select Opening Bowler'
            : 'Select Next Bowler'
        }
        subtitle={
          totalBalls === 0
            ? 'Choose the bowler to start this innings'
            : 'The over is complete. Choose the next bowler.'
        }
        error={error}
      />
    );
  }


  /* =======================================================
     DISPLAY STATS
  ======================================================= */

  const strikerStats =
    optimistic?.strikerStats ||
    inn?.striker_stats ||
    {};

  const nonStrikerStats =
    optimistic?.nonStrikerStats ||
    inn?.non_striker_stats ||
    {};

  const bowlerStats =
    optimistic?.bowlerStats ||
    inn?.bowler_stats ||
    {};

  const recentBalls =
    optimistic?.recentBalls ||
    currentInnings?.recentBalls ||
    [];

  const partnership =
    optimistic?.partnership ||
    currentInnings?.partnership ||
    {
      runs: 0,
      balls: 0
    };

  const extras =
    optimistic?.extras ||
    currentInnings?.extras ||
    {
      wides: 0,
      no_balls: 0,
      byes: 0,
      leg_byes: 0,
      penalty: 0
    };

  const fallOfWickets =
    optimistic?.fallOfWickets ||
    currentInnings?.fallOfWickets ||
    [];

  const currentOverBalls =
    recentBalls.filter(
      (ball) =>
        numberValue(
          ball?.over_number,
          -1
        ) ===
        Math.floor(
          totalBalls / 6
        )
    );

  const displayPartnershipRuns =
    numberValue(
      partnership?.runs,
      0
    );

  const displayPartnershipBalls =
    numberValue(
      partnership?.balls,
      0
    );

  const bowlerLegalBalls =
    optimistic?.bowlerBalls ??
    getBowlingBalls(
      bowlerStats
    );

  const bowlerRuns =
    getBowlingRuns(
      bowlerStats
    );

  const bowlerEconomy =
    calculateEconomy(
      bowlerRuns,
      bowlerLegalBalls
    );


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className={`max-w-4xl mx-auto space-y-4 pb-10 ${
        flashWicket
          ? 'ring-2 ring-red-500 rounded-2xl'
          : ''
      }`}
    >

      {/* HEADER */}

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-400">
              {inningsNumber === 1
                ? '1st Innings'
                : '2nd Innings'}
            </div>

            <h1 className="text-xl font-bold">
              {match.team1_short ||
                match.team1_name ||
                'Team 1'}
              {' '}
              vs{' '}
              {match.team2_short ||
                match.team2_name ||
                'Team 2'}
            </h1>
          </div>

          <div className="text-right">
            <div className="text-3xl font-bold">
              {totalRuns}/
              {totalWickets}
            </div>

            <div className="text-sm text-slate-400">
              {displayOvers} overs
            </div>
          </div>
        </div>

        {target != null &&
          inningsNumber === 2 && (
            <div className="mt-3 rounded-xl bg-slate-800 p-3 text-center">
              <span className="text-slate-400">
                Target:{' '}
              </span>

              <span className="font-bold text-emerald-400">
                {target}
              </span>

              <span className="text-slate-400 ml-2">
                Need{' '}
                {Math.max(
                  0,
                  target -
                    totalRuns
                )}{' '}
                runs
              </span>
            </div>
          )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label="Run Rate"
            value={displayRunRate}
          />

          <Stat
            label="Balls"
            value={totalBalls}
          />
        </div>
      </div>


      {/* BOUNDARY DISPLAY */}

      {boundary != null && (
        <div className="text-center text-5xl font-black fade-in">
          {boundary === 6
            ? '💥 SIX!'
            : '🔥 FOUR!'}
        </div>
      )}


      {/* BATSMEN */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        <BatsmanCard
          title="Striker"
          name={getPlayerName(
            players,
            effectiveStrikerId
          )}
          stats={
            strikerStats
          }
          active
        />

        <BatsmanCard
          title="Non-Striker"
          name={getPlayerName(
            players,
            effectiveNonStrikerId
          )}
          stats={
            nonStrikerStats
          }
        />

      </div>


      {/* BOWLER */}

      <div className="card">

        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-xs text-slate-400">
              Bowler
            </div>

            <div className="font-bold">
              {getPlayerName(
                players,
                effectiveBowlerId
              )}
            </div>
          </div>

          <div className="text-right text-sm">
            <div>
              {ballsToOvers(
                bowlerLegalBalls
              )}{' '}
              overs
            </div>

            <div className="text-slate-400">
              {bowlerRuns} runs
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <BowlingStat
            label="O"
            value={ballsToOvers(
              bowlerLegalBalls
            )}
          />

          <BowlingStat
            label="R"
            value={bowlerRuns}
          />

          <BowlingStat
            label="W"
            value={
              numberValue(
                bowlerStats?.wickets,
                0
              )
            }
          />

          <BowlingStat
            label="Econ"
            value={
              bowlerEconomy.toFixed(2)
            }
          />
        </div>

      </div>


      {/* CURRENT OVER */}

      <div className="card">

        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">
            Current Over
          </h2>

          <span className="text-xs text-slate-400">
            {Math.floor(
              totalBalls / 6
            )}
            .
            {totalBalls % 6}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentOverBalls.length ===
            0 && (
            <span className="text-slate-500 text-sm">
              No balls yet
            </span>
          )}

          {currentOverBalls.map(
            (ball, index) => (
              <BallDisplay
                key={
                  ball?.id ??
                  index
                }
                ball={ball}
              />
            )
          )}
        </div>

      </div>


      {/* QUICK SCORING */}

      <div className="card">

        <h2 className="font-bold mb-3">
          Runs
        </h2>

        <div className="grid grid-cols-4 gap-2">

          {[0, 1, 2, 3].map(
            (run) => (
              <button
                key={run}
                className="btn btn-secondary text-lg"
                onClick={() =>
                  playBall({
                    runs: run
                  })
                }
              >
                {run}
              </button>
            )
          )}

          <button
            className="btn btn-secondary text-lg"
            onClick={() =>
              playBall({
                runs: 4
              })
            }
          >
            4
          </button>

          <button
            className="btn btn-secondary text-lg"
            onClick={() =>
              playBall({
                runs: 6
              })
            }
          >
            6
          </button>

          <button
            className="btn btn-secondary"
            onClick={() =>
              playBall({
                runs: 1,
                extra_type:
                  'wide'
              })
            }
          >
            Wide
          </button>

          <button
            className="btn btn-secondary"
            onClick={() =>
              playBall({
                runs: 1,
                extra_type:
                  'noball'
              })
            }
          >
            No Ball
          </button>

          <button
            className="btn btn-secondary"
            onClick={() =>
              playBall({
                runs: 1,
                extra_type:
                  'bye'
              })
            }
          >
            Bye
          </button>

          <button
            className="btn btn-secondary"
            onClick={() =>
              playBall({
                runs: 1,
                extra_type:
                  'legbye'
              })
            }
          >
            Leg Bye
          </button>

        </div>

      </div>


      {/* MAIN ACTIONS */}

      <div className="grid grid-cols-2 gap-2">

        <button
          className="btn btn-secondary"
          onClick={
            fastSwapStrike
          }
          disabled={
            !effectiveStrikerId ||
            !effectiveNonStrikerId
          }
        >
          ⇄ Swap Batsmen
        </button>

        <button
          className="btn btn-secondary"
          onClick={fastUndo}
          disabled={
            visualHistoryRef.current
              .length === 0
          }
        >
          ↺ Undo
        </button>

      </div>


      {/* WICKET */}

      <button
        className="btn btn-primary w-full"
        onClick={() =>
          setShowWicket(true)
        }
      >
        🏏 Wicket
      </button>


      {/* PARTNERSHIP */}

      <div className="card">

        <h2 className="font-bold mb-3">
          Partnership
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Runs"
            value={
              displayPartnershipRuns
            }
          />

          <Stat
            label="Balls"
            value={
              displayPartnershipBalls
            }
          />
        </div>

      </div>


      {/* EXTRAS */}

      <div className="card">

        <h2 className="font-bold mb-3">
          Extras
        </h2>

        <div className="grid grid-cols-5 gap-2 text-center text-sm">

          <Stat
            label="WD"
            value={
              numberValue(
                extras.wides,
                0
              )
            }
          />

          <Stat
            label="NB"
            value={
              numberValue(
                extras.no_balls,
                0
              )
            }
          />

          <Stat
            label="B"
            value={
              numberValue(
                extras.byes,
                0
              )
            }
          />

          <Stat
            label="LB"
            value={
              numberValue(
                extras.leg_byes,
                0
              )
            }
          />

          <Stat
            label="P"
            value={
              numberValue(
                extras.penalty,
                0
              )
            }
          />

        </div>

      </div>


      {/* FALL OF WICKETS */}

      <FallOfWickets
        wickets={
          fallOfWickets
        }
        players={
          players
        }
      />


      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}


      {/* NEXT BOWLER */}

      {showBowlerSetup &&
        !inningsCompleted && (
          <BowlerSetup
            players={players}
            value={
              selectedBowler
            }
            onChange={(value) =>
              setSelectedBowler(
                getPlayerId(value) ||
                  ''
              )
            }
            onCreated={
              handlePlayerCreated
            }
            onStart={() =>
              selectNextBowler(
                selectedBowler
              )
            }
            starting={
              setupStarting
            }
            title="Select Next Bowler"
            subtitle="Choose the bowler for the next over"
            error={error}
          />
        )}


      {/* AUTO SHOW NEXT BOWLER AFTER OVER */}

      {optimistic?.needsNextBowler &&
        !optimistic?.inningsCompleted && (
          <div className="card border border-amber-500/30">

            <div className="text-center mb-4">
              <div className="text-2xl">
                🔄
              </div>

              <h2 className="font-bold">
                Over Completed
              </h2>

              <p className="text-sm text-slate-400">
                Select the next bowler
              </p>
            </div>

            <BowlerSetup
              players={players}
              value={
                selectedBowler
              }
              onChange={(value) =>
                setSelectedBowler(
                  getPlayerId(value) ||
                    ''
                )
              }
              onCreated={
                handlePlayerCreated
              }
              onStart={() =>
                selectNextBowler(
                  selectedBowler
                )
              }
              starting={
                setupStarting
              }
              title="Next Bowler"
              subtitle="Choose the bowler for the next over"
              error=""
            />

          </div>
        )}


      {/* SECOND INNINGS TARGET / START */}

      {inningsNumber === 2 &&
        inningsCompleted === false &&
        target != null &&
        totalRuns === 0 &&
        !effectiveStrikerId && (
          <div className="card text-center">

            <div className="text-sm text-slate-400">
              Target
            </div>

            <div className="text-4xl font-bold text-emerald-400">
              {target}
            </div>

            <button
              className="btn btn-primary w-full mt-4"
              onClick={
                startSecondInnings
              }
              disabled={
                setupStarting
              }
            >
              {setupStarting
                ? 'Starting…'
                : 'Start 2nd Innings'}
            </button>

          </div>
        )}


      {/* WICKET MODAL */}

      {showWicket && (
        <WicketModal
          players={players}
          onClose={() =>
            setShowWicket(false)
          }
          onConfirm={
            handleWicketConfirm
          }
        />
      )}

    </div>
  );
}


/* =========================================================
   INNINGS SETUP
========================================================= */

function InningsSetup({
  title,
  subtitle,
  players,
  striker,
  nonStriker,
  bowler,
  setStriker,
  setNonStriker,
  setBowler,
  onCreated,
  onStart,
  starting,
  error
}) {
  return (
    <div className="max-w-lg mx-auto space-y-4">

      <div className="card text-center">
        <div className="text-3xl mb-2">
          🏏
        </div>

        <h1 className="text-2xl font-bold">
          {title}
        </h1>

        <p className="text-sm text-slate-400 mt-1">
          {subtitle}
        </p>
      </div>


      <div className="card space-y-4">

        <div>
          <label className="block text-sm font-semibold mb-2">
            Striker
          </label>

          <PlayerAutocomplete
            players={players}
            value={striker}
            onChange={setStriker}
            onPlayerCreated={
              onCreated
            }
            placeholder="Select striker"
          />
        </div>


        <div>
          <label className="block text-sm font-semibold mb-2">
            Non-Striker
          </label>

          <PlayerAutocomplete
            players={players}
            value={nonStriker}
            onChange={
              setNonStriker
            }
            onPlayerCreated={
              onCreated
            }
            placeholder="Select non-striker"
          />
        </div>


        <div>
          <label className="block text-sm font-semibold mb-2">
            Bowler
          </label>

          <PlayerAutocomplete
            players={players}
            value={bowler}
            onChange={setBowler}
            onPlayerCreated={
              onCreated
            }
            placeholder="Select bowler"
          />
        </div>


        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
            {error}
          </div>
        )}


        <button
          className="btn btn-primary w-full"
          onClick={onStart}
          disabled={starting}
        >
          {starting
            ? 'Starting…'
            : '▶ Start Innings'}
        </button>

      </div>
    </div>
  );
}


/* =========================================================
   BOWLER SETUP
========================================================= */

function BowlerSetup({
  players,
  value,
  onChange,
  onCreated,
  onStart,
  starting,
  title,
  subtitle,
  error
}) {
  return (
    <div className="card space-y-4">

      <div className="text-center">
        <div className="text-3xl">
          🎯
        </div>

        <h2 className="text-xl font-bold mt-2">
          {title}
        </h2>

        <p className="text-sm text-slate-400">
          {subtitle}
        </p>
      </div>

      <PlayerAutocomplete
        players={players}
        value={value}
        onChange={onChange}
        onPlayerCreated={
          onCreated
        }
        placeholder="Select bowler"
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        className="btn btn-primary w-full"
        onClick={onStart}
        disabled={starting}
      >
        {starting
          ? 'Starting…'
          : '▶ Start Over'}
      </button>

    </div>
  );
}


/* =========================================================
   BATSMAN CARD
========================================================= */

function BatsmanCard({
  title,
  name,
  stats,
  active
}) {
  const runs =
    getBattingRuns(stats);

  const balls =
    getBattingBalls(stats);

  const strikeRate =
    calculateStrikeRate(
      runs,
      balls
    );

  return (
    <div
      className={`card ${
        active
          ? 'border border-emerald-500/40'
          : ''
      }`}
    >
      <div className="flex justify-between items-start">

        <div>
          <div className="text-xs text-slate-400">
            {active
              ? '🏏 Striker'
              : title}
          </div>

          <div className="font-bold mt-1">
            {name}
          </div>
        </div>

        {active && (
          <div className="text-emerald-400 text-sm">
            ●
          </div>
        )}

      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">

        <Stat
          label="Runs"
          value={runs}
        />

        <Stat
          label="Balls"
          value={balls}
        />

        <Stat
          label="SR"
          value={strikeRate.toFixed(2)}
        />

      </div>
    </div>
  );
}


/* =========================================================
   FALL OF WICKETS
========================================================= */

function FallOfWickets({
  wickets,
  players
}) {
  if (
    !safeArray(wickets).length
  ) {
    return null;
  }

  return (
    <div className="card">

      <h2 className="font-bold mb-3">
        Fall of Wickets
      </h2>

      <div className="space-y-2">

        {safeArray(wickets).map(
          (item, index) => (
            <div
              key={index}
              className="flex justify-between text-sm border-b border-slate-800 pb-2"
            >
              <span>
                {item.wicket} —{' '}
                {getPlayerName(
                  players,
                  item.player_id
                )}
              </span>

              <span className="text-slate-400">
                {item.score} (
                {item.overs})
              </span>
            </div>
          )
        )}

      </div>

    </div>
  );
}


/* =========================================================
   STAT
========================================================= */

function Stat({
  label,
  value
}) {
  return (
    <div className="rounded-lg bg-slate-800/60 p-2 text-center">

      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="font-semibold mt-1">
        {value}
      </div>

    </div>
  );
}


/* =========================================================
   BOWLING STAT
========================================================= */

function BowlingStat({
  label,
  value
}) {
  return (
    <div className="rounded-lg bg-slate-800/60 p-2 text-center">

      <div className="text-[11px] text-slate-500">
        {label}
      </div>

      <div className="font-semibold">
        {value}
      </div>

    </div>
  );
}


/* =========================================================
   BALL DISPLAY
========================================================= */

function BallDisplay({
  ball
}) {
  const runs =
    numberValue(
      ball?.runs_batsman,
      0
    );

  const extra =
    ball?.extra_type;

  const wicket =
    Boolean(
      ball?.is_wicket
    );

  let text = String(runs);

  if (extra === 'wide') {
    text =
      runs > 0
        ? `${runs}Wd`
        : 'Wd';
  }

  if (
    extra === 'noball' ||
    extra === 'no-ball'
  ) {
    text =
      runs > 0
        ? `${runs}Nb`
        : 'Nb';
  }

  if (extra === 'bye') {
    text =
      runs > 0
        ? `${runs}B`
        : 'B';
  }

  if (
    extra === 'legbye' ||
    extra === 'leg-bye'
  ) {
    text =
      runs > 0
        ? `${runs}LB`
        : 'LB';
  }

  if (wicket) {
    text = 'W';
  }

  return (
    <div
      className={`min-w-10 h-10 px-2 rounded-full flex items-center justify-center font-bold text-sm ${
        wicket
          ? 'bg-red-500/20 text-red-300'
          : runs === 4
          ? 'bg-emerald-500/20 text-emerald-300'
          : runs === 6
          ? 'bg-purple-500/20 text-purple-300'
          : 'bg-slate-800 text-slate-200'
      }`}
    >
      {text}
    </div>
  );
}
