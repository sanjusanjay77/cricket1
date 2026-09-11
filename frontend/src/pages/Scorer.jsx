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

  const [optimistic, setOptimistic] = useState(null);

  // ---------------------------------------------------------
  // IMPORTANT:
  // One queue handles BOTH balls and bowler selection.
  // This prevents the bowler request from reaching the server
  // before the 6th ball has been saved.
  // ---------------------------------------------------------
  const actionQueueRef = useRef([]);
  const processingQueueRef = useRef(false);

  const pendingCountRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  const optimisticRef = useRef(null);

  const wicketTimerRef = useRef(null);
  const boundaryTimerRef = useRef(null);

  // ---------------------------------------------------------
  // Keep optimistic state in ref
  // ---------------------------------------------------------
  useEffect(() => {
    optimisticRef.current = optimistic;
  }, [optimistic]);

  // ---------------------------------------------------------
  // Load complete match
  // ---------------------------------------------------------
  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      setMatch(data.match || data);

      if (Array.isArray(data.innings)) {
        setInnings(data.innings);
      }

      setOptimistic(null);
      optimisticRef.current = null;
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to load match'
      );
    }
  }, [matchId]);

  // ---------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------
  useEffect(() => {
    loadFull();
  }, [loadFull]);

  // ---------------------------------------------------------
  // Load players
  // ---------------------------------------------------------
  useEffect(() => {
    let alive = true;

    async function loadPlayers() {
      try {
        const data = await Matches.get(matchId);

        if (!alive) return;

        if (Array.isArray(data.players)) {
          setPlayers(data.players);
        }

        if (Array.isArray(data.innings)) {
          setInnings(data.innings);
        }

        setMatch(data.match || data);
      } catch (err) {
        console.error(err);
      }
    }

    loadPlayers();

    return () => {
      alive = false;
    };
  }, [matchId]);

  // ---------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    socket.emit('join-match', matchId);

    const handleScoreUpdate = (data) => {
      /*
       * VERY IMPORTANT:
       * If we have local actions waiting to be saved,
       * don't replace our fast optimistic UI with an older
       * server snapshot.
       */
      if (pendingCountRef.current > 0) {
        return;
      }

      if (data?.match) {
        setMatch(data.match);
      }

      if (Array.isArray(data?.innings)) {
        setInnings(data.innings);
      }

      setOptimistic(null);
      optimisticRef.current = null;
    };

    socket.on('score-update', handleScoreUpdate);

    return () => {
      socket.off('score-update', handleScoreUpdate);
    };
  }, [matchId]);

  // ---------------------------------------------------------
  // Pending action helpers
  // ---------------------------------------------------------
  const increasePending = () => {
    pendingCountRef.current += 1;
    setPendingCount(pendingCountRef.current);
  };

  const decreasePending = () => {
    pendingCountRef.current = Math.max(
      0,
      pendingCountRef.current - 1
    );

    setPendingCount(pendingCountRef.current);
  };

  // ---------------------------------------------------------
  // Find player
  // ---------------------------------------------------------
  const getPlayer = useCallback(
    (id) => {
      if (!id) return null;

      return (
        players.find(
          (p) =>
            String(p.id) === String(id) ||
            String(p.player_id) === String(id)
        ) || null
      );
    },
    [players]
  );

  // ---------------------------------------------------------
  // Format overs
  // ---------------------------------------------------------
  const formatOvers = (balls) => {
    const total = Number(balls || 0);

    return `${Math.floor(total / 6)}.${total % 6}`;
  };

  // ---------------------------------------------------------
  // Calculate run rate
  // ---------------------------------------------------------
  const calculateRR = (runs, balls) => {
    if (!balls) return '0.0';

    return (Number(runs || 0) / (Number(balls) / 6)).toFixed(1);
  };

  // ---------------------------------------------------------
  // Get current innings
  // ---------------------------------------------------------
  const currentInnings =
    innings && innings.length
      ? innings[innings.length - 1]
      : null;

  // ---------------------------------------------------------
  // IMPORTANT:
  // Do NOT use ?? here.
  //
  // null is meaningful after over completion because it means
  // "bowler must be selected".
  // ---------------------------------------------------------
  const effectiveStrikerId = optimistic
    ? optimistic.strikerId
    : currentInnings?.striker_id;

  const effectiveNonStrikerId = optimistic
    ? optimistic.nonStrikerId
    : currentInnings?.non_striker_id;

  const effectiveBowlerId = optimistic
    ? optimistic.bowlerId
    : currentInnings?.current_bowler_id;

  const striker = getPlayer(effectiveStrikerId);
  const nonStriker = getPlayer(effectiveNonStrikerId);
  const bowler = getPlayer(effectiveBowlerId);

  // ---------------------------------------------------------
  // Add action to queue
  // ---------------------------------------------------------
  const enqueueAction = useCallback(
    (action) => {
      actionQueueRef.current.push(action);

      increasePending();

      processActionQueue();
    },
    []
  );

  // ---------------------------------------------------------
  // Process action queue
  // ---------------------------------------------------------
  const processActionQueue = useCallback(async () => {
    if (processingQueueRef.current) return;

    if (!actionQueueRef.current.length) return;

    processingQueueRef.current = true;

    while (actionQueueRef.current.length > 0) {
      const action = actionQueueRef.current[0];

      try {
        if (action.type === 'ball') {
          await Innings.ball(
            action.inningsId,
            action.payload
          );
        }

        if (action.type === 'bowler') {
          await Innings.setBowler(
            action.inningsId,
            {
              bowler_id: action.bowlerId
            }
          );
        }

        actionQueueRef.current.shift();

        decreasePending();
      } catch (err) {
        console.error(err);

        actionQueueRef.current.shift();

        decreasePending();

        setError(
          err?.response?.data?.error ||
            err?.message ||
            'Failed to save action'
        );

        /*
         * If bowler selection fails, don't keep optimistic
         * bowler forever. Reload authoritative server state.
         */
        if (action.type === 'bowler') {
          try {
            await loadFull();
          } catch (_) {}
        }
      }
    }

    processingQueueRef.current = false;

    /*
     * Once everything has been written to Turso,
     * get the authoritative state.
     */
    if (
      actionQueueRef.current.length === 0 &&
      pendingCountRef.current === 0
    ) {
      try {
        const data = await Matches.get(matchId);

        setMatch(data.match || data);

        if (Array.isArray(data.innings)) {
          setInnings(data.innings);
        }

        setOptimistic(null);
        optimisticRef.current = null;
      } catch (err) {
        console.error(err);
      }
    }
  }, [matchId, loadFull]);

  // ---------------------------------------------------------
  // Make processActionQueue available to enqueueAction
  // ---------------------------------------------------------
  useEffect(() => {
    if (actionQueueRef.current.length > 0) {
      processActionQueue();
    }
  }, [processActionQueue]);

  // ---------------------------------------------------------
  // Build optimistic state for a ball
  // ---------------------------------------------------------
  const buildOptimisticBall = useCallback(
    (base, payload) => {
      const current = base || {
        runs: Number(currentInnings?.total_runs || 0),
        wickets: Number(currentInnings?.total_wickets || 0),
        balls: Number(currentInnings?.total_balls || 0),
        strikerId: currentInnings?.striker_id || null,
        nonStrikerId:
          currentInnings?.non_striker_id || null,
        bowlerId:
          currentInnings?.current_bowler_id || null,
        recentBalls: []
      };

      const runs = Number(payload.runs || 0);

      const isWicket =
        payload.is_wicket ||
        payload.wicket_type ||
        payload.wicket;

      const isWide =
        payload.extra_type === 'wide' ||
        payload.extraType === 'wide';

      const isNoBall =
        payload.extra_type === 'no_ball' ||
        payload.extraType === 'no_ball';

      const isBye =
        payload.extra_type === 'bye' ||
        payload.extraType === 'bye';

      const isLegBye =
        payload.extra_type === 'leg_bye' ||
        payload.extraType === 'leg_bye';

      const legalDelivery =
        !isWide && !isNoBall;

      const nextBalls =
        Number(current.balls || 0) +
        (legalDelivery ? 1 : 0);

      let nextRuns =
        Number(current.runs || 0) + runs;

      let nextWickets =
        Number(current.wickets || 0);

      if (isWicket) {
        nextWickets += 1;
      }

      let nextStriker = current.strikerId;
      let nextNonStriker = current.nonStrikerId;

      /*
       * Normal odd runs change strike.
       */
      const strikeRuns =
        !isBye &&
        !isLegBye
          ? runs
          : runs;

      if (strikeRuns % 2 === 1) {
        [nextStriker, nextNonStriker] = [
          nextNonStriker,
          nextStriker
        ];
      }

      /*
       * End of over:
       * - swap batsmen
       * - clear bowler
       *
       * Clearing bowler is critical because it makes the
       * Select Bowler UI appear immediately.
       */
      const overJustCompleted =
        legalDelivery &&
        nextBalls > Number(current.balls || 0) &&
        nextBalls % 6 === 0;

      let nextBowler = current.bowlerId;
      let lastBowlerId = current.lastBowlerId || null;

      if (overJustCompleted) {
        [nextStriker, nextNonStriker] = [
          nextStriker,
          nextNonStriker
        ];

        lastBowlerId = current.bowlerId;
        nextBowler = null;
      }

      const ballLabel = isWicket
        ? 'W'
        : isWide
        ? 'Wd'
        : isNoBall
        ? 'Nb'
        : isBye
        ? `B${runs}`
        : isLegBye
        ? `Lb${runs}`
        : String(runs);

      const recentBalls = [
        ...(current.recentBalls || []),
        ballLabel
      ].slice(-12);

      return {
        ...current,

        runs: nextRuns,
        wickets: nextWickets,
        balls: nextBalls,

        strikerId: nextStriker,
        nonStrikerId: nextNonStriker,
        bowlerId: nextBowler,

        lastBowlerId,

        recentBalls,

        boundary:
          runs === 4
            ? 4
            : runs === 6
            ? 6
            : null,

        wicket: Boolean(isWicket)
      };
    },
    [currentInnings]
  );

  // ---------------------------------------------------------
  // Play ball
  // ---------------------------------------------------------
  const playBall = useCallback(
    (runs, extraType = null, wicketData = null) => {
      if (!currentInnings) return;

      const current =
        optimisticRef.current || {
          runs: Number(currentInnings.total_runs || 0),
          wickets: Number(
            currentInnings.total_wickets || 0
          ),
          balls: Number(
            currentInnings.total_balls || 0
          ),
          strikerId:
            currentInnings.striker_id || null,
          nonStrikerId:
            currentInnings.non_striker_id || null,
          bowlerId:
            currentInnings.current_bowler_id || null,
          recentBalls: []
        };

      if (!current.strikerId) {
        setError('Please select batsmen first.');
        return;
      }

      if (!current.bowlerId) {
        setError('Please select a bowler first.');
        return;
      }

      setError('');

      const payload = {
        runs: Number(runs || 0)
      };

      if (extraType) {
        payload.extra_type = extraType;
      }

      if (wicketData) {
        Object.assign(payload, wicketData);
      }

      /*
       * Update UI immediately.
       */
      const next = buildOptimisticBall(
        current,
        payload
      );

      optimisticRef.current = next;
      setOptimistic(next);

      if (next.boundary) {
        setBoundary(next.boundary);

        clearTimeout(boundaryTimerRef.current);

        boundaryTimerRef.current = setTimeout(() => {
          setBoundary(null);
        }, 500);
      }

      if (next.wicket) {
        setFlashWicket(true);

        clearTimeout(wicketTimerRef.current);

        wicketTimerRef.current = setTimeout(() => {
          setFlashWicket(false);
        }, 700);
      }

      /*
       * Add to queue.
       *
       * If this is ball 6, the UI can immediately show
       * Select Bowler. The actual request is still saved
       * in correct order.
       */
      enqueueAction({
        type: 'ball',
        inningsId: currentInnings.id,
        payload
      });

      setExtraPicker(null);
    },
    [
      currentInnings,
      buildOptimisticBall,
      enqueueAction
    ]
  );

  // ---------------------------------------------------------
  // Fast bowler selection
  // ---------------------------------------------------------
  const selectBowler = useCallback(
    (bowlerId) => {
      if (!currentInnings || !bowlerId) return;

      const current =
        optimisticRef.current || {
          runs: Number(currentInnings.total_runs || 0),
          wickets: Number(
            currentInnings.total_wickets || 0
          ),
          balls: Number(
            currentInnings.total_balls || 0
          ),
          strikerId:
            currentInnings.striker_id || null,
          nonStrikerId:
            currentInnings.non_striker_id || null,
          bowlerId:
            currentInnings.current_bowler_id || null,
          recentBalls: []
        };

      setError('');

      /*
       * IMPORTANT:
       * Change the bowler locally FIRST.
       *
       * The user does not wait for Turso/Render.
       */
      const next = {
        ...current,
        bowlerId
      };

      optimisticRef.current = next;
      setOptimistic(next);

      /*
       * Queue the request behind any pending ball.
       *
       * Example:
       * Ball 6
       *   ↓
       * Set Bowler
       *
       * So backend order remains safe.
       */
      enqueueAction({
        type: 'bowler',
        inningsId: currentInnings.id,
        bowlerId
      });
    },
    [currentInnings, enqueueAction]
  );

  // ---------------------------------------------------------
  // Set batsmen
  // ---------------------------------------------------------
  const setBatsmen = async (strikerId, nonStrikerId) => {
    if (!currentInnings) return;

    try {
      setError('');

      const next = {
        ...(optimisticRef.current || {}),
        strikerId,
        nonStrikerId
      };

      optimisticRef.current = next;
      setOptimistic(next);

      increasePending();

      await Innings.setBatsmen(
        currentInnings.id,
        {
          striker_id: strikerId,
          non_striker_id: nonStrikerId
        }
      );

      decreasePending();

      await loadFull();
    } catch (err) {
      decreasePending();

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to set batsmen'
      );

      await loadFull();
    }
  };

  // ---------------------------------------------------------
  // Swap batsmen
  // ---------------------------------------------------------
  const swapBatsmen = async () => {
    if (!currentInnings) return;

    const current =
      optimisticRef.current || {
        strikerId: currentInnings.striker_id,
        nonStrikerId:
          currentInnings.non_striker_id,
        bowlerId:
          currentInnings.current_bowler_id
      };

    if (!current.strikerId || !current.nonStrikerId) {
      setError('Both batsmen must be selected.');
      return;
    }

    const next = {
      ...(optimisticRef.current || {}),
      strikerId: current.nonStrikerId,
      nonStrikerId: current.strikerId
    };

    optimisticRef.current = next;
    setOptimistic(next);

    try {
      increasePending();

      await Innings.swapStrike(
        currentInnings.id
      );

      decreasePending();

      await loadFull();
    } catch (err) {
      decreasePending();

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to swap batsmen'
      );

      await loadFull();
    }
  };

  // ---------------------------------------------------------
  // Undo
  // ---------------------------------------------------------
  const undo = async () => {
    if (!currentInnings) return;

    if (pendingCountRef.current > 0) {
      setError(
        'Please wait for the current action to save.'
      );
      return;
    }

    try {
      setError('');

      increasePending();

      await Innings.undo(currentInnings.id);

      decreasePending();

      await loadFull();
    } catch (err) {
      decreasePending();

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to undo'
      );
    }
  };

  // ---------------------------------------------------------
  // Wicket
  // ---------------------------------------------------------
  const handleWicket = (data) => {
    setShowWicket(false);

    playBall(0, null, {
      is_wicket: true,
      wicket_type:
        data?.wicket_type ||
        data?.type ||
        'bowled',
      dismissed_player_id:
        data?.dismissed_player_id ||
        data?.player_id ||
        effectiveStrikerId,
      new_batsman_id:
        data?.new_batsman_id || null
    });
  };

  // ---------------------------------------------------------
  // Match / innings status
  // ---------------------------------------------------------
  if (!match || !currentInnings) {
    return (
      <div className="p-6 text-center">
        Loading scoreboard...
      </div>
    );
  }

  const effectiveRuns = optimistic
    ? optimistic.runs
    : Number(currentInnings.total_runs || 0);

  const effectiveWickets = optimistic
    ? optimistic.wickets
    : Number(currentInnings.total_wickets || 0);

  const effectiveBalls = optimistic
    ? optimistic.balls
    : Number(currentInnings.total_balls || 0);

  const effectiveRecentBalls = optimistic
    ? optimistic.recentBalls || []
    : [];

  /*
   * This is the most important part of the fix.
   *
   * After over completion:
   *
   * optimistic.bowlerId === null
   *
   * Therefore SelectBowler appears immediately.
   */
  const needBowler =
    !effectiveBowlerId;

  const needBatsmen =
    !effectiveStrikerId ||
    !effectiveNonStrikerId;

  const oversLimit =
    Number(
      currentInnings.overs_limit ||
        match.overs_limit ||
        20
    );

  const inningsComplete =
    effectiveBalls >= oversLimit * 6 ||
    effectiveWickets >=
      Number(currentInnings.max_wickets || 10);

  // ---------------------------------------------------------
  // Select batsmen screen
  // ---------------------------------------------------------
  if (needBatsmen && !inningsComplete) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">
            Select Batsmen
          </h1>

          <p className="text-gray-400 mb-6">
            Choose striker and non-striker to start scoring.
          </p>

          <BatsmenSelector
            players={players}
            onConfirm={setBatsmen}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Select bowler screen
  // ---------------------------------------------------------
  if (needBowler && !inningsComplete) {
    const bowlingTeamId =
      currentInnings.bowling_team_id;

    const bowlingPlayers = players.filter((p) => {
      if (!bowlingTeamId) return true;

      return (
        String(p.team_id) ===
        String(bowlingTeamId)
      );
    });

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-xl mx-auto">
          <div className="mb-6">
            <div className="text-sm text-gray-400">
              Over completed
            </div>

            <h1 className="text-3xl font-bold mt-1">
              Select Bowler
            </h1>

            <p className="text-gray-400 mt-2">
              Choose the bowler for the next over.
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <div className="mb-4 text-center">
              <div className="text-4xl font-bold">
                {effectiveRuns}/
                {effectiveWickets}
              </div>

              <div className="text-gray-400">
                {formatOvers(effectiveBalls)} overs
              </div>
            </div>

            <SelectBowler
              players={bowlingPlayers}
              onConfirm={selectBowler}
            />

            {pendingCount > 0 && (
              <div className="text-center text-xs text-gray-500 mt-4">
                Saving previous ball...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Main scorer
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto p-3 sm:p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-gray-400">
              {match.team1_name ||
                match.team1 ||
                'Team A'}
              {' vs '}
              {match.team2_name ||
                match.team2 ||
                'Team B'}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold">
              Scorer
            </h1>
          </div>

          <button
            onClick={() =>
              navigate(`/matches/${matchId}`)
            }
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            Exit
          </button>
        </div>

        {/* Score */}
        <div className="rounded-3xl bg-gray-900 border border-gray-800 p-5 mb-4">

          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-5xl sm:text-6xl font-black tracking-tight">
                {effectiveRuns}/
                {effectiveWickets}
              </div>

              <div className="text-gray-400 text-lg mt-1">
                {formatOvers(effectiveBalls)} /{' '}
                {oversLimit} overs
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-500">
                RR
              </div>

              <div className="text-2xl font-bold">
                {calculateRR(
                  effectiveRuns,
                  effectiveBalls
                )}
              </div>
            </div>
          </div>

          {/* Recent balls */}
          {effectiveRecentBalls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-5">
              {effectiveRecentBalls.map(
                (ball, index) => (
                  <div
                    key={`${ball}-${index}`}
                    className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold"
                  >
                    {ball}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Wicket flash */}
        {flashWicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-7xl sm:text-9xl font-black">
              WICKET!
            </div>
          </div>
        )}

        {/* Boundary flash */}
        {boundary && (
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="text-8xl sm:text-9xl font-black">
              {boundary}
            </div>
          </div>
        )}

        {/* Players */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">

          <PlayerCard
            title="Striker"
            player={striker}
            active
          />

          <PlayerCard
            title="Non-Striker"
            player={nonStriker}
          />

          <PlayerCard
            title="Bowling"
            player={bowler}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950 border border-red-800 text-red-200">
            {error}
          </div>
        )}

        {/* Saving indicator */}
        {pendingCount > 0 && (
          <div className="mb-3 text-center text-xs text-gray-500">
            Saving {pendingCount} action
            {pendingCount > 1 ? 's' : ''}...
          </div>
        )}

        {/* Run buttons */}
        <div className="grid grid-cols-4 gap-3 mb-4">

          {[0, 1, 2, 3, 4, 6].map(
            (run) => (
              <button
                key={run}
                onClick={() =>
                  playBall(run)
                }
                disabled={needBowler || needBatsmen}
                className="h-16 sm:h-20 rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 disabled:opacity-40 text-xl sm:text-2xl font-bold transition"
              >
                {run}
              </button>
            )
          )}

          <button
            onClick={() =>
              setExtraPicker(
                extraPicker === 'wide'
                  ? null
                  : 'wide'
              )
            }
            disabled={needBowler || needBatsmen}
            className="h-16 sm:h-20 rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 disabled:opacity-40 font-bold"
          >
            Wide
          </button>

          <button
            onClick={() =>
              setExtraPicker(
                extraPicker === 'no_ball'
                  ? null
                  : 'no_ball'
              )
            }
            disabled={needBowler || needBatsmen}
            className="h-16 sm:h-20 rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 disabled:opacity-40 font-bold"
          >
            No Ball
          </button>

          <button
            onClick={() =>
              setExtraPicker(
                extraPicker === 'bye'
                  ? null
                  : 'bye'
              )
            }
            disabled={needBowler || needBatsmen}
            className="h-16 sm:h-20 rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 disabled:opacity-40 font-bold"
          >
            Bye
          </button>

          <button
            onClick={() =>
              setExtraPicker(
                extraPicker === 'leg_bye'
                  ? null
                  : 'leg_bye'
              )
            }
            disabled={needBowler || needBatsmen}
            className="h-16 sm:h-20 rounded-2xl bg-gray-800 hover:bg-gray-700 active:scale-95 disabled:opacity-40 font-bold"
          >
            Leg Bye
          </button>

          <button
            onClick={() => setShowWicket(true)}
            disabled={needBowler || needBatsmen}
            className="h-16 sm:h-20 rounded-2xl bg-red-900 hover:bg-red-800 active:scale-95 disabled:opacity-40 font-black"
          >
            OUT
          </button>
        </div>

        {/* Extra picker */}
        {extraPicker && (
          <ExtraPicker
            type={extraPicker}
            onSelect={(runs) =>
              playBall(
                runs,
                extraPicker
              )
            }
            onClose={() =>
              setExtraPicker(null)
            }
          />
        )}

        {/* Controls */}
        <div className="grid grid-cols-3 gap-3 mt-4">

          <button
            onClick={undo}
            disabled={
              pendingCount > 0 ||
              effectiveBalls === 0
            }
            className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 font-semibold"
          >
            Undo
          </button>

          <button
            onClick={swapBatsmen}
            disabled={
              pendingCount > 0 ||
              !effectiveStrikerId ||
              !effectiveNonStrikerId
            }
            className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 font-semibold"
          >
            Swap
          </button>

          <button
            onClick={() =>
              navigate(
                `/matches/${matchId}/scoreboard`
              )
            }
            className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold"
          >
            Full Score
          </button>
        </div>
      </div>

      {/* Wicket Modal */}
      {showWicket && (
        <WicketModal
          striker={striker}
          players={players}
          onConfirm={handleWicket}
          onClose={() =>
            setShowWicket(false)
          }
        />
      )}
    </div>
  );
}

/* ============================================================
   PLAYER CARD
============================================================ */

function PlayerCard({
  title,
  player,
  active
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        active
          ? 'border-gray-600 bg-gray-900'
          : 'border-gray-800 bg-gray-900'
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
        {title}
      </div>

      <div className="font-bold text-lg">
        {player?.name ||
          player?.player_name ||
          'Not selected'}
      </div>
    </div>
  );
}

/* ============================================================
   BOWLER SELECTOR
============================================================ */

function SelectBowler({
  players,
  onConfirm
}) {
  const [selected, setSelected] =
    useState(null);

  return (
    <div>
      <div className="mb-4">
        <PlayerAutocomplete
          players={players}
          value={selected}
          onChange={(player) =>
            setSelected(
              player?.id ||
                player?.player_id ||
                player
            )
          }
          placeholder="Search bowler..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {players.map((player) => {
          const id =
            player.id ||
            player.player_id;

          const active =
            String(selected) ===
            String(id);

          return (
            <button
              key={id}
              onClick={() =>
                setSelected(id)
              }
              className={`p-4 rounded-xl border text-left transition ${
                active
                  ? 'border-gray-400 bg-gray-800'
                  : 'border-gray-800 bg-gray-900 hover:bg-gray-800'
              }`}
            >
              <div className="font-semibold">
                {player.name ||
                  player.player_name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        disabled={!selected}
        onClick={() =>
          onConfirm(selected)
        }
        className="w-full mt-5 py-4 rounded-xl bg-white text-black font-black disabled:opacity-40"
      >
        Start Over
      </button>
    </div>
  );
}

/* ============================================================
   BATSMEN SELECTOR
============================================================ */

function BatsmenSelector({
  players,
  onConfirm
}) {
  const [striker, setStriker] =
    useState(null);

  const [nonStriker, setNonStriker] =
    useState(null);

  const battingPlayers = players;

  const confirm = () => {
    if (!striker || !nonStriker) return;

    if (
      String(striker) ===
      String(nonStriker)
    ) {
      return;
    }

    onConfirm(
      striker,
      nonStriker
    );
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">

      <div className="mb-5">
        <label className="block text-sm text-gray-400 mb-2">
          Striker
        </label>

        <select
          value={striker || ''}
          onChange={(e) =>
            setStriker(
              e.target.value || null
            )
          }
          className="w-full p-4 rounded-xl bg-gray-800 text-white border border-gray-700"
        >
          <option value="">
            Select striker
          </option>

          {battingPlayers.map((p) => {
            const id =
              p.id ||
              p.player_id;

            return (
              <option
                key={id}
                value={id}
              >
                {p.name ||
                  p.player_name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="mb-5">
        <label className="block text-sm text-gray-400 mb-2">
          Non-Striker
        </label>

        <select
          value={nonStriker || ''}
          onChange={(e) =>
            setNonStriker(
              e.target.value || null
            )
          }
          className="w-full p-4 rounded-xl bg-gray-800 text-white border border-gray-700"
        >
          <option value="">
            Select non-striker
          </option>

          {battingPlayers.map((p) => {
            const id =
              p.id ||
              p.player_id;

            return (
              <option
                key={id}
                value={id}
                disabled={
                  String(id) ===
                  String(striker)
                }
              >
                {p.name ||
                  p.player_name}
              </option>
            );
          })}
        </select>
      </div>

      <button
        disabled={
          !striker ||
          !nonStriker ||
          String(striker) ===
            String(nonStriker)
        }
        onClick={confirm}
        className="w-full py-4 rounded-xl bg-white text-black font-black disabled:opacity-40"
      >
        Start Innings
      </button>
    </div>
  );
}

/* ============================================================
   EXTRA PICKER
============================================================ */

function ExtraPicker({
  type,
  onSelect,
  onClose
}) {
  const title =
    type === 'wide'
      ? 'Wide Runs'
      : type === 'no_ball'
      ? 'No Ball Runs'
      : type === 'bye'
      ? 'Bye Runs'
      : 'Leg Bye Runs';

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 mb-4">

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">
          {title}
        </h3>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(
          (runs) => (
            <button
              key={runs}
              onClick={() =>
                onSelect(runs)
              }
              className="h-14 rounded-xl bg-gray-800 hover:bg-gray-700 font-bold"
            >
              {runs}
            </button>
          )
        )}
      </div>
    </div>
  );
}
