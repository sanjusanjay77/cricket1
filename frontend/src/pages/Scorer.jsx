
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Matches, Innings, Players } from '../api/api.js';
import WicketModal from '../components/WicketModal.jsx';
import PlayerAutocomplete from '../components/PlayerAutocomplete.jsx';
import socket from '../socket.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sameId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return String(a) === String(b);
}

function normalizePlayerName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function uniquePlayersByName(value) {
  const seenIds = new Set();
  const seenNames = new Set();
  const result = [];

  for (const player of safeArray(value)) {
    if (!player || player.id == null) continue;

    const id = String(player.id);
    const name = normalizePlayerName(player.name);

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    if (name && seenNames.has(name)) continue;
    if (name) seenNames.add(name);

    result.push(player);
  }

  return result;
}

function findByPlayerId(list, id) {
  if (id == null) return undefined;
  return safeArray(list).find(item => sameId(item?.player_id, id));
}

function getOversAsBalls(oversValue) {
  const parts = String(oversValue || '0.0').split('.');
  const completedOvers = Math.max(0, Number(parts[0]) || 0);
  const ballsInOver = Math.max(0, Math.min(5, Number(parts[1]) || 0));
  return completedOvers * 6 + ballsInOver;
}

function emptyBattingStats(id) {
  return {
    player_id: id,
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
}

function emptyBowlingStats(id) {
  return {
    player_id: id,
    overs: '0.0',
    maidens: 0,
    runs: 0,
    wickets: 0,
    economy: 0
  };
}

export default function Scorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [innings, setInnings] = useState([]);

  const [showWicket, setShowWicket] = useState(false);
  const [error, setError] = useState('');
  const [editingBatsman, setEditingBatsman] = useState(null);
  const [savingBatsmanIdentity, setSavingBatsmanIdentity] = useState(false);
  const [boundary, setBoundary] = useState(null);
  const [extraPicker, setExtraPicker] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);

  const [showNextBowler, setShowNextBowler] = useState(false);
  const [editingBowler, setEditingBowler] = useState(false);
  const [inningsBreakDismissed, setInningsBreakDismissed] = useState(false);

  const [optimistic, setOptimistic] = useState(null);
  const optimisticRef = useRef(null);

  const scoreQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const pendingCountRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  const [actionBusy, setActionBusy] = useState(null);
  const actionBusyRef = useRef(null);

  const lastActionSnapshotRef = useRef(null);
  const fastActionTimerRef = useRef(null);
  const boundaryTimer = useRef(null);
  const wicketTimer = useRef(null);

  /*
   * SERVER DATA
   */

  const applyServerData = useCallback(data => {
    if (!data) return;

    setMatch(data.match);
    setPlayers(safeArray(data.players));
    setInnings(safeArray(data.innings));

    if (pendingCountRef.current === 0) {
      optimisticRef.current = null;
      setOptimistic(null);
    }
  }, []);

  const loadFull = useCallback(async () => {
    try {
      const data = await Matches.get(matchId);

      if (pendingCountRef.current > 0) return;

      applyServerData(data);
    } catch (err) {
      console.error('Failed to load match:', err);
    }
  }, [matchId, applyServerData]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  /*
   * SOCKET
   */

  useEffect(() => {
    socket.emit('join-match', matchId);

    const onUpdate = ({ match: updatedMatch, innings: updatedInnings }) => {
      if (pendingCountRef.current > 0) return;

      setMatch(updatedMatch);
      setInnings(safeArray(updatedInnings));
      optimisticRef.current = null;
      setOptimistic(null);
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', matchId);
      socket.off('score-update', onUpdate);
    };
  }, [matchId]);

  /*
   * CLEANUP
   */

  useEffect(() => {
    return () => {
      clearTimeout(boundaryTimer.current);
      clearTimeout(wicketTimer.current);
      clearTimeout(fastActionTimerRef.current);
      scoreQueueRef.current = [];
      processingQueueRef.current = false;
    };
  }, []);

  /*
   * PLAYER CREATED
   *
   * Deduplicate by ID first, then by team + normalized name.
   */

  const handlePlayerCreated = useCallback(player => {
  if (!player) return;

  // Support common API response shapes.
  const normalizedPlayer =
    player.player ??
    player.data?.player ??
    player.data ??
    player;

  if (normalizedPlayer.id == null) {
    console.error('Created player response has no ID:', player);
    setError('Player was created, but the server did not return a player ID.');
    return;
  }

  const newPlayer = {
    ...normalizedPlayer,
    id: normalizedPlayer.id,
    team_id: normalizedPlayer.team_id ?? normalizedPlayer.teamId,
    active: true
  };

  setPlayers(previous => {
    const existingIndex = previous.findIndex(existing =>
      sameId(existing.id, newPlayer.id)
    );

    if (existingIndex !== -1) {
      return previous.map((existing, index) =>
        index === existingIndex
          ? { ...existing, ...newPlayer }
          : existing
      );
    }

    // Keep a re-created player visible even if an old entry
    // with the same name exists in local state.
    const withoutSameName = previous.filter(existing =>
      !(
        sameId(existing.team_id, newPlayer.team_id) &&
        normalizePlayerName(existing.name) ===
          normalizePlayerName(newPlayer.name)
      )
    );

    return [...withoutSameName, newPlayer];
  });
}, []);

  /*
   * VISUAL EFFECTS
   */

  const popBoundary = useCallback(type => {
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
   * GENERIC ACTION
   */

  const act = useCallback((fn, options = {}) => {
    setError('');

    Promise.resolve()
      .then(fn)
      .then(() => {
        if (options.refresh !== false) {
          window.setTimeout(loadFull, 120);
        }
      })
      .catch(async err => {
        setError(
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Something went wrong'
        );
        await loadFull();
      });
  }, [loadFull]);

  const getPlayerId = player => {
    if (player == null) return null;
    if (typeof player === 'string' || typeof player === 'number') return player;
    if (typeof player === 'object') return player.id ?? null;
    return null;
  };

  /*
   * BASE OPTIMISTIC STATE
   */

  const createBaseOptimisticState = sourceInnings => {
    const current = sourceInnings?.innings;
    if (!current) return null;

    const battingCard = safeArray(sourceInnings.battingCard);
    const bowlingCard = safeArray(sourceInnings.bowlingCard);

    const strikerStats =
      findByPlayerId(battingCard, current.striker_id) ||
      emptyBattingStats(current.striker_id);

    const nonStrikerStats =
      findByPlayerId(battingCard, current.non_striker_id) ||
      emptyBattingStats(current.non_striker_id);

    const bowlerStats =
      findByPlayerId(bowlingCard, current.current_bowler_id) ||
      emptyBowlingStats(current.current_bowler_id);

    const totalRuns = Number(current.total_runs || 0);
    const totalBalls = Number(current.total_balls || 0);

    return {
      total_runs: totalRuns,
      total_wickets: Number(current.total_wickets || 0),
      total_balls: totalBalls,
      strikerId: current.striker_id ?? null,
      nonStrikerId: current.non_striker_id ?? null,
      activeBowlerId: current.current_bowler_id ?? null,
      needsNextBowler: false,
      bowlerStats: { ...bowlerStats },
      bowlerBalls: getOversAsBalls(bowlerStats.overs),
      strikerStats: { ...strikerStats },
      nonStrikerStats: { ...nonStrikerStats },
      recentBalls: safeArray(sourceInnings.recentBalls).slice(-24),
      extras: sourceInnings.extras || {
        wide: Number(current.extras_wide || 0),
        noball: Number(current.extras_noball || 0),
        bye: Number(current.extras_bye || 0),
        legbye: Number(current.extras_legbye || 0),
        penalty: Number(current.extras_penalty || 0)
      },
      partnership: sourceInnings.partnership || { runs: 0, balls: 0 },
      fallOfWickets: safeArray(sourceInnings.fallOfWickets),
      runRate: totalBalls > 0
        ? Number((totalRuns / (totalBalls / 6)).toFixed(2))
        : 0
    };
  };

  const cloneOptimisticState = value => {
    if (!value) return null;

    return {
      ...value,
      bowlerStats: value.bowlerStats ? { ...value.bowlerStats } : value.bowlerStats,
      strikerStats: value.strikerStats ? { ...value.strikerStats } : value.strikerStats,
      nonStrikerStats: value.nonStrikerStats ? { ...value.nonStrikerStats } : value.nonStrikerStats,
      recentBalls: safeArray(value.recentBalls).map(ball => ({ ...ball })),
      extras: value.extras ? { ...value.extras } : value.extras,
      partnership: value.partnership ? { ...value.partnership } : value.partnership,
      fallOfWickets: safeArray(value.fallOfWickets).map(item => ({ ...item }))
    };
  };

  /*
   * OPTIMISTIC BALL BUILDER
   */

  const buildOptimisticBall = ({
    current,
    currentInnings,
    payload,
    previousOptimistic
  }) => {
    let strikerId = previousOptimistic?.strikerId ?? current.striker_id;
    let nonStrikerId = previousOptimistic?.nonStrikerId ?? current.non_striker_id;

    const scoringBowlerId =
      previousOptimistic?.activeBowlerId ?? current.current_bowler_id;

    const runs = Number(payload.runs || 0);
    const inputExtraRuns = Number(payload.extra_runs || 0);

    let teamRuns = 0;
    let batsmanRuns = 0;
    let runsRun = 0;
    let legal = true;

    switch (payload.extra_type) {
      case 'wide':
        teamRuns = Math.max(1, inputExtraRuns || 1);
        runsRun = Math.max(0, teamRuns - 1);
        legal = false;
        break;

      case 'noball':
        teamRuns = Math.max(1, inputExtraRuns || 1) + runs;
        batsmanRuns = runs;
        runsRun = runs;
        legal = false;
        break;

      case 'bye':
      case 'legbye':
        teamRuns = Math.max(0, inputExtraRuns);
        runsRun = teamRuns;
        break;

      case 'penalty':
        teamRuns = Math.max(0, inputExtraRuns);
        legal = false;
        break;

      default:
        teamRuns = runs;
        batsmanRuns = runs;
        runsRun = runs;
        break;
    }

    const wicket = Boolean(payload.is_wicket);

    const previousRuns =
      previousOptimistic?.total_runs ?? Number(current.total_runs || 0);
    const previousWickets =
      previousOptimistic?.total_wickets ?? Number(current.total_wickets || 0);
    const previousBalls =
      previousOptimistic?.total_balls ?? Number(current.total_balls || 0);

    const newTotalRuns = previousRuns + teamRuns;
    const newTotalWickets = previousWickets + (wicket ? 1 : 0);
    const newTotalBalls = previousBalls + (legal ? 1 : 0);

    /*
     * BATSMAN STATS
     */

    const battingCard = safeArray(currentInnings.battingCard);

    const serverStrikerStats =
      findByPlayerId(battingCard, strikerId) || emptyBattingStats(strikerId);

    // FIX: the non-striker lookup must use nonStrikerId, not strikerId.
    const serverNonStrikerStats =
      findByPlayerId(battingCard, nonStrikerId) || emptyBattingStats(nonStrikerId);

    const previousStrikerStats =
      previousOptimistic?.strikerStats &&
      sameId(previousOptimistic.strikerStats.player_id, strikerId)
        ? previousOptimistic.strikerStats
        : serverStrikerStats;

    const previousNonStrikerStats =
      previousOptimistic?.nonStrikerStats &&
      sameId(previousOptimistic.nonStrikerStats.player_id, nonStrikerId)
        ? previousOptimistic.nonStrikerStats
        : serverNonStrikerStats;

    const strikerBallsAdded =
      payload.extra_type === 'wide' || payload.extra_type === 'noball' ? 0 : 1;

    const batterGetsRuns =
      !payload.extra_type || payload.extra_type === 'noball';

    const newStrikerRuns =
      Number(previousStrikerStats.runs || 0) +
      (batterGetsRuns ? batsmanRuns : 0);

    const newStrikerBalls =
      Number(previousStrikerStats.balls || 0) + strikerBallsAdded;

    const newStrikerFours =
      Number(previousStrikerStats.fours || 0) +
      (batterGetsRuns && batsmanRuns === 4 ? 1 : 0);

    const newStrikerSixes =
      Number(previousStrikerStats.sixes || 0) +
      (batterGetsRuns && batsmanRuns === 6 ? 1 : 0);

    const updatedStrikerStats = {
      ...previousStrikerStats,
      player_id: strikerId,
      runs: newStrikerRuns,
      balls: newStrikerBalls,
      fours: newStrikerFours,
      sixes: newStrikerSixes,
      strike_rate: newStrikerBalls > 0
        ? Number(((newStrikerRuns / newStrikerBalls) * 100).toFixed(2))
        : 0
    };

    const updatedNonStrikerStats = {
      ...previousNonStrikerStats,
      player_id: nonStrikerId
    };

    /*
     * WICKET / STRIKE ROTATION
     */

    if (wicket && payload.dismissed_id != null) {
      if (sameId(payload.dismissed_id, strikerId)) {
        updatedStrikerStats.is_out = true;
        updatedStrikerStats.how_out = payload.wicket_type || null;
        updatedStrikerStats.dismissed_by = scoringBowlerId || null;
        updatedStrikerStats.fielder_id = payload.fielder_id || null;
        strikerId = null;
      } else if (sameId(payload.dismissed_id, nonStrikerId)) {
        updatedNonStrikerStats.is_out = true;
        updatedNonStrikerStats.how_out = payload.wicket_type || null;
        updatedNonStrikerStats.dismissed_by = scoringBowlerId || null;
        updatedNonStrikerStats.fielder_id = payload.fielder_id || null;
        nonStrikerId = null;
      }
    } else if (runsRun % 2 === 1) {
      const oldStrikerId = strikerId;
      const oldStrikerStats = { ...updatedStrikerStats };

      strikerId = nonStrikerId;
      nonStrikerId = oldStrikerId;

      Object.assign(updatedStrikerStats, updatedNonStrikerStats);
      Object.assign(updatedNonStrikerStats, oldStrikerStats);

      updatedStrikerStats.player_id = strikerId;
      updatedNonStrikerStats.player_id = nonStrikerId;
    }

    /*
     * BOWLER STATS
     */

    const bowlingCard = safeArray(currentInnings.bowlingCard);

    const serverBowlerStats =
      findByPlayerId(bowlingCard, scoringBowlerId) ||
      emptyBowlingStats(scoringBowlerId);

    const previousBowlerStats =
      previousOptimistic?.bowlerStats &&
      sameId(previousOptimistic.bowlerStats.player_id, scoringBowlerId)
        ? previousOptimistic.bowlerStats
        : serverBowlerStats;

    const previousBowlerBalls =
      previousOptimistic?.bowlerStats &&
      sameId(previousOptimistic.bowlerStats.player_id, scoringBowlerId) &&
      previousOptimistic.bowlerBalls !== undefined
        ? previousOptimistic.bowlerBalls
        : getOversAsBalls(previousBowlerStats.overs);

    const newBowlerBalls = previousBowlerBalls + (legal ? 1 : 0);

    let bowlerRunsAdded = 0;

    if (payload.extra_type === 'wide') {
      bowlerRunsAdded = Math.max(1, inputExtraRuns || 1);
    } else if (payload.extra_type === 'noball') {
      bowlerRunsAdded = Math.max(1, inputExtraRuns || 1) + batsmanRuns;
    } else if (
      payload.extra_type === 'bye' ||
      payload.extra_type === 'legbye' ||
      payload.extra_type === 'penalty'
    ) {
      bowlerRunsAdded = 0;
    } else {
      bowlerRunsAdded = batsmanRuns;
    }

    const newBowlerRuns =
      Number(previousBowlerStats.runs || 0) + bowlerRunsAdded;

    const bowlerGetsWicket =
      wicket && payload.wicket_type !== 'run-out';

    const newBowlerWickets =
      Number(previousBowlerStats.wickets || 0) + (bowlerGetsWicket ? 1 : 0);

    const bowlerOvers =
      `${Math.floor(newBowlerBalls / 6)}.${newBowlerBalls % 6}`;

    let newMaidens = Number(previousBowlerStats.maidens || 0);

    const overJustCompleted =
      legal && newTotalBalls > previousBalls && newTotalBalls % 6 === 0;

    if (overJustCompleted) {
      const previousRecentBalls =
        previousOptimistic?.recentBalls ?? safeArray(currentInnings.recentBalls);

      const completedOverNumber = Math.floor(previousBalls / 6);

      const ballsForCompletedOver = previousRecentBalls.filter(ball =>
        Number(ball.over_number) === completedOverNumber &&
        sameId(ball.bowler_id, scoringBowlerId)
      );

      let overRuns = bowlerRunsAdded;

      for (const ball of ballsForCompletedOver) {
        const extraType = ball.extra_type;

        if (
          extraType === 'bye' ||
          extraType === 'legbye' ||
          extraType === 'penalty'
        ) {
          continue;
        }

        if (extraType === 'wide') {
          overRuns += Math.max(1, Number(ball.extra_runs || 1));
        } else if (extraType === 'noball') {
          overRuns +=
            Math.max(1, Number(ball.extra_runs || 1)) +
            Number(ball.runs_batsman || 0);
        } else {
          overRuns += Number(ball.runs_batsman || 0);
        }
      }

      if (overRuns === 0) newMaidens += 1;
    }

    const updatedBowlerStats = {
      ...previousBowlerStats,
      player_id: scoringBowlerId,
      overs: bowlerOvers,
      maidens: newMaidens,
      runs: newBowlerRuns,
      wickets: newBowlerWickets,
      economy: newBowlerBalls > 0
        ? Number((newBowlerRuns / (newBowlerBalls / 6)).toFixed(2))
        : 0
    };

    /*
     * END OF OVER
     */

    let needsNextBowler = Boolean(previousOptimistic?.needsNextBowler);

    if (overJustCompleted) {
      if (strikerId && nonStrikerId) {
        const oldStrikerId = strikerId;
        const oldStrikerStats = { ...updatedStrikerStats };

        strikerId = nonStrikerId;
        nonStrikerId = oldStrikerId;

        Object.assign(updatedStrikerStats, updatedNonStrikerStats);
        Object.assign(updatedNonStrikerStats, oldStrikerStats);

        updatedStrikerStats.player_id = strikerId;
        updatedNonStrikerStats.player_id = nonStrikerId;
      }

      needsNextBowler = true;
    }

    /*
     * RECENT BALLS
     */

    const previousRecentBalls =
      previousOptimistic?.recentBalls ?? safeArray(currentInnings.recentBalls);

    const overNumber = Math.floor(previousBalls / 6);
    const ballInOver = legal ? (previousBalls % 6) + 1 : previousBalls % 6;

    const optimisticBall = {
      id: `optimistic-${Date.now()}-${Math.random()}`,
      ball_sequence: previousRecentBalls.length > 0
        ? (Number(previousRecentBalls[previousRecentBalls.length - 1].ball_sequence) || previousBalls) + 1
        : previousBalls + 1,
      over_number: overNumber,
      ball_in_over: ballInOver,
      batsman_id: previousOptimistic?.strikerId ?? current.striker_id,
      non_striker_id: previousOptimistic?.nonStrikerId ?? current.non_striker_id,
      bowler_id: scoringBowlerId,
      runs_batsman: batsmanRuns,
      extra_type: payload.extra_type || null,
      extra_runs: inputExtraRuns,
      is_wicket: wicket,
      wicket_type: payload.wicket_type || null,
      dismissed_id: payload.dismissed_id || null,
      fielder_id: payload.fielder_id || null,
      is_legal: legal ? 1 : 0
    };

    const newRecentBalls = [...previousRecentBalls, optimisticBall].slice(-24);

    /*
     * EXTRAS
     */

    const previousExtras = previousOptimistic?.extras || {
      wide: Number(current.extras_wide || 0),
      noball: Number(current.extras_noball || 0),
      bye: Number(current.extras_bye || 0),
      legbye: Number(current.extras_legbye || 0),
      penalty: Number(current.extras_penalty || 0)
    };

    const newExtras = { ...previousExtras };

    if (payload.extra_type) {
      newExtras[payload.extra_type] =
        Number(newExtras[payload.extra_type] || 0) + inputExtraRuns;
    }

    /*
     * PARTNERSHIP
     */

    const previousPartnership =
      previousOptimistic?.partnership ??
      currentInnings.partnership ??
      { runs: 0, balls: 0 };

    const newPartnership = wicket
      ? { runs: 0, balls: 0 }
      : {
          runs: Number(previousPartnership.runs || 0) + teamRuns,
          balls: Number(previousPartnership.balls || 0) +
            (legal || payload.extra_type === 'noball' ? 1 : 0)
        };

    /*
     * FALL OF WICKETS
     */

    const previousFallOfWickets =
      previousOptimistic?.fallOfWickets ??
      currentInnings.fallOfWickets ??
      [];

    const newFallOfWickets =
      wicket && payload.dismissed_id != null
        ? [
            ...previousFallOfWickets,
            {
              wicket_number: newTotalWickets,
              player_id: payload.dismissed_id,
              score: newTotalRuns,
              overs: `${Math.floor(newTotalBalls / 6)}.${newTotalBalls % 6}`,
              wicket_type: payload.wicket_type || null,
              bowler_id: scoringBowlerId || null,
              fielder_id: payload.fielder_id || null
            }
          ]
        : previousFallOfWickets;

    return {
      total_runs: newTotalRuns,
      total_wickets: newTotalWickets,
      total_balls: newTotalBalls,
      strikerId,
      nonStrikerId,
      activeBowlerId: scoringBowlerId,
      needsNextBowler,
      bowlerStats: updatedBowlerStats,
      bowlerBalls: newBowlerBalls,
      strikerStats: updatedStrikerStats,
      nonStrikerStats: updatedNonStrikerStats,
      recentBalls: newRecentBalls,
      extras: newExtras,
      partnership: newPartnership,
      fallOfWickets: newFallOfWickets,
      runRate: newTotalBalls > 0
        ? Number((newTotalRuns / (newTotalBalls / 6)).toFixed(2))
        : 0
    };
  };

  /*
   * SCORE SAVE QUEUE
   */

  const processScoreQueue = useCallback(async () => {
    if (processingQueueRef.current) return;

    processingQueueRef.current = true;
    let failed = false;

    while (scoreQueueRef.current.length > 0) {
      const item = scoreQueueRef.current.shift();
      if (!item) continue;

      try {
        await Innings.ball(item.inningsId, item.payload);

        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        setPendingCount(pendingCountRef.current);
      } catch (err) {
        failed = true;

        setError(
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Unable to save ball'
        );

        scoreQueueRef.current = [];
        pendingCountRef.current = 0;
        setPendingCount(0);
        optimisticRef.current = null;
        setOptimistic(null);

        try {
          applyServerData(await Matches.get(matchId));
        } catch (_) {}

        break;
      }
    }

    processingQueueRef.current = false;

    if (!failed && pendingCountRef.current === 0) {
      try {
        applyServerData(await Matches.get(matchId));
      } catch (_) {}
    }
  }, [matchId, applyServerData]);

  /*
   * RECORD BALL
   */

  const playBall = useCallback(payload => {
    if (actionBusyRef.current === 'undo') return;

    const currentInnings =
      innings.find(item =>
        Number(item?.innings?.innings_number ?? item?.innings_number) ===
        Number(match?.current_innings)
      ) || innings[innings.length - 1];

    if (!currentInnings?.innings) return;

    const current = currentInnings.innings;

    const effectiveStrikerId =
      optimisticRef.current?.strikerId ?? current.striker_id;

    const effectiveNonStrikerId =
      optimisticRef.current?.nonStrikerId ?? current.non_striker_id;

    const effectiveBowlerId =
      optimisticRef.current?.activeBowlerId ?? current.current_bowler_id;

    if (!effectiveBowlerId) {
      setShowNextBowler(true);
      return;
    }

    if (optimisticRef.current?.needsNextBowler) return;
    if (!effectiveStrikerId || !effectiveNonStrikerId) return;

    if (!payload.extra_type && Number(payload.runs) === 4) popBoundary('four');
    if (!payload.extra_type && Number(payload.runs) === 6) popBoundary('six');

    lastActionSnapshotRef.current = cloneOptimisticState(
      optimisticRef.current || createBaseOptimisticState(currentInnings)
    );

    const nextOptimistic = buildOptimisticBall({
      current,
      currentInnings,
      payload,
      previousOptimistic: optimisticRef.current
    });

    optimisticRef.current = nextOptimistic;
    setOptimistic(nextOptimistic);

    scoreQueueRef.current.push({
      inningsId: current.id,
      payload
    });

    pendingCountRef.current += 1;
    setPendingCount(pendingCountRef.current);

    processScoreQueue();
  }, [innings, match, popBoundary, processScoreQueue]);

  /*
   * LOADING
   */

  if (!match) {
    return <p className="text-slate-400">Loading…</p>;
  }

  const currentInnings =
    innings.find(item =>
      Number(item?.innings?.innings_number ?? item?.innings_number) ===
      Number(match?.current_innings)
    ) || innings[innings.length - 1];

  /*
   * MATCH COMPLETED
   */

  if (match.status === 'completed' && pendingCount === 0) {
    return (
      <div className="max-w-lg mx-auto card text-center space-y-3 fade-in">
        <h1 className="text-2xl font-bold">🏆 Match Completed</h1>
        <p className="text-emerald-400 text-lg font-semibold">{match.result_text}</p>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/match/${matchId}/live`)}
        >
          View Full Scorecard
        </button>
      </div>
    );
  }

  /*
   * INNINGS BREAK / TARGET
   */

  const inningsData = currentInnings?.innings;

  const secondInningsNeedsSetup =
    Number(match.current_innings) === 2 &&
    !inningsData?.striker_id &&
    !inningsData?.non_striker_id &&
    !inningsData?.current_bowler_id &&
    Number(inningsData?.total_balls || 0) === 0 &&
    Number(inningsData?.total_runs || 0) === 0;

  const isInningsBreak =
    match.status === 'innings-break' ||
    (secondInningsNeedsSetup && !inningsBreakDismissed);

  if (!currentInnings) {
    return <p className="text-slate-400">Setting up…</p>;
  }

  const inn = currentInnings.innings;

  const targetValue = inn.target != null ? Number(inn.target) : null;

  const displayedRuns = Number(optimistic?.total_runs ?? inn.total_runs ?? 0);

  const runsNeeded = targetValue != null
    ? Math.max(0, targetValue - displayedRuns)
    : null;

  if (isInningsBreak) {
    const firstInnings = innings.find(item =>
      Number(item?.innings?.innings_number ?? item?.innings_number) === 1
    );

    return (
      <div className="max-w-lg mx-auto card text-center space-y-4 fade-in">
        <div className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
          Innings Break
        </div>

        <h1 className="text-3xl font-extrabold">
          Target: {targetValue != null ? targetValue : '—'}
        </h1>

        <p className="text-slate-400">
          First innings score:{' '}
          {Number(firstInnings?.innings?.total_runs || 0)}/
          {Number(firstInnings?.innings?.total_wickets || 0)} (
          {firstInnings?.overs || '0.0'} overs)
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

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
              setError(
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.message ||
                'Unable to start second innings'
              );
            }
          }}
        >
          Continue →
        </button>
      </div>
    );
  }

  /*
   * INSTANT UNDO / SWAP
   */

  const runFastAction = serverFn => {
    Promise.resolve()
      .then(serverFn)
      .then(() => {
        clearTimeout(fastActionTimerRef.current);

        fastActionTimerRef.current = window.setTimeout(() => {
          if (pendingCountRef.current === 0) loadFull();
        }, 700);
      })
      .catch(async err => {
        setError(
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Action failed'
        );
        await loadFull();
      });
  };

  const handleInstantSwap = () => {
    if (!inn?.id || isInningsBreak || pendingCountRef.current > 0) return;

    const base =
      optimisticRef.current || createBaseOptimisticState(currentInnings);

    if (!base?.strikerId || !base?.nonStrikerId) return;

    const next = {
      ...base,
      strikerId: base.nonStrikerId,
      nonStrikerId: base.strikerId,
      strikerStats: base.nonStrikerStats ? { ...base.nonStrikerStats } : null,
      nonStrikerStats: base.strikerStats ? { ...base.strikerStats } : null
    };

    optimisticRef.current = next;
    setOptimistic(next);
    setError('');

    runFastAction(() => Innings.swapStrike(inn.id));
  };

  const handleInstantUndo = async () => {
    if (
      !inn?.id ||
      isInningsBreak ||
      pendingCountRef.current > 0 ||
      actionBusyRef.current === 'undo'
    ) {
      return;
    }

    const selectedStrikerId =
      optimisticRef.current?.strikerId ?? inn.striker_id ?? null;

    const selectedNonStrikerId =
      optimisticRef.current?.nonStrikerId ?? inn.non_striker_id ?? null;

    const selectedBowlerId =
      optimisticRef.current?.activeBowlerId ?? inn.current_bowler_id ?? null;

    const snapshot = lastActionSnapshotRef.current;

    if (snapshot) {
      const restored = cloneOptimisticState(snapshot);

      restored.strikerId = selectedStrikerId;
      restored.nonStrikerId = selectedNonStrikerId;
      restored.activeBowlerId = selectedBowlerId;

      optimisticRef.current = restored;
      setOptimistic(restored);
    }

    setError('');
    actionBusyRef.current = 'undo';
    setActionBusy('undo');

    try {
      await Innings.undo(inn.id);
      lastActionSnapshotRef.current = null;

      const repairs = [];

      if (selectedStrikerId && selectedNonStrikerId) {
        repairs.push(Innings.setBatsmen(inn.id, {
          striker_id: selectedStrikerId,
          non_striker_id: selectedNonStrikerId
        }));
      }

      if (selectedBowlerId) {
        repairs.push(Innings.setBowler(inn.id, {
          bowler_id: selectedBowlerId
        }));
      }

      await Promise.all(repairs);
      applyServerData(await Matches.get(matchId));
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Unable to undo the last ball'
      );

      try {
        applyServerData(await Matches.get(matchId));
      } catch (_) {}
    } finally {
      actionBusyRef.current = null;
      setActionBusy(null);
    }
  };

  /*
   * CHANGE BATSMAN IDENTITY WITHOUT RESETTING FIGURES
   */

  const saveBatsmanIdentity = async (playerId, targetPlayer) => {
    if (!playerId || !targetPlayer?.id || !inn?.id) return;

    const sourcePlayer = players.find(p => sameId(p.id, playerId));

    if (!sourcePlayer) {
      setError('Could not find the current batsman. Please refresh and try again.');
      return;
    }

    if (sameId(playerId, targetPlayer.id)) {
      setEditingBatsman(null);
      return;
    }

    const duplicateName = battingTeamPlayers.find(p =>
      !sameId(p.id, targetPlayer.id) &&
      normalizePlayerName(p.name) === normalizePlayerName(targetPlayer.name)
    );

    if (duplicateName) {
      setError('A player with that name already exists in this team. Select the existing player instead.');
      return;
    }

    const confirmed = window.confirm(
      `Transfer this innings' batting records from ${sourcePlayer.name} to ${targetPlayer.name}? Runs, balls, boundaries and dismissals stay the same. The target player's other matches are not changed.`
    );

    if (!confirmed) return;

    setSavingBatsmanIdentity(true);
    setError('');

    try {
      try {
        await Innings.correctBatsmanHistory(inn.id, {
          from_player_id: playerId,
          to_player_id: targetPlayer.id
        });
      } catch (historyError) {
        const sourceStats = safeArray(currentInnings.battingCard).find(
          item => sameId(item.player_id, playerId)
        );

        const hasBattingHistory = Boolean(
          sourceStats &&
          (
            Number(sourceStats.runs || 0) > 0 ||
            Number(sourceStats.balls || 0) > 0 ||
            sourceStats.is_out
          )
        );

        if (hasBattingHistory) throw historyError;

        const nextStriker = sameId(effectiveStrikerId, playerId)
          ? targetPlayer.id
          : effectiveStrikerId;

        const nextNonStriker = sameId(effectiveNonStrikerId, playerId)
          ? targetPlayer.id
          : effectiveNonStrikerId;

        if (
          !nextStriker ||
          !nextNonStriker ||
          sameId(nextStriker, nextNonStriker)
        ) {
          throw historyError;
        }

        await Innings.setBatsmen(inn.id, {
          striker_id: nextStriker,
          non_striker_id: nextNonStriker
        });
      }

      setEditingBatsman(null);
      lastActionSnapshotRef.current = null;
      applyServerData(await Matches.get(matchId));
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Unable to transfer the batsman statistics. Check that the history-correction API is enabled.'
      );
    } finally {
      setSavingBatsmanIdentity(false);
    }
  };

  /*
   * DISPLAY SCORE
   */

  const displayTotalRuns = optimistic?.total_runs ?? Number(inn.total_runs || 0);
  const displayTotalWickets = optimistic?.total_wickets ?? Number(inn.total_wickets || 0);
  const displayTotalBalls = optimistic?.total_balls ?? Number(inn.total_balls || 0);

  const displayOvers =
    `${Math.floor(displayTotalBalls / 6)}.${displayTotalBalls % 6}`;

  const displayRunRate = displayTotalBalls > 0
    ? ((displayTotalRuns / displayTotalBalls) * 6).toFixed(2)
    : '0.00';

  /*
   * ACTIVE PLAYERS
   */

  const effectiveStrikerId = optimistic?.strikerId ?? inn.striker_id;
  const effectiveNonStrikerId = optimistic?.nonStrikerId ?? inn.non_striker_id;
  const effectiveBowlerId = optimistic?.activeBowlerId ?? inn.current_bowler_id;

  const battingTeamPlayers = uniquePlayersByName(
    players.filter(p =>
      sameId(p.team_id, inn.batting_team_id) &&
      p.active !== false &&
      p.active !== 0
    )
  );

  const bowlingTeamPlayers = uniquePlayersByName(
    players.filter(p =>
      sameId(p.team_id, inn.bowling_team_id) &&
      p.active !== false &&
      p.active !== 0
    )
  );

  const outIds = new Set(
    safeArray(currentInnings.battingCard)
      .filter(b => b.is_out)
      .map(b => String(b.player_id))
  );

  if (optimistic?.strikerStats?.is_out && optimistic.strikerStats.player_id != null) {
    outIds.add(String(optimistic.strikerStats.player_id));
  }

  if (optimistic?.nonStrikerStats?.is_out && optimistic.nonStrikerStats.player_id != null) {
    outIds.add(String(optimistic.nonStrikerStats.player_id));
  }

  const striker = players.find(p => sameId(p.id, effectiveStrikerId));
  const nonStriker = players.find(p => sameId(p.id, effectiveNonStrikerId));
  const bowler = players.find(p => sameId(p.id, effectiveBowlerId));

  /*
   * NEED BATSMEN
   */

  const needStriker = !effectiveStrikerId;
  const needNonStriker = !effectiveNonStrikerId;

  if (needStriker || needNonStriker) {
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
                <span className="text-slate-400">/{displayTotalWickets}</span>
              </div>
            </div>

            <div className="text-right text-sm text-slate-400">
              <div>{displayOvers} ov</div>
              <div>RR: {displayRunRate}</div>
            </div>
          </div>
        </div>

        <SelectBatsmen
          team={battingTeamPlayers}
          outIds={outIds}
          teamId={inn.batting_team_id}
          onPlayerCreated={handlePlayerCreated}
          hasStriker={Boolean(effectiveStrikerId)}
          hasNonStriker={Boolean(effectiveNonStrikerId)}
          onSelect={async (selectedStriker, selectedNonStriker) => {
            const nextStriker = selectedStriker ?? effectiveStrikerId;
            const nextNonStriker = selectedNonStriker ?? effectiveNonStrikerId;

            if (
              !nextStriker ||
              !nextNonStriker ||
              sameId(nextStriker, nextNonStriker)
            ) {
              setError('Choose two different batsmen.');
              return;
            }

            const base =
              optimisticRef.current || createBaseOptimisticState(currentInnings);

            const battingCard = safeArray(currentInnings.battingCard);

            const nextState = {
              ...(base || {}),
              strikerId: nextStriker,
              nonStrikerId: nextNonStriker,
              strikerStats: {
                ...(findByPlayerId(battingCard, nextStriker) ||
                  emptyBattingStats(nextStriker)),
                player_id: nextStriker
              },
              nonStrikerStats: {
                ...(findByPlayerId(battingCard, nextNonStriker) ||
                  emptyBattingStats(nextNonStriker)),
                player_id: nextNonStriker
              }
            };

            optimisticRef.current = nextState;
            setOptimistic(nextState);

            if (!effectiveBowlerId) setShowNextBowler(true);

            setError('');

            try {
              await Innings.setBatsmen(inn.id, {
                striker_id: nextStriker,
                non_striker_id: nextNonStriker
              });

              if (!effectiveBowlerId) setShowNextBowler(true);

              window.setTimeout(() => {
                if (pendingCountRef.current === 0) loadFull();
              }, 150);
            } catch (err) {
              setError(
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.message ||
                'Unable to select batsmen'
              );
              await loadFull();
            }
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
   * BATSMAN STATS
   */

  const serverStrikerStats =
    findByPlayerId(currentInnings.battingCard, effectiveStrikerId) ||
    emptyBattingStats(effectiveStrikerId);

  // FIX: use effectiveNonStrikerId for the non-striker's statistics.
  const serverNonStrikerStats =
    findByPlayerId(currentInnings.battingCard, effectiveNonStrikerId) ||
    emptyBattingStats(effectiveNonStrikerId);

  const strikerStats =
    optimistic?.strikerStats &&
    sameId(optimistic.strikerStats.player_id, effectiveStrikerId)
      ? optimistic.strikerStats
      : serverStrikerStats;

  const nonStrikerStats =
    optimistic?.nonStrikerStats &&
    sameId(optimistic.nonStrikerStats.player_id, effectiveNonStrikerId)
      ? optimistic.nonStrikerStats
      : serverNonStrikerStats;

  /*
   * BOWLER STATS
   */

  const serverBowlerStats =
    findByPlayerId(currentInnings.bowlingCard, effectiveBowlerId) ||
    emptyBowlingStats(effectiveBowlerId);

  const bowlerStats =
    optimistic?.bowlerStats &&
    sameId(optimistic.bowlerStats.player_id, effectiveBowlerId)
      ? { ...serverBowlerStats, ...optimistic.bowlerStats }
      : serverBowlerStats;

  /*
   * RECENT BALLS
   */

  const recentBalls =
    optimistic?.recentBalls ?? safeArray(currentInnings.recentBalls);

  const overCompleted = displayTotalBalls > 0 && displayTotalBalls % 6 === 0;
  const displayOverNumber = Math.floor(displayTotalBalls / 6);

  const currentOverBalls = overCompleted
    ? []
    : recentBalls.filter(ball =>
        Number(ball.over_number) === displayOverNumber
      );

  /*
   * BOWLER LOGIC
   */

  const needsNextBowler =
    Boolean(optimistic?.needsNextBowler) || !effectiveBowlerId;

  const partnership =
    optimistic?.partnership ??
    currentInnings.partnership ??
    { runs: 0, balls: 0 };

  const fallOfWickets =
    optimistic?.fallOfWickets ??
    currentInnings.fallOfWickets ??
    [];

  /*
   * RENDER
   */

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">
      {boundary && (
        <div className="boundary-overlay">
          <div className={`boundary-text boundary-${boundary}`}>
            {boundary === 'six' ? 'SIX! 🚀' : 'FOUR! 🔥'}
          </div>
        </div>
      )}

      {isInningsBreak && (
        <div className="card border border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                Innings Break
              </div>
              <div className="text-xl font-extrabold text-white mt-1">
                Target: {targetValue != null ? targetValue : '—'}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {inn.total_runs || 0}/{inn.total_wickets || 0} in {currentInnings.overs || '0.0'} overs
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setError('');
                act(() => Matches.startSecondInnings(matchId));
              }}
            >
              Start 2nd Innings →
            </button>
          </div>
        </div>
      )}

      <div className={`card ${flashWicket ? 'wicket-flash' : ''}`}>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="text-sm text-slate-400">
              {match.team1_short} vs {match.team2_short} · {match.overs_limit} overs
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {displayTotalRuns}
              <span className="text-slate-400">/{displayTotalWickets}</span>
              <span className="text-lg text-slate-400 font-medium">
                {' '}({displayOvers} ov)
              </span>
            </div>
          </div>

          <div className="text-right text-sm text-slate-400">
            <div>RR: {displayRunRate}</div>

            {targetValue != null && <div>Target: {targetValue}</div>}

            {runsNeeded != null && !isInningsBreak && (
              <div>
                Need: {runsNeeded} runs |{' '}
                {Math.max(
                  0,
                  Number(match.overs_limit || 0) * 6 -
                  Number(optimistic?.total_balls ?? inn.total_balls ?? 0)
                )} balls left
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
            onEdit={() => setEditingBatsman('striker')}
          />

          <BatsmanCard
            player={nonStriker}
            stats={nonStrikerStats}
            onEdit={() => setEditingBatsman('nonStriker')}
          />
        </div>

        <div className="mt-2">
          <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
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
                    Edit
                  </button>
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {needsNextBowler ? 'BOWLER REQUIRED' : 'CURRENT BOWLER'}
                </div>
              </div>

              {!needsNextBowler && (
                <div className="grid grid-cols-5 gap-3 text-center">
                  <BowlingStat value={bowlerStats.overs} label="Overs" />
                  <BowlingStat value={bowlerStats.maidens} label="M" />
                  <BowlingStat value={bowlerStats.runs} label="Runs" />
                  <BowlingStat value={bowlerStats.wickets} label="W" />
                  <BowlingStat value={bowlerStats.economy} label="Econ" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 bg-slate-900/70 rounded-xl p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-slate-300">Current Over</h3>
            <span className="text-xs text-slate-500">Over {displayOverNumber + 1}</span>
          </div>

          {currentOverBalls.length === 0 ? (
            <div className="text-xs text-slate-500">No balls yet</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentOverBalls.map((ball, index) => (
                <BallDisplay
                  key={ball.id || `${ball.ball_sequence}-${index}`}
                  ball={ball}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {!needsNextBowler && !isInningsBreak && (
        <>
          <div className="card !p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-sm text-slate-300">Score Runs</h3>
                <div className="text-[10px] text-slate-500 mt-0.5">Quick scoring</div>
              </div>
              <div className="text-xs text-slate-500">{displayTotalBalls % 6}/6</div>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {[0, 1, 2, 3, 4, 6].map(runs => (
                <button
                  key={runs}
                  className={`h-11 rounded-xl font-bold text-base active:scale-95 transition-transform ${
                    runs === 4
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : runs === 6
                        ? 'bg-purple-600 hover:bg-purple-500'
                        : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                  onClick={() => playBall({ runs, extra_type: null })}
                >
                  {runs}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <button
                className="h-10 rounded-xl bg-red-700 hover:bg-red-600 font-semibold text-sm active:scale-95 transition-transform"
                onClick={() => setShowWicket(true)}
                disabled={pendingCount > 0}
              >
                OUT
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2 text-sm text-slate-400">Extras</h3>

            {!extraPicker ? (
              <div className="grid grid-cols-4 gap-2">
                {['wide', 'noball', 'bye', 'legbye'].map(type => (
                  <button
                    key={type}
                    className="btn btn-secondary text-sm"
                    onClick={() => setExtraPicker(type)}
                  >
                    {type === 'noball'
                      ? 'No Ball'
                      : type === 'legbye'
                        ? 'Leg Bye'
                        : type[0].toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="fade-in">
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
                  {[0, 1, 2, 3, 4, 6].map(runs => (
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
              disabled={pendingCount > 0 || isInningsBreak || actionBusy === 'undo'}
              onClick={handleInstantUndo}
            >
              ↺ Undo
            </button>

            <button
              className="btn btn-secondary"
              disabled={pendingCount > 0 || isInningsBreak}
              onClick={handleInstantSwap}
            >
              ⇄ Swap Batsmen
            </button>
          </div>
        </>
      )}

      <div className="mt-2 bg-slate-900/70 rounded-xl p-2 border border-slate-700">
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

      {(showNextBowler || !effectiveBowlerId) && (
        (needsNextBowler || editingBowler) && (
          <NextBowlerModal
            team={bowlingTeamPlayers}
            teamId={inn.bowling_team_id}
            onPlayerCreated={handlePlayerCreated}
            error={error}
            initialBowler={bowler}
            isInitial={!effectiveBowlerId && displayTotalBalls === 0}
            isEditing={editingBowler}
            onCancel={() => {
              setShowNextBowler(false);
              setEditingBowler(false);
              setError('');
            }}
            onSelect={async selected => {
              const bowlerId = getPlayerId(selected);
              if (bowlerId == null) return;

              try {
                setError('');

                const selectedBowlerStats =
                  findByPlayerId(currentInnings.bowlingCard, bowlerId) ||
                  emptyBowlingStats(bowlerId);

                const nextState = {
                  ...(optimisticRef.current || {}),
                  activeBowlerId: bowlerId,
                  needsNextBowler: false,
                  bowlerBalls: getOversAsBalls(selectedBowlerStats.overs),
                  bowlerStats: { ...selectedBowlerStats, player_id: bowlerId }
                };

                optimisticRef.current = nextState;
                setOptimistic(nextState);
                setShowNextBowler(false);
                setEditingBowler(false);

                await Innings.setBowler(inn.id, { bowler_id: bowlerId });

                const data = await Matches.get(matchId);

                if (pendingCountRef.current === 0) {
                  setMatch(data.match);
                  setPlayers(safeArray(data.players));
                  setInnings(safeArray(data.innings));
                  optimisticRef.current = null;
                  setOptimistic(null);
                }
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
        )
      )}

      {editingBatsman && (
        <BatsmanIdentityModal
          player={editingBatsman === 'striker' ? striker : nonStriker}
          team={battingTeamPlayers}
          teamId={inn.batting_team_id}
          onPlayerCreated={handlePlayerCreated}
          busy={savingBatsmanIdentity}
          onClose={() => setEditingBatsman(null)}
          onSave={targetPlayer => saveBatsmanIdentity(
            editingBatsman === 'striker'
              ? effectiveStrikerId
              : effectiveNonStrikerId,
            targetPlayer
          )}
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
    </div>
  );
}

/*
 * BATSMAN IDENTITY EDITOR
 */

function BatsmanIdentityModal({
  player,
  team = [],
  teamId,
  onPlayerCreated,
  busy,
  onClose,
  onSave
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setQuery('');
    setSelectedId('');
    setCreating(false);
    setLocalError('');
  }, [player?.id]);

  if (!player) return null;

  const normalizedQuery = normalizePlayerName(query);
  const selectedPlayer = team.find(p => sameId(p.id, selectedId));

  const matches = normalizedQuery
    ? team.filter(p => normalizePlayerName(p.name).includes(normalizedQuery)).slice(0, 8)
    : team.slice(0, 8);

  const exactMatch = team.find(
    p => normalizePlayerName(p.name) === normalizedQuery
  );

  const canCreate = normalizedQuery.length > 0 && !exactMatch;

  const submit = async event => {
    event.preventDefault();
    if (busy || creating) return;

    setLocalError('');

    if (selectedPlayer) {
      onSave(selectedPlayer);
      return;
    }

    if (exactMatch) {
      onSave(exactMatch);
      return;
    }

    if (!canCreate || !teamId) {
      setLocalError('Enter a player name or select an existing player.');
      return;
    }

    setCreating(true);

    try {
      const created = await Players.create({
        team_id: teamId,
        name: String(query).normalize('NFKC').trim().replace(/\s+/g, ' ')
      });

      const newPlayer =
        created?.player ??
        created?.data?.player ??
        created?.data ??
        created;

      if (newPlayer?.id == null) {
        throw new Error('Player was created but its ID was not returned. Refresh the player list and try again.');
      }

      onPlayerCreated?.(newPlayer);
      await onSave(newPlayer);
    } catch (err) {
      setLocalError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Unable to create/select this player.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close editor"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      <form
        className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onSubmit={submit}
      >
        <div className="text-lg font-bold text-white">Change batsman identity</div>

        <p className="mt-1 text-sm text-slate-400">
          Current player: {player.name || 'Unknown'}. Select an existing team player
          or type a new name. The current innings' batting history will be assigned
          to the selected player.
        </p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Search or add player
        </label>

        <input
          autoFocus
          value={selectedPlayer ? selectedPlayer.name : query}
          onChange={event => {
            setSelectedId('');
            setQuery(event.target.value);
            setLocalError('');
          }}
          onFocus={() => {
            if (selectedPlayer) {
              setQuery(selectedPlayer.name);
              setSelectedId('');
            }
          }}
          maxLength={80}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-white outline-none focus:border-emerald-500"
          placeholder="Type a player name…"
        />

        {matches.length > 0 && !selectedPlayer && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950">
            {matches.map(item => (
              <button
                key={item.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800"
                onClick={() => {
                  setSelectedId(String(item.id));
                  setQuery(item.name || '');
                  setLocalError('');
                }}
              >
                <span>{item.name}</span>
                {sameId(item.id, player.id) && (
                  <span className="ml-2 text-xs text-slate-400">(current player)</span>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedPlayer && (
          <div className="mt-2 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
            Selected: {selectedPlayer.name}
          </div>
        )}

        {!selectedPlayer && canCreate && (
          <p className="mt-2 text-xs text-slate-400">
            A new player named “{query.trim()}” will be created for this team.
          </p>
        )}

        {localError && (
          <div className="mt-3 rounded-lg border border-red-700 bg-red-950/50 p-3 text-sm text-red-200">
            {localError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || creating}
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || creating || (!selectedPlayer && !normalizedQuery)}
          >
            {busy || creating
              ? 'Saving…'
              : selectedPlayer
                ? 'Use selected player'
                : exactMatch
                  ? 'Use existing player'
                  : 'Create & transfer stats'}
          </button>
        </div>
      </form>
    </div>
  );
}

/*
 * BATSMAN CARD
 */

function BatsmanCard({ player, stats, striker = false, onEdit }) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">
      <div className="flex justify-between items-center gap-2">
        <div className="font-semibold text-white min-w-0">
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

      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <Stat value={stats?.runs ?? 0} label="Runs" large />
        <Stat value={stats?.balls ?? 0} label="Balls" />
        <Stat value={stats?.fours ?? 0} label="4s" />
        <Stat value={stats?.sixes ?? 0} label="6s" />
        <Stat value={stats?.strike_rate ?? 0} label="SR" />
      </div>
    </div>
  );
}

/*
 * NEXT BOWLER MODAL
 */

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
  // FIX: PlayerAutocomplete expects an ID, not a complete player object.
  const [bowler, setBowler] = useState(initialBowler?.id ?? null);

  useEffect(() => {
    setBowler(initialBowler?.id ?? null);
  }, [initialBowler?.id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative w-full max-w-md">
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  {isInitial ? 'Match Start' : isEditing ? 'Change Bowler' : 'Over Complete'}
                </div>

                <h2 className="text-2xl font-extrabold text-white mt-1">
                  🎯 {isInitial ? 'Select Bowler' : isEditing ? 'Select Bowler' : 'Select Next Bowler'}
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  {isInitial
                    ? 'Choose the bowler for the first over'
                    : 'Choose the bowler for the new over'}
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
                {isInitial ? 'Opening Bowler' : 'Next Bowler'}
              </div>

              <PlayerAutocomplete
                players={uniquePlayersByName(team)}
                value={bowler}
                onChange={setBowler}
                teamId={teamId}
                onCreated={onPlayerCreated}
                placeholder={isInitial
                  ? 'Type or select opening bowler…'
                  : 'Type or select bowler…'}
              />
            </div>

            {error && (
              <div className="mb-4 bg-red-900/50 border border-red-600 text-red-200 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary w-full h-12 text-base font-bold"
              disabled={bowler == null || bowler === ''}
              onClick={() => onSelect(bowler)}
            >
              {isInitial ? 'Start Innings →' : 'Start New Over →'}
            </button>

            {bowler == null && (
              <div className="text-center text-xs text-slate-500 mt-3">
                Select a bowler to continue scoring
              </div>
            )}

            {isEditing && (
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
    </div>
  );
}

/*
 * FALL OF WICKETS
 */

function FallOfWickets({ wickets, players }) {
  if (!wickets || wickets.length === 0) return null;

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
          const player = players.find(p => sameId(p.id, item.player_id));

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

/*
 * STAT COMPONENTS
 */

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

/*
 * BALL DISPLAY
 */

function BallDisplay({ ball }) {
  let label = String(ball.runs_batsman ?? 0);
  let className = 'bg-slate-700';

  if (ball.is_wicket) {
    label = 'W';
    className = 'bg-red-600';
  } else if (ball.extra_type === 'wide') {
    label = `Wd${Number(ball.extra_runs || 1) > 1
      ? `+${Number(ball.extra_runs) - 1}`
      : ''}`;
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

/*
 * BATSMEN SELECTION
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
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);

  const available = uniquePlayersByName(team).filter(player =>
    !outIds.has(String(player.id))
  );

  const strikerId = getSelectionId(striker);
  const nonStrikerId = getSelectionId(nonStriker);

  const confirmSelection = () => {
    if (
      strikerId != null &&
      nonStrikerId != null &&
      sameId(strikerId, nonStrikerId)
    ) {
      return;
    }

    onSelect(strikerId, nonStrikerId);
  };

  return (
    <div className="card space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {hasStriker || hasNonStriker ? 'Select New Batsman' : 'Select Batsmen'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Choose the player to continue the innings
          </p>
        </div>
        <div className="text-2xl">🏏</div>
      </div>

      {!hasStriker && (
        <div>
          <label className="text-sm text-slate-400 mb-1 block">On strike</label>
          <PlayerAutocomplete
            players={available}
            value={strikerId}
            onChange={setStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={nonStrikerId != null ? [nonStrikerId] : []}
            placeholder="Type or add striker's name…"
          />
        </div>
      )}

      {!hasNonStriker && (
        <div>
          <label className="text-sm text-slate-400 mb-1 block">Non-striker</label>
          <PlayerAutocomplete
            players={available}
            value={nonStrikerId}
            onChange={setNonStriker}
            teamId={teamId}
            onCreated={onPlayerCreated}
            excludeIds={strikerId != null ? [strikerId] : []}
            placeholder="Type or add non-striker's name…"
          />
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={
          (!hasStriker && strikerId == null) ||
          (!hasNonStriker && nonStrikerId == null) ||
          (
            strikerId != null &&
            nonStrikerId != null &&
            sameId(strikerId, nonStrikerId)
          )
        }
        onClick={confirmSelection}
      >
        Confirm
      </button>
    </div>
  );
}

function getSelectionId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.id ?? null;
  return value;
}
