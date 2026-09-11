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
  const [extraPicker, setExtraPicker] = useState(null);
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const [optimistic, setOptimistic] = useState(null);

  const optimisticRef = useRef(null);
  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  const boundaryTimer = useRef(null);

  const applyServerData = useCallback((d, keepNextBowler = false) => {
    if (!d) return;

    setMatch(d.match || null);
    setPlayers(Array.isArray(d.players) ? d.players : []);
    setInnings(Array.isArray(d.innings) ? d.innings : []);

    if (keepNextBowler) {
      const previous = optimisticRef.current || {};

      const nextState = {
        ...previous,
        needsNextBowler: true,
        activeBowlerId: null
      };

      optimisticRef.current = nextState;
      setOptimistic(nextState);
    } else {
      optimisticRef.current = null;
      setOptimistic(null);
    }
  }, []);

  const loadFull = useCallback(async () => {
    try {
      const d = await Matches.get(matchId);

      if (pendingCountRef.current > 0) {
        return;
      }

      const list = Array.isArray(d?.innings)
        ? d.innings
        : [];

      const serverCurrent =
        list[list.length - 1]?.innings;

      const overFinished =
        serverCurrent &&
        Number(serverCurrent.total_balls || 0) > 0 &&
        Number(serverCurrent.total_balls || 0) % 6 === 0 &&
        !serverCurrent.current_bowler_id;

      applyServerData(d, overFinished);
    } catch (e) {
      console.error('Load error:', e);
    }
  }, [matchId, applyServerData]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const handleScoreUpdate = ({ match: m, innings: i }) => {
      if (pendingCountRef.current > 0) return;

      const list = Array.isArray(i) ? i : [];

      const current =
        list[list.length - 1]?.innings;

      const overFinished =
        current &&
        Number(current.total_balls || 0) > 0 &&
        Number(current.total_balls || 0) % 6 === 0 &&
        !current.current_bowler_id;

      setMatch(m || null);
      setInnings(list);

      if (overFinished) {
        const nextState = {
          ...(optimisticRef.current || {}),
          needsNextBowler: true,
          activeBowlerId: null
        };

        optimisticRef.current = nextState;
        setOptimistic(nextState);
      } else {
        optimisticRef.current = null;
        setOptimistic(null);
      }
    };

    socket.on('score-update', handleScoreUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', handleScoreUpdate);
    };
  }, [matchId]);

  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      scoreQueueRef.current = [];
      processingQueueRef.current = false;
    };
  }, []);

  const handlePlayerCreated = useCallback((player) => {
    if (!player) return;

    setPlayers(prev => {
      if (prev.some(p => p.id === player.id)) {
        return prev;
      }

      return [...prev, player];
    });
  }, []);

  const showBoundary = (type) => {
    clearTimeout(boundaryTimer.current);

    setBoundary(type);

    boundaryTimer.current = setTimeout(() => {
      setBoundary(null);
    }, 900);
  };

  const showWicketFlash = () => {
    setFlashWicket(true);

    setTimeout(() => {
      setFlashWicket(false);
    }, 600);
  };

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previous
  }) => {
    const strikerId =
      previous?.strikerId ??
      current.striker_id;

    const nonStrikerId =
      previous?.nonStrikerId ??
      current.non_striker_id;

    const bowlerId =
      previous?.activeBowlerId ??
      current.current_bowler_id;

    const runs =
      Number(payload.runs || 0);

    const extraRuns =
      Number(payload.extra_runs || 0);

    let teamRuns = runs;
    let batsmanRuns = runs;
    let legal = true;

    if (payload.extra_type === 'wide') {
      teamRuns = Math.max(1, extraRuns || 1);
      batsmanRuns = 0;
      legal = false;
    }

    if (payload.extra_type === 'noball') {
      teamRuns =
        Math.max(1, extraRuns || 1) +
        runs;

      batsmanRuns = runs;
      legal = false;
    }

    if (
      payload.extra_type === 'bye' ||
      payload.extra_type === 'legbye'
    ) {
      teamRuns = Math.max(0, extraRuns);
      batsmanRuns = 0;
      legal = true;
    }

    if (payload.extra_type === 'penalty') {
      teamRuns = extraRuns;
      batsmanRuns = 0;
      legal = false;
    }

    const wicket = !!payload.is_wicket;

    const totalRuns =
      Number(
        previous?.total_runs ??
        current.total_runs ??
        0
      ) + teamRuns;

    const totalWickets =
      Number(
        previous?.total_wickets ??
        current.total_wickets ??
        0
      ) + (wicket ? 1 : 0);

    const totalBalls =
      Number(
        previous?.total_balls ??
        current.total_balls ??
        0
      ) + (legal ? 1 : 0);

    let newStrikerId = strikerId;
    let newNonStrikerId = nonStrikerId;

    if (
      !wicket &&
      runs % 2 === 1
    ) {
      [newStrikerId, newNonStrikerId] = [
        newNonStrikerId,
        newStrikerId
      ];
    }

    if (wicket && payload.dismissed_id) {
      if (
        payload.dismissed_id ===
        newStrikerId
      ) {
        newStrikerId = null;
      }

      if (
        payload.dismissed_id ===
        newNonStrikerId
      ) {
        newNonStrikerId = null;
      }
    }

    if (
      legal &&
      totalBalls % 6 === 0 &&
      totalBalls > 0 &&
      newStrikerId &&
      newNonStrikerId
    ) {
      [newStrikerId, newNonStrikerId] = [
        newNonStrikerId,
        newStrikerId
      ];
    }

    const battingCard =
      Array.isArray(
        currentInnings.battingCard
      )
        ? currentInnings.battingCard
        : [];

    const oldStriker =
      previous?.strikerStats ||
      battingCard.find(
        p => p.player_id === strikerId
      ) || {
        player_id: strikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strike_rate: 0
      };

    const oldNonStriker =
      previous?.nonStrikerStats ||
      battingCard.find(
        p => p.player_id === nonStrikerId
      ) || {
        player_id: nonStrikerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strike_rate: 0
      };

    const strikerRuns =
      Number(oldStriker.runs || 0) +
      (
        payload.extra_type === 'wide' ||
        payload.extra_type === 'bye' ||
        payload.extra_type === 'legbye'
          ? 0
          : batsmanRuns
      );

    const strikerBalls =
      Number(oldStriker.balls || 0) +
      (
        payload.extra_type === 'wide'
          ? 0
          : 1
      );

    const strikerFours =
      Number(oldStriker.fours || 0) +
      (
        batsmanRuns === 4 &&
        payload.extra_type !== 'wide' &&
        payload.extra_type !== 'bye' &&
        payload.extra_type !== 'legbye'
          ? 1
          : 0
      );

    const strikerSixes =
      Number(oldStriker.sixes || 0) +
      (
        batsmanRuns === 6 &&
        payload.extra_type !== 'wide' &&
        payload.extra_type !== 'bye' &&
        payload.extra_type !== 'legbye'
          ? 1
          : 0
      );

    const strikerSR =
      strikerBalls > 0
        ? Number(
            (
              strikerRuns /
              strikerBalls *
              100
            ).toFixed(2)
          )
        : 0;

    const strikerStats = {
      ...oldStriker,
      player_id: strikerId,
      runs: strikerRuns,
      balls: strikerBalls,
      fours: strikerFours,
      sixes: strikerSixes,
      strike_rate: strikerSR,
      is_out:
        wicket &&
        payload.dismissed_id ===
          strikerId
    };

    const nonStrikerStats = {
      ...oldNonStriker,
      player_id: nonStrikerId,
      is_out:
        wicket &&
        payload.dismissed_id ===
          nonStrikerId
    };

    const bowlingCard =
      Array.isArray(
        currentInnings.bowlingCard
      )
        ? currentInnings.bowlingCard
        : [];

    const oldBowler =
      previous?.bowlerStats ||
      bowlingCard.find(
        p => p.player_id === bowlerId
      ) || {
        player_id: bowlerId,
        overs: '0.0',
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0
      };

    let oldBowlerBalls =
      previous?.bowlerBalls;

    if (
      oldBowlerBalls === undefined
    ) {
      const parts =
        String(
          oldBowler.overs || '0.0'
        ).split('.');

      oldBowlerBalls =
        Number(parts[0] || 0) * 6 +
        Number(parts[1] || 0);
    }

    const bowlerBalls =
      oldBowlerBalls +
      (legal ? 1 : 0);

    let bowlerRuns = 0;

    if (
      payload.extra_type === 'bye' ||
      payload.extra_type === 'legbye' ||
      payload.extra_type === 'penalty'
    ) {
      bowlerRuns = 0;
    } else {
      bowlerRuns =
        (
          payload.extra_type === 'wide'
            ? Math.max(
                1,
                extraRuns || 1
              )
            : payload.extra_type === 'noball'
              ? Math.max(
                  1,
                  extraRuns || 1
                ) + runs
              : runs
        );
    }

    bowlerRuns +=
      Number(oldBowler.runs || 0);

    const bowlerWickets =
      Number(oldBowler.wickets || 0) +
      (
        wicket &&
        payload.wicket_type !== 'run-out'
          ? 1
          : 0
      );

    const bowlerOvers =
      `${Math.floor(
        bowlerBalls / 6
      )}.${bowlerBalls % 6}`;

    const economy =
      bowlerBalls > 0
        ? Number(
            (
              bowlerRuns /
              (bowlerBalls / 6)
            ).toFixed(2)
          )
        : 0;

    const bowlerStats = {
      ...oldBowler,
      player_id: bowlerId,
      overs: bowlerOvers,
      runs: bowlerRuns,
      wickets: bowlerWickets,
      economy
    };

    const recentBalls =
      Array.isArray(
        previous?.recentBalls
      )
        ? previous.recentBalls
        : (
            Array.isArray(
              currentInnings.recentBalls
            )
              ? currentInnings.recentBalls
              : []
          );

    const newBall = {
      id:
        `local-${Date.now()}-${Math.random()}`,

      ball_sequence:
        totalBalls,

      over_number:
        Math.floor(
          Math.max(
            0,
            totalBalls - 1
          ) / 6
        ),

      ball_in_over:
        totalBalls % 6 || 6,

      batsman_id:
        strikerId,

      bowler_id:
        bowlerId,

      runs_batsman:
        batsmanRuns,

      extra_type:
        payload.extra_type || null,

      extra_runs:
        extraRuns,

      is_wicket:
        wicket,

      wicket_type:
        payload.wicket_type || null,

      dismissed_id:
        payload.dismissed_id || null,

      fielder_id:
        payload.fielder_id || null,

      is_legal:
        legal ? 1 : 0
    };

    const newRecentBalls = [
      ...recentBalls,
      newBall
    ].slice(-24);

    const needsNextBowler =
      legal &&
      totalBalls > 0 &&
      totalBalls % 6 === 0;

    const runRate =
      totalBalls > 0
        ? Number(
            (
              totalRuns /
              (totalBalls / 6)
            ).toFixed(2)
          )
        : 0;

    return {
      total_runs: totalRuns,
      total_wickets: totalWickets,
      total_balls: totalBalls,

      strikerId:
        newStrikerId,

      nonStrikerId:
        newNonStrikerId,

      activeBowlerId:
        needsNextBowler
          ? null
          : bowlerId,

      needsNextBowler,

      strikerStats,
      nonStrikerStats,

      bowlerStats,
      bowlerBalls,

      recentBalls:
        newRecentBalls,

      runRate
    };
  };

  const processScoreQueue = useCallback(async () => {
    if (processingQueueRef.current) {
      return;
    }

    processingQueueRef.current = true;

    let failed = false;

    while (
      scoreQueueRef.current.length
    ) {
      const item =
        scoreQueueRef.current.shift();

      if (!item) continue;

      try {
        const result =
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

        const resultInnings =
          result?.innings;

        const overFinished =
          result?.overJustCompleted ||
          (
            resultInnings &&
            Number(
              resultInnings.total_balls || 0
            ) > 0 &&
            Number(
              resultInnings.total_balls || 0
            ) % 6 === 0 &&
            !resultInnings.current_bowler_id
          );

        if (overFinished) {
          const nextState = {
            ...(optimisticRef.current || {}),
            needsNextBowler: true,
            activeBowlerId: null
          };

          optimisticRef.current =
            nextState;

          setOptimistic(nextState);
        }
      } catch (e) {
        failed = true;

        console.error(
          'Ball save error:',
          e
        );

        setError(
          e?.response?.data?.error ||
          e?.message ||
          'Unable to save ball'
        );

        scoreQueueRef.current = [];

        pendingCountRef.current = 0;

        setPendingCount(0);

        optimisticRef.current = null;
        setOptimistic(null);

        try {
          const d =
            await Matches.get(
              matchId
            );

          applyServerData(d);
        } catch (_) {}

        break;
      }
    }

    processingQueueRef.current = false;

    if (
      !failed &&
      pendingCountRef.current === 0
    ) {
      try {
        const d =
          await Matches.get(
            matchId
          );

        const list =
          Array.isArray(d?.innings)
            ? d.innings
            : [];

        const current =
          list[list.length - 1]?.innings;

        const overFinished =
          current &&
          Number(
            current.total_balls || 0
          ) > 0 &&
          Number(
            current.total_balls || 0
          ) % 6 === 0 &&
          !current.current_bowler_id;

        if (overFinished) {
          setMatch(d.match || null);
          setPlayers(
            Array.isArray(d.players)
              ? d.players
              : []
          );
          setInnings(list);

          const nextState = {
            ...(optimisticRef.current || {}),
            needsNextBowler: true,
            activeBowlerId: null
          };

          optimisticRef.current =
            nextState;

          setOptimistic(nextState);
        } else {
          applyServerData(d);
        }
      } catch (_) {}
    }
  }, [
    matchId,
    applyServerData
  ]);

  const playBall = (payload) => {
    const currentInnings =
      innings[innings.length - 1];

    if (!currentInnings) return;

    const current =
      currentInnings.innings;

    if (!current) return;

    const strikerId =
      optimisticRef.current?.strikerId ??
      current.striker_id;

    const nonStrikerId =
      optimisticRef.current?.nonStrikerId ??
      current.non_striker_id;

    const bowlerId =
      optimisticRef.current?.activeBowlerId ??
      current.current_bowler_id;

    if (
      optimisticRef.current?.needsNextBowler
    ) {
      return;
    }

    if (!bowlerId) {
      const nextState = {
        ...(optimisticRef.current || {}),
        strikerId,
        nonStrikerId,
        activeBowlerId: null,
        needsNextBowler: true
      };

      optimisticRef.current =
        nextState;

      setOptimistic(nextState);

      setError(
        'Select the next bowler.'
      );

      return;
    }

    if (
      !strikerId ||
      !nonStrikerId
    ) {
      setError(
        'Please select both batsmen.'
      );

      return;
    }

    if (
      !payload.extra_type &&
      payload.runs === 4
    ) {
      showBoundary('four');
    }

    if (
      !payload.extra_type &&
      payload.runs === 6
    ) {
      showBoundary('six');
    }

    if (payload.is_wicket) {
      showWicketFlash();
    }

    const nextState =
      buildOptimisticBall({
        current,
        currentInnings,
        payload,
        previous:
          optimisticRef.current
      });

    optimisticRef.current =
      nextState;

    setOptimistic(nextState);

    scoreQueueRef.current.push({
      inningsId: current.id,
      payload
    });

    pendingCountRef.current += 1;

    setPendingCount(
      pendingCountRef.current
    );

    processScoreQueue();
  };

  const selectNextBowler =
    async (nextBowlerId) => {
      if (!nextBowlerId) {
        setError(
          'Please select a bowler.'
        );
        return;
      }

      try {
        setError('');

        await Innings.setBowler(
          currentInnings.innings.id,
          {
            bowler_id:
              nextBowlerId
          }
        );

        /*
         * Immediately change UI.
         */
        const nextState = {
          ...(optimisticRef.current || {}),

          activeBowlerId:
            nextBowlerId,

          needsNextBowler: false,

          bowlerBalls: 0,

          bowlerStats: {
            player_id:
              nextBowlerId,

            overs: '0.0',
            maidens: 0,
            runs: 0,
            wickets: 0,
            economy: 0
          }
        };

        optimisticRef.current =
          nextState;

        setOptimistic(nextState);

        /*
         * Refresh server data.
         */
        const d =
          await Matches.get(
            matchId
          );

        setMatch(d.match || null);

        setPlayers(
          Array.isArray(d.players)
            ? d.players
            : []
        );

        setInnings(
          Array.isArray(d.innings)
            ? d.innings
            : []
        );

        /*
         * Keep selected bowler locally.
         * This prevents a stale response from
         * showing "Over Completed" again.
         */
        optimisticRef.current =
          nextState;

        setOptimistic(nextState);

      } catch (e) {
        console.error(
          'Bowler selection error:',
          e
        );

        setError(
          e?.response?.data?.error ||
          e?.message ||
          'Unable to select bowler'
        );
      }
    };

  if (!match) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="card text-center text-slate-400">
          Loading scorer…
        </div>
      </div>
    );
  }

  const currentInnings =
    innings[innings.length - 1];

  if (!currentInnings) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="card text-center text-slate-400">
          Setting up innings…
        </div>
      </div>
    );
  }

  const inn =
    currentInnings.innings;

  const totalRuns =
    optimistic?.total_runs ??
    inn.total_runs ??
    0;

  const totalWickets =
    optimistic?.total_wickets ??
    inn.total_wickets ??
    0;

  const totalBalls =
    optimistic?.total_balls ??
    inn.total_balls ??
    0;

  const overs =
    `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;

  const runRate =
    totalBalls > 0
      ? (
          totalRuns /
          (totalBalls / 6)
        ).toFixed(2)
      : '0.00';

  const strikerId =
    optimistic?.strikerId ??
    inn.striker_id;

  const nonStrikerId =
    optimistic?.nonStrikerId ??
    inn.non_striker_id;

  const bowlerId =
    optimistic?.activeBowlerId ??
    inn.current_bowler_id;

  const battingPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.batting_team_id &&
        p.active !== false
    );

  const bowlingPlayers =
    players.filter(
      p =>
        p.team_id ===
          inn.bowling_team_id &&
        p.active !== false
    );

  const striker =
    players.find(
      p => p.id === strikerId
    );

  const nonStriker =
    players.find(
      p => p.id === nonStrikerId
    );

  const bowler =
    players.find(
      p => p.id === bowlerId
    );

  const outIds =
    new Set(
      (
        Array.isArray(
          currentInnings.battingCard
        )
          ? currentInnings.battingCard
          : []
      )
        .filter(
          p => p.is_out
        )
        .map(
          p => p.player_id
        )
    );

  const needBatsmen =
    !strikerId ||
    !nonStrikerId;

  /*
   * MAIN FIX:
   *
   * Next bowler uses the SAME CONTROL AREA.
   */
  const needsNextBowler =
    optimistic?.needsNextBowler === true ||
    (
      !inn.current_bowler_id &&
      pendingCount === 0
    );

  const battingCard =
    Array.isArray(
      currentInnings.battingCard
    )
      ? currentInnings.battingCard
      : [];

  const bowlingCard =
    Array.isArray(
      currentInnings.bowlingCard
    )
      ? currentInnings.bowlingCard
      : [];

  const serverStrikerStats =
    battingCard.find(
      p => p.player_id === strikerId
    ) || {
      player_id: strikerId,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  const serverNonStrikerStats =
    battingCard.find(
      p =>
        p.player_id ===
        nonStrikerId
    ) || {
      player_id: nonStrikerId,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strike_rate: 0
    };

  const strikerStats =
    optimistic?.strikerStats &&
    optimistic.strikerStats.player_id ===
      strikerId
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic?.nonStrikerStats &&
    optimistic.nonStrikerStats.player_id ===
      nonStrikerId
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  const serverBowlerStats =
    bowlingCard.find(
      p =>
        p.player_id ===
        bowlerId
    ) || {
      player_id: bowlerId,
      overs: '0.0',
      maidens: 0,
      runs: 0,
      wickets: 0,
      economy: 0
    };

  const bowlerStats =
    optimistic?.bowlerStats &&
    optimistic.bowlerStats.player_id ===
      bowlerId
      ? {
          ...serverBowlerStats,
          ...optimistic.bowlerStats
        }
      : serverBowlerStats;

  const recentBalls =
    optimistic?.recentBalls ||
    (
      Array.isArray(
        currentInnings.recentBalls
      )
        ? currentInnings.recentBalls
        : []
    );

  const currentOver =
    recentBalls.filter(
      ball =>
        ball.over_number ===
        Math.floor(
          Math.max(
            0,
            totalBalls - 1
          ) / 6
        )
    );

  if (needBatsmen) {
    return (
      <div className="max-w-xl mx-auto p-3 sm:p-4">

        <div className="card">

          <h1 className="text-xl font-bold mb-1">
            Select Batsmen
          </h1>

          <p className="text-sm text-slate-400 mb-5">
            Choose the two batsmen before starting the over.
          </p>

          <SelectBatsmen
            team={battingPlayers}
            outIds={outIds}
            teamId={inn.batting_team_id}
            onPlayerCreated={
              handlePlayerCreated
            }
            hasStriker={
              !!strikerId
            }
            hasNonStriker={
              !!nonStrikerId
            }
            onSelect={async (
              selectedStriker,
              selectedNonStriker
            ) => {
              try {
                await Innings.setBatsmen(
                  inn.id,
                  {
                    striker_id:
                      selectedStriker?.id ||
                      strikerId,

                    non_striker_id:
                      selectedNonStriker?.id ||
                      nonStrikerId
                  }
                );

                await loadFull();
              } catch (e) {
                setError(
                  e?.response?.data?.error ||
                  e?.message ||
                  'Unable to set batsmen'
                );
              }
            }}
          />

        </div>

      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-2 sm:p-4">

      {/* SCOREBOARD */}

      <div
        className={`
          rounded-2xl
          border
          border-slate-700
          bg-slate-900
          shadow-xl
          overflow-hidden
          ${flashWicket ? 'ring-2 ring-red-500' : ''}
        `}
      >

        {/* SCORE HEADER */}

        <div className="p-4 sm:p-5">

          <div className="flex justify-between items-start gap-3">

            <div>

              <div className="text-xs sm:text-sm text-slate-400">
                {match.team1_short || match.team1_name}
                {' '}
                vs
                {' '}
                {match.team2_short || match.team2_name}
              </div>

              <div className="text-3xl sm:text-4xl font-black mt-1">

                {totalRuns}

                <span className="text-slate-400">
                  /{totalWickets}
                </span>

              </div>

              <div className="text-sm text-slate-400 mt-1">
                {overs} overs
                {' • '}
                RR {runRate}
              </div>

            </div>

            <div className="text-right">

              <div className="text-xs text-slate-500">
                {match.overs_limit || 20} OVERS
              </div>

              {pendingCount > 0 && (
                <div className="mt-2 text-xs text-emerald-400">
                  Saving…
                </div>
              )}

            </div>

          </div>

          {/* PLAYERS */}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

            <div className="rounded-xl bg-slate-800/80 p-3">

              <div className="flex justify-between">

                <div className="font-bold">
                  🏏 {striker?.name || 'Striker'}
                  <span className="text-emerald-400 ml-1">
                    ●
                  </span>
                </div>

                <span className="text-[10px] text-emerald-400">
                  STRIKER
                </span>

              </div>

              <div className="flex gap-4 mt-2">

                <MiniStat
                  value={strikerStats.runs}
                  label="R"
                />

                <MiniStat
                  value={strikerStats.balls}
                  label="B"
                />

                <MiniStat
                  value={strikerStats.fours}
                  label="4s"
                />

                <MiniStat
                  value={strikerStats.sixes}
                  label="6s"
                />

                <MiniStat
                  value={strikerStats.strike_rate}
                  label="SR"
                />

              </div>

            </div>

            <div className="rounded-xl bg-slate-800/80 p-3">

              <div className="flex justify-between">

                <div className="font-bold">
                  🏏 {nonStriker?.name || 'Non-striker'}
                </div>

                <span className="text-[10px] text-slate-500">
                  NON-STRIKER
                </span>

              </div>

              <div className="flex gap-4 mt-2">

                <MiniStat
                  value={nonStrikerStats.runs}
                  label="R"
                />

                <MiniStat
                  value={nonStrikerStats.balls}
                  label="B"
                />

                <MiniStat
                  value={nonStrikerStats.fours}
                  label="4s"
                />

                <MiniStat
                  value={nonStrikerStats.sixes}
                  label="6s"
                />

                <MiniStat
                  value={nonStrikerStats.strike_rate}
                  label="SR"
                />

              </div>

            </div>

          </div>

          {/* BOWLER */}

          <div className="rounded-xl bg-slate-800/80 p-3 mt-2">

            <div className="flex justify-between items-center">

              <div className="font-bold">
                🎯 {bowler?.name || 'Bowler'}
              </div>

              <span className="text-[10px] text-slate-500">
                BOWLER
              </span>

            </div>

            <div className="grid grid-cols-5 gap-2 text-center mt-2">

              <MiniStat
                value={bowlerStats.overs}
                label="O"
              />

              <MiniStat
                value={bowlerStats.maidens}
                label="M"
              />

              <MiniStat
                value={bowlerStats.runs}
                label="R"
              />

              <MiniStat
                value={bowlerStats.wickets}
                label="W"
              />

              <MiniStat
                value={bowlerStats.economy}
                label="ECO"
              />

            </div>

          </div>

          {/* CURRENT OVER */}

          <div className="mt-4">

            <div className="flex justify-between items-center mb-2">

              <span className="text-xs font-bold text-slate-400">
                CURRENT OVER
              </span>

              <span className="text-xs text-slate-500">
                {currentOver.length} balls
              </span>

            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">

              {currentOver.length === 0 ? (
                <span className="text-xs text-slate-600">
                  Start scoring
                </span>
              ) : (
                currentOver.map(
                  (ball, index) => (
                    <BallDisplay
                      key={
                        ball.id ||
                        `${index}-${ball.ball_sequence}`
                      }
                      ball={ball}
                    />
                  )
                )
              )}

            </div>

          </div>

        </div>

        {/* =====================================================
            SAME PLACE SCORER CONTROL AREA
            ===================================================== */}

        <div className="border-t border-slate-700 bg-slate-950 p-3 sm:p-4">

          {error && (
            <div className="mb-3 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-sm p-3">
              {error}
            </div>
          )}

          {needsNextBowler ? (

            /* ===============================================
               NEXT BOWLER — SAME PLACE
               =============================================== */

            <div className="rounded-2xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-700/60 p-4">

              <div className="text-center mb-4">

                <div className="text-3xl mb-1">
                  🎯
                </div>

                <div className="text-lg font-bold text-white">
                  Over Completed
                </div>

                <div className="text-xs text-slate-400 mt-1">
                  Select the bowler for the next over
                </div>

              </div>

              <NextBowlerControl
                team={bowlingPlayers}
                teamId={
                  inn.bowling_team_id
                }
                onPlayerCreated={
                  handlePlayerCreated
                }
                onSelect={
                  selectNextBowler
                }
              />

            </div>

          ) : (

            /* ===============================================
               NORMAL SCORING — SAME PLACE
               =============================================== */

            <>

              <div className="text-xs font-bold text-slate-500 mb-2">
                SCORE RUNS
              </div>

              <div className="grid grid-cols-4 gap-2">

                <ScoreButton
                  value="0"
                  onClick={() =>
                    playBall({
                      runs: 0
                    })
                  }
                />

                <ScoreButton
                  value="1"
                  onClick={() =>
                    playBall({
                      runs: 1
                    })
                  }
                />

                <ScoreButton
                  value="2"
                  onClick={() =>
                    playBall({
                      runs: 2
                    })
                  }
                />

                <ScoreButton
                  value="3"
                  onClick={() =>
                    playBall({
                      runs: 3
                    })
                  }
                />

                <ScoreButton
                  value="4"
                  big
                  type="four"
                  onClick={() =>
                    playBall({
                      runs: 4
                    })
                  }
                />

                <ScoreButton
                  value="6"
                  big
                  type="six"
                  onClick={() =>
                    playBall({
                      runs: 6
                    })
                  }
                />

                <button
                  className="h-14 rounded-xl bg-red-700 hover:bg-red-600 active:scale-95 transition font-black text-white"
                  onClick={() =>
                    setShowWicket(true)
                  }
                >
                  OUT
                </button>

                <button
                  className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition font-bold"
                  onClick={() =>
                    setExtraPicker(
                      extraPicker
                        ? null
                        : 'menu'
                    )
                  }
                >
                  EXTRAS
                </button>

              </div>

              {extraPicker && (
                <div className="mt-3 rounded-xl bg-slate-800 border border-slate-700 p-3">

                  <div className="flex justify-between items-center mb-2">

                    <span className="text-xs font-bold text-slate-400">
                      EXTRAS
                    </span>

                    <button
                      className="text-xs text-slate-500"
                      onClick={() =>
                        setExtraPicker(null)
                      }
                    >
                      CLOSE
                    </button>

                  </div>

                  <div className="grid grid-cols-4 gap-2">

                    <button
                      className="h-12 rounded-lg bg-yellow-700 hover:bg-yellow-600 font-bold"
                      onClick={() =>
                        setExtraPicker('wide')
                      }
                    >
                      WIDE
                    </button>

                    <button
                      className="h-12 rounded-lg bg-orange-700 hover:bg-orange-600 font-bold"
                      onClick={() =>
                        setExtraPicker('noball')
                      }
                    >
                      NO BALL
                    </button>

                    <button
                      className="h-12 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold"
                      onClick={() =>
                        setExtraPicker('bye')
                      }
                    >
                      BYE
                    </button>

                    <button
                      className="h-12 rounded-lg bg-cyan-800 hover:bg-cyan-700 font-bold"
                      onClick={() =>
                        setExtraPicker('legbye')
                      }
                    >
                      LEG BYE
                    </button>

                  </div>

                  {[
                    'wide',
                    'noball',
                    'bye',
                    'legbye'
                  ].includes(
                    extraPicker
                  ) && (
                    <ExtraRuns
                      type={
                        extraPicker
                      }
                      onSelect={(
                        payload
                      ) => {
                        setExtraPicker(
                          null
                        );

                        playBall(
                          payload
                        );
                      }}
                    />
                  )}

                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3">

                <button
                  className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold"
                  onClick={async () => {
                    try {
                      setError('');

                      await Innings.undo(
                        inn.id
                      );

                      await loadFull();
                    } catch (e) {
                      setError(
                        e?.response?.data?.error ||
                        e?.message ||
                        'Unable to undo'
                      );
                    }
                  }}
                >
                  ↶ Undo
                </button>

                <button
                  className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold"
                  onClick={async () => {
                    try {
                      setError('');

                      await Innings.swapStrike(
                        inn.id
                      );

                      await loadFull();
                    } catch (e) {
                      setError(
                        e?.response?.data?.error ||
                        e?.message ||
                        'Unable to swap strike'
                      );
                    }
                  }}
                >
                  ⇄ Swap
                </button>

              </div>

            </>

          )}

        </div>

      </div>

      {/* SCOREBOARD BUTTON */}

      <button
        className="w-full mt-3 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
        onClick={() =>
          navigate(
            `/match/${matchId}/live`
          )
        }
      >
        📊 View Full Scoreboard
      </button>

      {/* WICKET MODAL */}

      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={
            bowlingPlayers
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

            playBall({
              runs:
                Number(
                  runsBeforeWicket || 0
                ),

              is_wicket: true,

              wicket_type:
                wicketType,

              dismissed_id:
                dismissedId,

              fielder_id:
                fielderId
            });

          }}
        />
      )}

      {boundary && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">

          <div className="text-6xl sm:text-8xl font-black animate-pulse">

            {boundary === 'six'
              ? '🚀 SIX!'
              : '🔥 FOUR!'}

          </div>

        </div>
      )}

    </div>
  );
}

/* ============================================================
   NEXT BOWLER CONTROL
   ============================================================ */

function NextBowlerControl({
  team,
  teamId,
  onPlayerCreated,
  onSelect
}) {
  const [bowler, setBowler] =
    useState(null);

  const [saving, setSaving] =
    useState(false);

  const confirm = async () => {
    if (!bowler || saving) return;

    setSaving(true);

    try {
      await onSelect(
        bowler.id
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>

      <PlayerAutocomplete
        players={team}
        value={bowler}
        onChange={setBowler}
        teamId={teamId}
        onCreated={onPlayerCreated}
        placeholder="Search or type bowler name…"
      />

      <button
        disabled={
          !bowler ||
          saving
        }
        onClick={confirm}
        className={`
          w-full
          h-14
          mt-3
          rounded-xl
          font-black
          text-lg
          transition
          ${
            !bowler || saving
              ? 'bg-slate-700 text-slate-500'
              : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white'
          }
        `}
      >
        {saving
          ? 'Starting Over…'
          : '▶ Start Next Over'}
      </button>

    </div>
  );
}

/* ============================================================
   EXTRA RUNS
   ============================================================ */

function ExtraRuns({
  type,
  onSelect
}) {
  const title = {
    wide: 'Wide Runs',
    noball: 'No Ball + Bat Runs',
    bye: 'Bye Runs',
    legbye: 'Leg Bye Runs'
  }[type];

  return (
    <div className="mt-3">

      <div className="text-xs text-slate-400 mb-2">
        {title}
      </div>

      <div className="grid grid-cols-6 gap-1">

        {[0, 1, 2, 3, 4, 6].map(
          value => (
            <button
              key={value}
              className="h-10 rounded-lg bg-slate-700 hover:bg-slate-600 font-bold"
              onClick={() => {

                if (type === 'wide') {
                  onSelect({
                    runs: 0,
                    extra_type: 'wide',
                    extra_runs:
                      Math.max(
                        1,
                        value
                      )
                  });

                  return;
                }

                if (
                  type === 'noball'
                ) {
                  onSelect({
                    runs: value,
                    extra_type: 'noball',
                    extra_runs: 1
                  });

                  return;
                }

                onSelect({
                  runs: 0,
                  extra_type: type,
                  extra_runs: value
                });

              }}
            >
              {value}
            </button>
          )
        )}

      </div>

    </div>
  );
}

/* ============================================================
   SCORE BUTTON
   ============================================================ */

function ScoreButton({
  value,
  onClick,
  big,
  type
}) {
  let classes =
    'h-14 rounded-xl font-black text-xl active:scale-95 transition ';

  if (type === 'four') {
    classes +=
      'bg-emerald-600 hover:bg-emerald-500 ';
  } else if (type === 'six') {
    classes +=
      'bg-purple-600 hover:bg-purple-500 ';
  } else {
    classes +=
      'bg-slate-700 hover:bg-slate-600 ';
  }

  if (big) {
    classes +=
      'text-2xl';
  }

  return (
    <button
      className={classes}
      onClick={onClick}
    >
      {value}
    </button>
  );
}

/* ============================================================
   MINI STAT
   ============================================================ */

function MiniStat({
  value,
  label
}) {
  return (
    <div className="min-w-0">

      <div className="font-bold text-sm">
        {value ?? 0}
      </div>

      <div className="text-[9px] text-slate-500">
        {label}
      </div>

    </div>
  );
}

/* ============================================================
   BALL DISPLAY
   ============================================================ */

function BallDisplay({ ball }) {
  let label =
    String(
      ball.runs_batsman ?? 0
    );

  let bg =
    'bg-slate-700';

  if (ball.is_wicket) {
    label = 'W';
    bg = 'bg-red-600';
  } else if (
    ball.extra_type === 'wide'
  ) {
    label = 'Wd';
    bg = 'bg-yellow-600';
  } else if (
    ball.extra_type === 'noball'
  ) {
    label = 'Nb';
    bg = 'bg-orange-600';
  } else if (
    ball.extra_type === 'bye'
  ) {
    label =
      `${ball.extra_runs || 0}B`;
    bg = 'bg-blue-600';
  } else if (
    ball.extra_type === 'legbye'
  ) {
    label =
      `${ball.extra_runs || 0}Lb`;
    bg = 'bg-cyan-700';
  } else if (
    Number(ball.runs_batsman) === 4
  ) {
    label = '4';
    bg = 'bg-emerald-600';
  } else if (
    Number(ball.runs_batsman) === 6
  ) {
    label = '6';
    bg = 'bg-purple-600';
  }

  return (
    <div
      className={`
        flex
       -shrink-0
        items-center
        justify-center
        w-10
        h-10
        rounded-full
        ${bg}
        font-black
        text-sm
      `}
    >
      {label}
    </div>
  );
}

/* ============================================================
   BATSMEN SELECTOR
   ============================================================ */

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

  const available =
    team.filter(
      p => !outIds.has(p.id)
    );

  return (
    <div className="space-y-4">

      {!hasStriker && (
        <div>

          <label className="block text-sm text-slate-400 mb-1">
            Striker
          </label>

          <PlayerAutocomplete
            players={available}
            value={striker}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              nonStriker
                ? [nonStriker.id]
                : []
            }
            placeholder="Select striker…"
          />

        </div>
      )}

      {!hasNonStriker && (
        <div>

          <label className="block text-sm text-slate-400 mb-1">
            Non-striker
          </label>

          <PlayerAutocomplete
            players={available}
            value={nonStriker}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={
              striker
                ? [striker.id]
                : []
            }
            placeholder="Select non-striker…"
          />

        </div>
      )}

      <button
        disabled={
          (!hasStriker &&
            !striker) ||
          (!hasNonStriker &&
            !nonStriker)
        }
        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 font-bold"
        onClick={() =>
          onSelect(
            striker,
            nonStriker
          )
        }
      >
        Start Innings
      </button>

    </div>
  );
}
