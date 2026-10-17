
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings, Players } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getError(err, fallback = 'Something went wrong') {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

function getPlayerId(player) {
  if (!player) return null;
  if (typeof player === 'string') return player;
  return player.id ? String(player.id) : null;
}

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);

  const [error, setError] = useState('');
  const [showWicket, setShowWicket] = useState(false);
  const [showNextBowler, setShowNextBowler] = useState(false);
  const [editingBowler, setEditingBowler] = useState(false);
  const [editingBatsman, setEditingBatsman] = useState(null);
  const [inningsBreakDismissed, setInningsBreakDismissed] = useState(false);
  const [extraPicker, setExtraPicker] = useState(null);
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [actionBusy, setActionBusy] = useState(null);
  const [optimistic, setOptimistic] = useState(null);

  const optimisticRef = useRef(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const pendingRef = useRef(0);
  const actionBusyRef = useRef(null);
  const lastSnapshotRef = useRef(null);
  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);
  const fastActionTimer = useRef(null);

  const applyServerData = useCallback((data) => {
    if (!data) return;

    setMatch(data.match);
    setPlayers(safeArray(data.players));
    setInnings(safeArray(data.innings));

    if (pendingRef.current === 0) {
      optimisticRef.current = null;
      setOptimistic(null);
    }
  }, []);

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);
      if (pendingRef.current > 0) return;
      applyServerData(data);
    } catch (err) {
      console.error('Failed to load match:', err);
    }
  }, [matchId, applyServerData]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = (data) => {
      if (pendingRef.current > 0) return;
      if (data?.match) setMatch(data.match);
      setInnings(safeArray(data?.innings));
      optimisticRef.current = null;
      setOptimistic(null);
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  useEffect(() => () => {
    clearTimeout(boundaryTimer.current);
    clearTimeout(wicketTimer.current);
    clearTimeout(fastActionTimer.current);
    queueRef.current = [];
  }, []);

  const handlePlayerCreated = useCallback((player) => {
    if (!player?.id) return;

    setPlayers((previous) => {
      if (previous.some((item) => String(item.id) === String(player.id))) {
        return previous;
      }
      return [...previous, player];
    });
  }, []);

  const popBoundary = useCallback((type) => {
    clearTimeout(boundaryTimer.current);
    setBoundary(type);
    boundaryTimer.current = setTimeout(() => setBoundary(null), 1100);
  }, []);

  const popWicket = useCallback(() => {
    clearTimeout(wicketTimer.current);
    setFlashWicket(true);
    wicketTimer.current = setTimeout(() => setFlashWicket(false), 600);
  }, []);

  const act = useCallback(async (fn, refresh = true) => {
    setError('');

    try {
      await fn();
      if (refresh) {
        window.setTimeout(() => loadFull(), 120);
      }
    } catch (err) {
      setError(getError(err));
      await loadFull();
    }
  }, [loadFull]);

  if (!match) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const currentInnings =
    innings.find((item) =>
      Number(item?.innings?.innings_number ?? item?.innings_number) ===
      Number(match?.current_innings)
    ) || innings[innings.length - 1];

  if (match.status === 'completed' && pendingCount === 0) {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">🏆 Match Completed</h1>
        <p className="text-emerald-400 text-lg font-semibold">
          {match.result_text}
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/match/${matchId}/live`)}
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  if (!currentInnings?.innings) {
    return <p className="text-slate-400">Setting up…</p>;
  }

  const inn = currentInnings.innings;
  const isSecondInningsSetup =
    Number(match.current_innings) === 2 &&
    !inn.striker_id &&
    !inn.non_striker_id &&
    !inn.current_bowler_id &&
    Number(inn.total_balls || 0) === 0 &&
    Number(inn.total_runs || 0) === 0;

  const isInningsBreak =
    match.status === 'innings-break' ||
    (isSecondInningsSetup && !inningsBreakDismissed);

  const targetValue = inn.target == null ? null : Number(inn.target);

  const displayedRuns = Number(
    optimistic?.total_runs ?? inn.total_runs ?? 0
  );
  const displayedWickets = Number(
    optimistic?.total_wickets ?? inn.total_wickets ?? 0
  );
  const displayedBalls = Number(
    optimistic?.total_balls ?? inn.total_balls ?? 0
  );
  const displayedOvers = `${Math.floor(displayedBalls / 6)}.${displayedBalls % 6}`;
  const displayRunRate = displayedBalls > 0
    ? (displayedRuns / (displayedBalls / 6)).toFixed(2)
    : '0.00';

  const runsNeeded = targetValue == null
    ? null
    : Math.max(0, targetValue - displayedRuns);

  const firstInnings = innings.find((item) =>
    Number(item?.innings?.innings_number ?? item?.innings_number) === 1
  );

  const battingCard = safeArray(currentInnings.battingCard);
  const bowlingCard = safeArray(currentInnings.bowlingCard);

  const effectiveStrikerId =
    optimistic?.strikerId ?? inn.striker_id ?? null;
  const effectiveNonStrikerId =
    optimistic?.nonStrikerId ?? inn.non_striker_id ?? null;
  const effectiveBowlerId =
    optimistic?.activeBowlerId ?? inn.current_bowler_id ?? null;

  const battingTeamPlayers = players.filter((player) =>
    String(player.team_id) === String(inn.batting_team_id) &&
    player.active !== false &&
    Number(player.active ?? 1) !== 0
  );

  const bowlingTeamPlayers = players.filter((player) =>
    String(player.team_id) === String(inn.bowling_team_id) &&
    player.active !== false &&
    Number(player.active ?? 1) !== 0
  );

  const striker = players.find((player) =>
    String(player.id) === String(effectiveStrikerId)
  );
  const nonStriker = players.find((player) =>
    String(player.id) === String(effectiveNonStrikerId)
  );
  const bowler = players.find((player) =>
    String(player.id) === String(effectiveBowlerId)
  );

  const strikerStats = battingCard.find((item) =>
    String(item.player_id) === String(effectiveStrikerId)
  ) || optimistic?.strikerStats || {};

  const nonStrikerStats = battingCard.find((item) =>
    String(item.player_id) === String(effectiveNonStrikerId)
  ) || optimistic?.nonStrikerStats || {};

  const bowlerStats = bowlingCard.find((item) =>
    String(item.player_id) === String(effectiveBowlerId)
  ) || optimistic?.bowlerStats || {
    overs: '0.0',
    maidens: 0,
    runs: 0,
    wickets: 0,
    economy: 0
  };

  const outIds = new Set(
    battingCard
      .filter((item) => item.is_out)
      .map((item) => String(item.player_id))
  );

  if (optimistic?.strikerStats?.is_out) {
    outIds.add(String(optimistic.strikerStats.player_id));
  }
  if (optimistic?.nonStrikerStats?.is_out) {
    outIds.add(String(optimistic.nonStrikerStats.player_id));
  }

  const recentBalls =
    optimistic?.recentBalls ?? safeArray(currentInnings.recentBalls);

  const overCompleted =
    displayedBalls > 0 && displayedBalls % 6 === 0;

  const displayOverNumber = Math.floor(displayedBalls / 6);

  const currentOverBalls = overCompleted
    ? []
    : recentBalls.filter((ball) =>
        Number(ball.over_number) === displayOverNumber
      );

  const needsNextBowler =
    !!optimistic?.needsNextBowler || !effectiveBowlerId;

  const partnership =
    optimistic?.partnership ??
    currentInnings.partnership ??
    { runs: 0, balls: 0 };

  const fallOfWickets =
    optimistic?.fallOfWickets ??
    currentInnings.fallOfWickets ??
    [];

  const needStriker = !effectiveStrikerId;
  const needNonStriker = !effectiveNonStrikerId;

  /*
   * Score deliveries serially. The server remains authoritative for
   * complete scorecard calculations.
   */
  const processScoreQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    let failed = false;

    while (queueRef.current.length) {
      const item = queueRef.current.shift();
      if (!item) continue;

      try {
        await Innings.ball(item.inningsId, item.payload);
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        setPendingCount(pendingRef.current);
      } catch (err) {
        failed = true;
        setError(getError(err, 'Unable to save ball'));
        queueRef.current = [];
        pendingRef.current = 0;
        setPendingCount(0);
        optimisticRef.current = null;
        setOptimistic(null);
        break;
      }
    }

    processingRef.current = false;

    if (pendingRef.current === 0) {
      try {
        const data = await Matches.get(matchId);
        applyServerData(data);
      } catch (err) {
        if (!failed) setError(getError(err, 'Unable to refresh score'));
      }
    }
  };

  const makeOptimisticBall = (payload) => {
    const base = optimisticRef.current || {
      total_runs: Number(inn.total_runs || 0),
      total_wickets: Number(inn.total_wickets || 0),
      total_balls: Number(inn.total_balls || 0),
      strikerId: inn.striker_id || null,
      nonStrikerId: inn.non_striker_id || null,
      activeBowlerId: inn.current_bowler_id || null,
      needsNextBowler: false,
      recentBalls: safeArray(currentInnings.recentBalls),
      partnership: currentInnings.partnership || { runs: 0, balls: 0 },
      fallOfWickets: safeArray(currentInnings.fallOfWickets),
      extras: currentInnings.extras || {},
      strikerStats: { ...strikerStats },
      nonStrikerStats: { ...nonStrikerStats },
      bowlerStats: { ...bowlerStats }
    };

    const runs = Number(payload.runs || 0);
    const extraRuns = Number(payload.extra_runs || 0);
    const type = payload.extra_type || null;
    const wicket = !!payload.is_wicket;

    let teamRuns = runs;
    let batterRuns = runs;
    let legal = true;
    let runForStrike = runs;

    if (type === 'wide') {
      teamRuns = Math.max(1, extraRuns || 1);
      batterRuns = 0;
      runForStrike = Math.max(0, teamRuns - 1);
      legal = false;
    } else if (type === 'noball') {
      teamRuns = Math.max(1, extraRuns || 1) + runs;
      batterRuns = runs;
      runForStrike = runs;
      legal = false;
    } else if (type === 'bye' || type === 'legbye') {
      teamRuns = Math.max(0, extraRuns);
      batterRuns = 0;
      runForStrike = teamRuns;
    } else if (type === 'penalty') {
      teamRuns = Math.max(0, extraRuns);
      batterRuns = 0;
      runForStrike = 0;
      legal = false;
    }

    const nextRuns = Number(base.total_runs || 0) + teamRuns;
    const nextWickets = Number(base.total_wickets || 0) + (wicket ? 1 : 0);
    const nextBalls = Number(base.total_balls || 0) + (legal ? 1 : 0);

    let strikerId = base.strikerId;
    let nonStrikerId = base.nonStrikerId;
    let nextStrikerStats = { ...(base.strikerStats || {}) };
    let nextNonStrikerStats = { ...(base.nonStrikerStats || {}) };

    const batterGetsRuns = !type || type === 'noball';
    const facedBall = type !== 'wide' && type !== 'noball';

    nextStrikerStats.player_id = strikerId;
    nextStrikerStats.runs =
      Number(nextStrikerStats.runs || 0) +
      (batterGetsRuns ? batterRuns : 0);
    nextStrikerStats.balls =
      Number(nextStrikerStats.balls || 0) + (facedBall ? 1 : 0);
    nextStrikerStats.fours =
      Number(nextStrikerStats.fours || 0) +
      (batterGetsRuns && batterRuns === 4 ? 1 : 0);
    nextStrikerStats.sixes =
      Number(nextStrikerStats.sixes || 0) +
      (batterGetsRuns && batterRuns === 6 ? 1 : 0);
    nextStrikerStats.strike_rate =
      nextStrikerStats.balls > 0
        ? Number((nextStrikerStats.runs / nextStrikerStats.balls * 100).toFixed(2))
        : 0;

    if (wicket && payload.dismissed_id) {
      if (String(payload.dismissed_id) === String(strikerId)) {
        nextStrikerStats.is_out = true;
        nextStrikerStats.how_out = payload.wicket_type || null;
        strikerId = null;
      } else if (String(payload.dismissed_id) === String(nonStrikerId)) {
        nextNonStrikerStats.is_out = true;
        nextNonStrikerStats.how_out = payload.wicket_type || null;
        nonStrikerId = null;
      }
    } else if (runForStrike % 2 === 1) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      [nextStrikerStats, nextNonStrikerStats] =
        [nextNonStrikerStats, nextStrikerStats];
    }

    const previousRecent = safeArray(base.recentBalls);
    const sequence = previousRecent.length
      ? Number(previousRecent[previousRecent.length - 1].ball_sequence || base.total_balls) + 1
      : Number(base.total_balls || 0) + 1;

    const ball = {
      id: `optimistic-${sequence}`,
      ball_sequence: sequence,
      over_number: Math.floor(Number(base.total_balls || 0) / 6),
      ball_in_over: Number(base.total_balls || 0) % 6 + (legal ? 1 : 0),
      batsman_id: base.strikerId,
      non_striker_id: base.nonStrikerId,
      bowler_id: base.activeBowlerId,
      runs_batsman: batterRuns,
      extra_type: type,
      extra_runs: extraRuns,
      is_wicket: wicket,
      wicket_type: payload.wicket_type || null,
      dismissed_id: payload.dismissed_id || null,
      fielder_id: payload.fielder_id || null,
      is_legal: legal ? 1 : 0
    };

    const newRecent = [...previousRecent, ball].slice(-24);
    let needsBowler = false;

    if (legal && nextBalls > 0 && nextBalls % 6 === 0) {
      if (strikerId && nonStrikerId) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
        [nextStrikerStats, nextNonStrikerStats] =
          [nextNonStrikerStats, nextStrikerStats];
      }
      needsBowler = true;
    }

    const previousExtras = { ...(base.extras || {}) };
    if (type) previousExtras[type] = Number(previousExtras[type] || 0) + extraRuns;

    return {
      ...base,
      total_runs: nextRuns,
      total_wickets: nextWickets,
      total_balls: nextBalls,
      strikerId,
      nonStrikerId,
      needsNextBowler: needsBowler,
      strikerStats: nextStrikerStats,
      nonStrikerStats: nextNonStrikerStats,
      recentBalls: newRecent,
      extras: previousExtras,
      partnership: wicket
        ? { runs: 0, balls: 0 }
        : {
            runs: Number(base.partnership?.runs || 0) + teamRuns,
            balls: Number(base.partnership?.balls || 0) +
              (legal || type === 'noball' ? 1 : 0)
          },
      fallOfWickets: wicket && payload.dismissed_id
        ? [
            ...safeArray(base.fallOfWickets),
            {
              wicket_number: nextWickets,
              player_id: payload.dismissed_id,
              score: nextRuns,
              overs: `${Math.floor(nextBalls / 6)}.${nextBalls % 6}`,
              wicket_type: payload.wicket_type || null,
              bowler_id: base.activeBowlerId || null,
              fielder_id: payload.fielder_id || null
            }
          ]
        : safeArray(base.fallOfWickets)
    };
  };

  const playBall = (payload) => {
    if (actionBusyRef.current === 'undo' || isInningsBreak) return;
    if (!effectiveBowlerId) {
      setShowNextBowler(true);
      return;
    }
    if (optimisticRef.current?.needsNextBowler) return;
    if (!effectiveStrikerId || !effectiveNonStrikerId) return;

    if (!payload.extra_type && Number(payload.runs) === 4) popBoundary('four');
    if (!payload.extra_type && Number(payload.runs) === 6) popBoundary('six');

    lastSnapshotRef.current = optimisticRef.current
      ? { ...optimisticRef.current }
      : null;

    const next = makeOptimisticBall(payload);
    optimisticRef.current = next;
    setOptimistic(next);

    queueRef.current.push({ inningsId: inn.id, payload });
    pendingRef.current += 1;
    setPendingCount(pendingRef.current);
    void processScoreQueue();
  };

  const runFastAction = (serverFn) => {
    Promise.resolve()
      .then(serverFn)
      .then(() => {
        clearTimeout(fastActionTimer.current);
        fastActionTimer.current = window.setTimeout(() => {
          if (pendingRef.current === 0) loadFull();
        }, 350);
      })
      .catch(async (err) => {
        setError(getError(err, 'Action failed'));
        await loadFull();
      });
  };

  const handleInstantSwap = () => {
    if (!inn?.id || isInningsBreak || pendingRef.current > 0) return;

    const base = optimisticRef.current || {
      strikerId: inn.striker_id,
      nonStrikerId: inn.non_striker_id,
      strikerStats: { ...strikerStats },
      nonStrikerStats: { ...nonStrikerStats }
    };

    if (!base.strikerId || !base.nonStrikerId) return;

    const next = {
      ...base,
      strikerId: base.nonStrikerId,
      nonStrikerId: base.strikerId,
      strikerStats: { ...base.nonStrikerStats },
      nonStrikerStats: { ...base.strikerStats }
    };

    optimisticRef.current = next;
    setOptimistic(next);
    runFastAction(() => Innings.swapStrike(inn.id));
  };

  const handleInstantUndo = async () => {
    if (
      !inn?.id ||
      isInningsBreak ||
      pendingRef.current > 0 ||
      actionBusyRef.current === 'undo'
    ) return;

    const selectedStriker = optimisticRef.current?.strikerId ?? inn.striker_id;
    const selectedNonStriker = optimisticRef.current?.nonStrikerId ?? inn.non_striker_id;
    const selectedBowler = optimisticRef.current?.activeBowlerId ?? inn.current_bowler_id;

    if (lastSnapshotRef.current) {
      const restored = { ...lastSnapshotRef.current };
      restored.strikerId = selectedStriker;
      restored.nonStrikerId = selectedNonStriker;
      restored.activeBowlerId = selectedBowler;
      optimisticRef.current = restored;
      setOptimistic(restored);
    }

    actionBusyRef.current = 'undo';
    setActionBusy('undo');
    setError('');

    try {
      await Innings.undo(inn.id);
      lastSnapshotRef.current = null;

      if (selectedStriker && selectedNonStriker) {
        await Innings.setBatsmen(inn.id, {
          striker_id: selectedStriker,
          non_striker_id: selectedNonStriker
        });
      }
      if (selectedBowler) {
        await Innings.setBowler(inn.id, { bowler_id: selectedBowler });
      }

      applyServerData(await Matches.get(matchId));
    } catch (err) {
      setError(getError(err, 'Unable to undo the last ball'));
      try {
        applyServerData(await Matches.get(matchId));
      } catch (_) {}
    } finally {
      actionBusyRef.current = null;
      setActionBusy(null);
    }
  };

  /*
   * Player editor operations.
   *
   * Rename preserves the player ID.
   * Switching updates only the current innings selection.
   * Historical correction is a separate, explicit operation.
   */
  const openBatsmanEditor = (role) => {
    const player = role === 'striker' ? striker : nonStriker;
    if (!player) {
      setError('No player is selected for this batting position.');
      return;
    }
    setError('');
    setEditingBatsman({ role, player });
  };

  const renamePlayer = async (player, newName) => {
    const name = String(newName || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a player name.');
    if (!player?.id) throw new Error('Player ID is missing.');

    const duplicate = players.some((item) =>
      String(item.team_id) === String(player.team_id) &&
      String(item.id) !== String(player.id) &&
      String(item.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      throw new Error('A player with this name already exists in this team.');
    }

    await Players.update(player.id, { name });
    await loadFull();
  };

  const switchBatsman = async (role, selectedId) => {
    if (!selectedId) throw new Error('Select a player first.');

    const strikerId = role === 'striker' ? selectedId : effectiveStrikerId;
    const nonStrikerId = role === 'nonStriker' ? selectedId : effectiveNonStrikerId;

    if (!strikerId || !nonStrikerId) {
      throw new Error('Both batting positions must be selected.');
    }
    if (String(strikerId) === String(nonStrikerId)) {
      throw new Error('Striker and non-striker must be different players.');
    }

    await Innings.setBatsmen(inn.id, {
      striker_id: strikerId,
      non_striker_id: nonStrikerId
    });

    optimisticRef.current = null;
    setOptimistic(null);
    await loadFull();
  };

  const correctHistoricalBatsman = async (sourcePlayer, targetId) => {
    if (!sourcePlayer?.id || !targetId) {
      throw new Error('Select both the source and replacement players.');
    }
    if (String(sourcePlayer.id) === String(targetId)) {
      throw new Error('Choose a different replacement player.');
    }

    const target = players.find((item) =>
      String(item.id) === String(targetId)
    );

    if (!target) throw new Error('Replacement player was not found.');
    if (
      String(target.team_id) !== String(inn.batting_team_id) ||
      String(sourcePlayer.team_id) !== String(inn.batting_team_id)
    ) {
      throw new Error('Both players must belong to this innings batting team.');
    }

    const confirmed = window.confirm(
      `CORRECT HISTORICAL BATTING RECORDS?\n\n` +
      `Innings: ${inn.innings_number ?? match.current_innings}\n` +
      `From: ${sourcePlayer.name}\n` +
      `To: ${target.name}\n\n` +
      `This reassigns this player's batting, non-striker and dismissal references ` +
      `in this innings. It does not change delivery scores, extras, wickets, bowlers or fielders.\n\n` +
      `This is not a rename. Continue only if these historical records were attributed to the wrong player.`
    );

    if (!confirmed) return;

    if (pendingRef.current > 0) {
      throw new Error('Wait until all deliveries finish saving before correcting history.');
    }

    await Innings.correctBatsmanHistory(inn.id, {
      from_player_id: sourcePlayer.id,
      to_player_id: targetId
    });

    optimisticRef.current = null;
    setOptimistic(null);
    setEditingBatsman(null);
    await loadFull();
  };

  const selectBatsmanForEditor = async (selectedId) => {
    if (!editingBatsman) return;
    await switchBatsman(editingBatsman.role, selectedId);
    setEditingBatsman(null);
  };

  const selectBowler = async (selected) => {
    const bowlerId = getPlayerId(selected);
    if (!bowlerId) return;

    try {
      setError('');
      const wasManualChange = editingBowler;

      await Innings.setBowler(inn.id, { bowler_id: bowlerId });

      const previous = optimisticRef.current || {};
      const next = {
        ...previous,
        activeBowlerId: bowlerId,
        needsNextBowler: false,
        ...(wasManualChange ? {} : {
          bowlerBalls: 0,
          bowlerStats: {
            player_id: bowlerId,
            overs: '0.0',
            maidens: 0,
            runs: 0,
            wickets: 0,
            economy: 0
          }
        })
      };

      optimisticRef.current = next;
      setOptimistic(next);
      setShowNextBowler(false);
      setEditingBowler(false);
      await loadFull();
    } catch (err) {
      setError(getError(err, 'Unable to select bowler'));
    }
  };

  const needStrikerOrNonStriker = needStriker || needNonStriker;

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">
      {boundary && (
        <div className="boundary-overlay">
          <div className={`boundary-text boundary-${boundary}`}>
            {boundary === 'six' ? 'SIX! 🚀' : 'FOUR! 🔥'}
          </div>
        </div>
      )}

      {isInningsBreak ? (
        <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
          <div className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
            Innings Break
          </div>
          <h1 className="text-3xl font-extrabold">
            Target: {targetValue ?? '—'}
          </h1>
          <p className="text-slate-400">
            First innings score: {firstInnings?.innings?.total_runs ?? 0}/
            {firstInnings?.innings?.total_wickets ?? 0}
            {' '}({firstInnings?.overs || '0.0'} overs)
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button
            className="btn btn-primary w-full"
            onClick={async () => {
              try {
                setError('');
                if (Number(match.current_innings) === 2) {
                  setInningsBreakDismissed(true);
                  return;
                }
                await Matches.startSecondInnings(matchId);
                setInningsBreakDismissed(true);
                await loadFull();
              } catch (err) {
                setError(getError(err, 'Unable to start second innings'));
              }
            }}
          >
            Continue →
          </button>
        </div>
      ) : (
        <>
          <div className={`card ${flashWicket ? 'wicket-flash' : ''}`}>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <div className="text-sm text-slate-400">
                  {match.team1_short} vs {match.team2_short} · {match.overs_limit} overs
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  {displayedRuns}
                  <span className="text-slate-400">/{displayedWickets}</span>
                  <span className="text-lg text-slate-400 font-medium">
                    {' '}({displayedOvers} ov)
                  </span>
                </div>
              </div>
              <div className="text-right text-sm text-slate-400">
                <div>RR: {displayRunRate}</div>
                {targetValue != null && <div>Target: {targetValue}</div>}
                {runsNeeded != null && (
                  <div>
                    Need: {runsNeeded} runs |{' '}
                    {Math.max(0, Number(match.overs_limit || 0) * 6 - displayedBalls)} balls left
                  </div>
                )}
                {pendingCount > 0 && (
                  <div className="text-emerald-400 text-xs mt-1 font-medium">
                    Saving {pendingCount}…
                  </div>
                )}
              </div>
            </div>

            {needStrikerOrNonStriker ? (
              <SelectBatsmen
                team={battingTeamPlayers}
                outIds={outIds}
                teamId={inn.batting_team_id}
                onPlayerCreated={handlePlayerCreated}
                hasStriker={!needStriker}
                hasNonStriker={!needNonStriker}
                onSelect={async (selectedStriker, selectedNonStriker) => {
                  try {
                    await Innings.setBatsmen(inn.id, {
                      striker_id: selectedStriker || effectiveStrikerId,
                      non_striker_id: selectedNonStriker || effectiveNonStrikerId
                    });
                    await loadFull();
                  } catch (err) {
                    setError(getError(err, 'Unable to select batsmen'));
                  }
                }}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <BatsmanCard
                  player={striker}
                  stats={strikerStats}
                  striker
                  onEdit={() => openBatsmanEditor('striker')}
                />
                <BatsmanCard
                  player={nonStriker}
                  stats={nonStrikerStats}
                  onEdit={() => openBatsmanEditor('nonStriker')}
                />
              </div>
            )}

            <div className="mt-3 bg-slate-900/70 rounded-xl p-3 border border-slate-700">
              <div className="flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-white">
                      🎯 {bowler?.name || 'Select bowler'}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                      onClick={() => {
                        setEditingBowler(true);
                        setShowNextBowler(true);
                      }}
                    >
                      Edit / Switch
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {needsNextBowler ? 'BOWLER REQUIRED' : 'CURRENT BOWLER'}
                  </div>
                </div>
                {!needsNextBowler && (
                  <div className="grid grid-cols-5 gap-3 text-center">
                    <BowlingStat value={bowlerStats.overs ?? '0.0'} label="Overs" />
                    <BowlingStat value={bowlerStats.maidens ?? 0} label="M" />
                    <BowlingStat value={bowlerStats.runs ?? 0} label="Runs" />
                    <BowlingStat value={bowlerStats.wickets ?? 0} label="W" />
                    <BowlingStat value={bowlerStats.economy ?? 0} label="Econ" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 bg-slate-900/70 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-slate-300">Current Over</h3>
                <span className="text-xs text-slate-500">Over {displayOverNumber + 1}</span>
              </div>
              {currentOverBalls.length === 0 ? (
                <div className="text-xs text-slate-500">No balls yet</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {currentOverBalls.map((ball, index) => (
                    <BallDisplay key={ball.id || `${ball.ball_sequence}-${index}`} ball={ball} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          {!needStrikerOrNonStriker && !needsNextBowler && (
            <>
              <div className="card !p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-300">Score Runs</h3>
                    <div className="text-[10px] text-slate-500 mt-0.5">Quick scoring</div>
                  </div>
                  <div className="text-xs text-slate-500">{displayedBalls % 6}/6</div>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {[0, 1, 2, 3, 4, 6].map((runs) => (
                    <button
                      key={runs}
                      className={`h-11 rounded-xl font-bold text-base active:scale-95 transition-transform ${
                        runs === 4
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : runs === 6
                            ? 'bg-purple-600 hover:bg-purple-500'
                            : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      disabled={pendingCount > 10}
                      onClick={() => playBall({ runs, extra_type: null })}
                    >
                      {runs}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <button
                    className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm"
                    disabled={pendingCount > 0}
                    onClick={() => setShowWicket(true)}
                  >
                    OUT
                  </button>
                </div>
              </div>

              <div className="card">
                <h3 className="font-semibold mb-2 text-sm text-slate-400">Extras</h3>
                {!extraPicker ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ['wide', 'Wide'],
                      ['noball', 'No Ball'],
                      ['bye', 'Bye'],
                      ['legbye', 'Leg Bye']
                    ].map(([type, label]) => (
                      <button
                        key={type}
                        className="btn btn-secondary text-sm"
                        onClick={() => setExtraPicker(type)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-300">
                        {extraPicker === 'wide' && 'Wide — extra runs'}
                        {extraPicker === 'noball' && 'No Ball — runs off bat'}
                        {extraPicker === 'bye' && 'Bye — runs'}
                        {extraPicker === 'legbye' && 'Leg Bye — runs'}
                      </span>
                      <button
                        className="text-xs text-slate-400 hover:text-white"
                        onClick={() => setExtraPicker(null)}
                      >
                        ✕ Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {[0, 1, 2, 3, 4, 6].map((runs) => (
                        <button
                          key={runs}
                          className="run-btn bg-slate-700 hover:bg-slate-600 active:scale-95 transition-transform !text-base !py-3"
                          onClick={() => {
                            const type = extraPicker;
                            setExtraPicker(null);

                            if (type === 'wide') {
                              playBall({ extra_type: type, extra_runs: 1 + runs });
                            } else if (type === 'noball') {
                              playBall({ extra_type: type, extra_runs: 1, runs });
                            } else {
                              playBall({ extra_type: type, extra_runs: Math.max(runs, 1) });
                            }
                          }}
                        >
                          {runs}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={pendingCount > 0 || actionBusy === 'undo'}
                  onClick={handleInstantUndo}
                >
                  ↺ Undo
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={pendingCount > 0}
                  onClick={handleInstantSwap}
                >
                  ⇄ Swap Batsmen
                </button>
              </div>
            </>
          )}

          <div className="mt-2 bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">
                  Current Partnership
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {partnership.runs || 0}
                  <span className="text-xs text-slate-400 font-normal"> runs</span>
                  {' · '}
                  {partnership.balls || 0}
                  <span className="text-xs text-slate-400 font-normal"> balls</span>
                </div>
              </div>
              <div className="text-xl">🤝</div>
            </div>
          </div>

          <FallOfWickets wickets={fallOfWickets} players={players} />

          <button
            className="btn btn-secondary w-full"
            onClick={() => navigate(`/match/${matchId}/live`)}
          >
            View Full Scoreboard
          </button>
        </>
      )}

      {showNextBowler && (
        <NextBowlerModal
          team={bowlingTeamPlayers}
          teamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
          error={error}
          initialBowler={bowler}
          isInitial={!effectiveBowlerId && displayedBalls === 0}
          isEditing={editingBowler}
          onCancel={() => {
            if (!effectiveBowlerId || needsNextBowler) return;
            setShowNextBowler(false);
            setEditingBowler(false);
            setError('');
          }}
          onSelect={selectBowler}
        />
      )}

      {showWicket && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingTeamPlayers}
          fieldingTeamId={inn.bowling_team_id}
          onPlayerCreated={handlePlayerCreated}
          onClose={() => setShowWicket(false)}
          onConfirm={({ wicketType, dismissedId, fielderId, runsBeforeWicket }) => {
            setShowWicket(false);
            popWicket();
            playBall({
              runs: wicketType === 'run-out' ? Number(runsBeforeWicket || 0) : 0,
              is_wicket: true,
              wicket_type: wicketType,
              dismissed_id: getPlayerId(dismissedId),
              fielder_id: getPlayerId(fielderId)
            });
          }}
        />
      )}

      {editingBatsman && (
        <PlayerEditorModal
          key={`${editingBatsman.role}-${editingBatsman.player.id}`}
          player={editingBatsman.player}
          role={editingBatsman.role}
          team={battingTeamPlayers}
          teamId={inn.batting_team_id}
          onPlayerCreated={handlePlayerCreated}
          onClose={() => setEditingBatsman(null)}
          onRename={renamePlayer}
          onSwitch={selectBatsmanForEditor}
          onCorrectHistory={correctHistoricalBatsman}
          error={error}
          busy={pendingCount > 0}
        />
      )}
    </div>
  );
}

function PlayerEditorModal({
  player,
  role,
  team,
  teamId,
  onPlayerCreated,
  onClose,
  onRename,
  onSwitch,
  onCorrectHistory,
  error,
  busy
}) {
  const [name, setName] = useState(player?.name || '');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('rename');
  const [localError, setLocalError] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async (fn) => {
    setLocalError('');
    setSaving(true);
    try {
      await fn();
      onClose();
    } catch (err) {
      setLocalError(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const isBusy = saving || busy;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close player editor"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-indigo-400">
              {role === 'striker' ? 'Striker' : 'Non-striker'}
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Edit {player?.name || 'Player'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Rename, switch the current player, or correct historical records.
            </p>
          </div>
          <button className="text-slate-400 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['rename', '✏️ Rename'],
            ['switch', '🔄 Switch'],
            ['history', '🧾 History']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                mode === value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
              onClick={() => {
                setMode(value);
                setLocalError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'rename' && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => onRename(player, name));
            }}
          >
            <label className="block">
              <span className="text-sm text-slate-300">Player name</span>
              <input
                className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-white"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <p className="text-xs text-slate-400">
              Renaming keeps this player's existing ID and statistics.
              Names are checked without case sensitivity within the team.
            </p>
            <button className="btn btn-primary w-full" disabled={isBusy}>
              {saving ? 'Saving…' : 'Save Name'}
            </button>
          </form>
        )}

        {mode === 'switch' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Select a different existing player for this current batting position.
              This does not move this player's previous runs to the selected player.
            </p>
            <PlayerAutocomplete
              players={team}
              value={selectedId}
              onChange={setSelectedId}
              teamId={teamId}
              onCreated={onPlayerCreated}
              excludeIds={[player.id]}
              placeholder="Type or select existing player…"
            />
            <button
              className="btn btn-primary w-full"
              disabled={isBusy || !selectedId}
              onClick={() => void run(() => onSwitch(selectedId))}
            >
              {saving ? 'Switching…' : 'Switch Current Player'}
            </button>
          </div>
        )}

        {mode === 'history' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="font-semibold text-amber-300 text-sm">
                ⚠️ Historical correction
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Use only when deliveries in this innings were incorrectly credited to
                this player. This is different from renaming or switching the current batter.
              </p>
            </div>
            <label className="block">
              <span className="text-sm text-slate-300">Replace {player?.name} with</span>
              <div className="mt-1">
                <PlayerAutocomplete
                  players={team}
                  value={selectedId}
                  onChange={setSelectedId}
                  teamId={teamId}
                  onCreated={onPlayerCreated}
                  excludeIds={[player.id]}
                  placeholder="Select the correct player…"
                />
              </div>
            </label>
            <p className="text-xs text-slate-400">
              The confirmation will identify the innings and both players. The server
              must complete the correction successfully before the scorecard refreshes.
            </p>
            <button
              className="w-full rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-3 disabled:opacity-50"
              disabled={isBusy || !selectedId}
              onClick={() => void run(() => onCorrectHistory(player, selectedId))}
            >
              {saving ? 'Correcting…' : 'Confirm Historical Correction'}
            </button>
          </div>
        )}

        {(localError || error) && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {localError || error}
          </div>
        )}
      </div>
    </div>
  );
}

function NextBowlerModal({
  team,
  teamId,
  onPlayerCreated,
  onSelect,
  error,
  isInitial = false,
  initialBowler = null,
  isEditing = false,
  onCancel
}) {
  const [bowler, setBowler] = useState(
    initialBowler?.id ? String(initialBowler.id) : null
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close bowler selection"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                {isInitial ? 'Match Start' : isEditing ? 'Manual Change' : 'Over Complete'}
              </div>
              <h2 className="text-2xl font-extrabold text-white mt-1">
                🎯 {isInitial ? 'Select Bowler' : isEditing ? 'Change Bowler' : 'Select Next Bowler'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {isInitial
                  ? 'Choose the bowler for the first over.'
                  : isEditing
                    ? 'Choose the bowler for the current innings.'
                    : 'Choose the bowler for the new over.'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
              🏏
            </div>
          </div>
        </div>

        <div className="p-5">
          <PlayerAutocomplete
            players={team}
            value={bowler}
            onChange={setBowler}
            teamId={teamId}
            onCreated={onPlayerCreated}
            placeholder="Type or select bowler…"
          />

          {error && <ErrorBox>{error}</ErrorBox>}

          <button
            className="btn btn-primary w-full h-12 text-base font-bold mt-4"
            disabled={!bowler}
            onClick={() => onSelect(bowler)}
          >
            {isInitial ? 'Start Innings →' : 'Confirm Bowler →'}
          </button>

          {!isInitial && (
            <button
              type="button"
              className="btn btn-secondary w-full mt-2"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectBatsmen({
  team,
  outIds,
  hasStriker,
  hasNonStriker,
  teamId,
  onPlayerCreated,
  onSelect
}) {
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);

  const available = safeArray(team).filter(
    (player) => !outIds.has(String(player.id))
  );

  const strikerId = getPlayerId(striker);
  const nonStrikerId = getPlayerId(nonStriker);

  return (
    <div className="card space-y-4 mt-3 fade-in">
      <div>
        <h2 className="text-xl font-bold">
          {hasStriker || hasNonStriker ? 'Select New Batsman' : 'Select Batsmen'}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Choose the player or players to continue the innings.
        </p>
      </div>

      {!hasStriker && (
        <label className="block">
          <span className="text-sm text-slate-400 mb-1 block">On strike</span>
          <PlayerAutocomplete
            players={available}
            value={strikerId}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={nonStrikerId ? [nonStrikerId] : []}
            placeholder="Type or add striker's name…"
          />
        </label>
      )}

      {!hasNonStriker && (
        <label className="block">
          <span className="text-sm text-slate-400 mb-1 block">Non-striker</span>
          <PlayerAutocomplete
            players={available}
            value={nonStrikerId}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={strikerId ? [strikerId] : []}
            placeholder="Type or add non-striker's name…"
          />
        </label>
      )}

      <button
        className="btn btn-primary w-full"
        disabled={
          (!hasStriker && !strikerId) ||
          (!hasNonStriker && !nonStrikerId) ||
          (strikerId && nonStrikerId && String(strikerId) === String(nonStrikerId))
        }
        onClick={() => onSelect(strikerId, nonStrikerId)}
      >
        Confirm
      </button>
    </div>
  );
}

function BatsmanCard({ player, stats, striker = false, onEdit }) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
      <div className="flex justify-between items-center gap-2">
        <div className="font-semibold text-white min-w-0 break-words">
          🏏 {player?.name || '—'}
          {striker && <span className="text-emerald-400 ml-1">●</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-xs text-slate-400">
            {striker ? 'STRIKER' : 'NON-STRIKER'}
          </div>
          <button
            type="button"
            className="text-xs text-indigo-400 hover:text-indigo-300"
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <Stat value={stats?.runs ?? 0} label="Runs" large />
        <Stat value={stats?.balls ?? 0} label="Balls" />
        <Stat value={stats?.fours ?? 0} label="4s" />
        <Stat value={stats?.sixes ?? 0} label="6s" />
        <Stat value={stats?.strike_rate ?? 0} label="SR" />
      </div>
    </div>
  );
}

function FallOfWickets({ wickets, players }) {
  if (!wickets?.length) return null;

  return (
    <div className="mt-3 bg-slate-900/70 rounded-xl p-3 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Fall of Wickets</div>
          <div className="text-sm font-semibold text-white mt-1">Wicket timeline</div>
        </div>
        <div className="text-xl">📉</div>
      </div>
      <div className="space-y-2">
        {wickets.map((item, index) => {
          const player = players.find(
            (person) => String(person.id) === String(item.player_id)
          );
          return (
            <div
              key={item.id || `${item.wicket_number}-${item.player_id}-${index}`}
              className="flex items-center justify-between bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 text-red-300 flex items-center justify-center text-xs font-bold">
                  {item.wicket_number}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {player?.name || 'Batsman'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {item.wicket_type || 'Wicket'}
                    {item.overs != null ? ` · ${item.overs} ov` : ''}
                  </div>
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="text-base font-extrabold text-white">{item.score}</div>
                <div className="text-[10px] text-slate-500">TEAM SCORE</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ value, label, large = false }) {
  return (
    <div>
      <div className={large ? 'text-xl font-bold text-white' : 'text-lg font-semibold'}>
        {value}
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function BowlingStat({ value, label }) {
  return (
    <div>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function BallDisplay({ ball }) {
  let label = String(ball.runs_batsman ?? 0);
  let className = 'bg-slate-700';

  if (ball.is_wicket) {
    label = 'W';
    className = 'bg-red-600';
  } else if (ball.extra_type === 'wide') {
    label = `Wd${Number(ball.extra_runs || 1) > 1 ? `+${Number(ball.extra_runs) - 1}` : ''}`;
    className = 'bg-yellow-600';
  } else if (ball.extra_type === 'noball') {
    label = `Nb${ball.runs_batsman ? `+${ball.runs_batsman}` : ''}`;
    className = 'bg-orange-600';
  } else if (ball.extra_type === 'bye') {
    label = `${ball.extra_runs}B`;
    className = 'bg-blue-600';
  } else if (ball.extra_type === 'legbye') {
    label = `${ball.extra_runs}Lb`;
    className = 'bg-blue-800';
  } else if (Number(ball.runs_batsman) === 4) {
    label = '4';
    className = 'bg-emerald-600';
  } else if (Number(ball.runs_batsman) === 6) {
    label = '6';
    className = 'bg-purple-600';
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`w-10 h-10 flex items-center justify-center rounded-full text-xs font-bold ${className}`}>
        {label}
      </span>
      <span className="text-[10px] text-slate-500">
        {ball.is_legal ? 'legal' : 'extra'}
      </span>
    </div>
  );
}

function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm mt-3">
      {children}
    </div>
  );
}
