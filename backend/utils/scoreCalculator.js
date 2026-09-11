const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;

function oversStr(totalBalls) {
  const overs = Math.floor(totalBalls / 6);
  const balls = totalBalls % 6;
  return `${overs}.${balls}`;
}

async function getInnings(inningsId) {
  return await db.prepare('SELECT * FROM innings WHERE id = ?').get(inningsId);
}

async function getMatch(matchId) {
  return await db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
}

/**
 * Determine total runs added to the team score and runs physically
 * run between the wickets (used for strike-rotation) for a given delivery.
 */
function computeRunEffects({ runs = 0, extra_type = null, extra_runs = 0 }) {
  runs = Number(runs) || 0;
  extra_runs = Number(extra_runs) || 0;

  switch (extra_type) {
    case 'wide':
      // extra_runs = TOTAL runs from the wide (min 1, e.g. wide + 1 scrambled run = 2)
      return { teamRuns: Math.max(1, extra_runs), batsmanRuns: 0, runsRun: Math.max(1, extra_runs) - 1, isLegal: 0 };
    case 'noball':
      // extra_runs = the no-ball penalty (usually just 1); runs = runs actually scored off the bat
      return { teamRuns: Math.max(1, extra_runs) + runs, batsmanRuns: runs, runsRun: runs, isLegal: 0 };
    case 'bye':
    case 'legbye':
      return { teamRuns: extra_runs, batsmanRuns: 0, runsRun: extra_runs, isLegal: 1 };
    case 'penalty':
      return { teamRuns: extra_runs, batsmanRuns: 0, runsRun: 0, isLegal: 0 };
    default:
      return { teamRuns: runs, batsmanRuns: runs, runsRun: runs, isLegal: 1 };
  }
}

/**
 * Record one delivery against an innings. Innings row must already have
 * striker_id, non_striker_id and current_bowler_id set.
 */
async function recordBall(inningsId, payload) {
  const innings = await getInnings(inningsId);
  if (!innings) throw new Error('Innings not found');
  if (innings.is_completed) throw new Error('Innings is already completed');
  if (!innings.striker_id || !innings.non_striker_id) {
    throw new Error('Set both batsmen before recording a ball');
  }
  if (!innings.current_bowler_id) {
    throw new Error('Set the bowler before recording a ball');
  }

  const { extra_type = null, is_wicket = false, wicket_type = null, dismissed_id = null, fielder_id = null, commentary = null } = payload;
  const { teamRuns, batsmanRuns, runsRun, isLegal } = computeRunEffects(payload);

  if (is_wicket && dismissed_id && ![innings.striker_id, innings.non_striker_id].includes(dismissed_id)) {
    throw new Error('Dismissed player must be the current striker or non-striker');
  }

  const ballCountRow = await db.prepare('SELECT COUNT(*) AS c FROM balls WHERE innings_id = ?').get(inningsId);
  const ballSequence = ballCountRow.c + 1;
  const overNumber = Math.floor(innings.total_balls / 6);
  const ballInOver = isLegal ? (innings.total_balls % 6) + 1 : (innings.total_balls % 6);

  const ballId = uuidv4();
  await db.prepare(`
    INSERT INTO balls (id, innings_id, over_number, ball_in_over, ball_sequence, batsman_id, non_striker_id,
      bowler_id, runs_batsman, extra_type, extra_runs, is_wicket, wicket_type, dismissed_id, fielder_id, is_legal, commentary)
    VALUES (@id, @innings_id, @over_number, @ball_in_over, @ball_sequence, @batsman_id, @non_striker_id,
      @bowler_id, @runs_batsman, @extra_type, @extra_runs, @is_wicket, @wicket_type, @dismissed_id, @fielder_id, @is_legal, @commentary)
  `).run({
    id: ballId,
    innings_id: inningsId,
    over_number: overNumber,
    ball_in_over: ballInOver,
    ball_sequence: ballSequence,
    batsman_id: innings.striker_id,
    non_striker_id: innings.non_striker_id,
    bowler_id: innings.current_bowler_id,
    runs_batsman: batsmanRuns,
    extra_type,
    extra_runs: payload.extra_runs || 0,
    is_wicket: is_wicket ? 1 : 0,
    wicket_type,
    dismissed_id,
    fielder_id,
    is_legal: isLegal,
    commentary,
  });

  // Update innings aggregates
  const extraCol = { wide: 'extras_wide', noball: 'extras_noball', bye: 'extras_bye', legbye: 'extras_legbye', penalty: 'extras_penalty' }[extra_type];
  const newTotalBalls = innings.total_balls + (isLegal ? 1 : 0);
  const newTotalRuns = innings.total_runs + teamRuns;
  const newTotalWickets = innings.total_wickets + (is_wicket ? 1 : 0);

  let newStriker = innings.striker_id;
  let newNonStriker = innings.non_striker_id;

  // Wicket: the dismissed player leaves the crease (needs replacement via set-batsmen)
  if (is_wicket && dismissed_id) {
    if (dismissed_id === newStriker) newStriker = null;
    else if (dismissed_id === newNonStriker) newNonStriker = null;
  } else if (runsRun % 2 === 1) {
    // Odd runs run -> strike rotates
    [newStriker, newNonStriker] = [newNonStriker, newStriker];
  }

  // End of over -> strike rotates (unless a wicket already left a batsman not-set) and bowler must be reselected
  let newBowler = innings.current_bowler_id;
  const overJustCompleted = isLegal && newTotalBalls % 6 === 0 && newTotalBalls > innings.total_balls;
  if (overJustCompleted) {
    if (newStriker && newNonStriker) {
      [newStriker, newNonStriker] = [newNonStriker, newStriker];
    }
    newBowler = null; // force explicit bowler selection for the next over
  }

  await db.prepare(`
    UPDATE innings SET
      total_runs = @total_runs,
      total_wickets = @total_wickets,
      total_balls = @total_balls,
      ${extraCol ? `${extraCol} = ${extraCol} + @extraAmt,` : ''}
      striker_id = @striker_id,
      non_striker_id = @non_striker_id,
      current_bowler_id = @current_bowler_id
    WHERE id = @id
  `).run({
    total_runs: newTotalRuns,
    total_wickets: newTotalWickets,
    total_balls: newTotalBalls,
    extraAmt: payload.extra_runs || 0,
    striker_id: newStriker,
    non_striker_id: newNonStriker,
    current_bowler_id: newBowler,
    id: inningsId,
  });

  await checkAndFinalizeInnings(inningsId);

  return { ballId, overJustCompleted };
}

/** Remove the last ball recorded and fully recompute innings aggregates from scratch (safe & drift-free). */
async function undoLastBall(inningsId) {
  const last = await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence DESC LIMIT 1').get(inningsId);
  if (!last) throw new Error('No balls to undo');
  await db.prepare('DELETE FROM balls WHERE id = ?').run(last.id);
  await recomputeInningsFromBalls(inningsId);
  // Un-complete the innings if it had been marked complete
  await db.prepare('UPDATE innings SET is_completed = 0 WHERE id = ?').run(inningsId);
  return { removedBallId: last.id };
}

/** Replays every ball in an innings in order to rebuild aggregate totals + current batsmen/bowler state. */
async function recomputeInningsFromBalls(inningsId) {
  const innings = await getInnings(inningsId);
  const balls = await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence ASC').all(inningsId);

  let totalRuns = 0, totalWickets = 0, totalBalls = 0;
  const extras = { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0 };
  let striker = null, nonStriker = null, bowler = null;

  // Seed striker/non-striker/bowler from the very first ball, if any
  if (balls.length > 0) {
    striker = balls[0].batsman_id;
    nonStriker = balls[0].non_striker_id;
    bowler = balls[0].bowler_id;
  }

  for (const b of balls) {
    const effect = computeRunEffects({ runs: b.runs_batsman, extra_type: b.extra_type, extra_runs: b.extra_runs });
    totalRuns += effect.teamRuns;
    totalBalls += b.is_legal ? 1 : 0;
    if (b.is_wicket) totalWickets += 1;
    if (b.extra_type) extras[b.extra_type] += b.extra_runs;

    striker = b.batsman_id;
    nonStriker = b.non_striker_id;
    bowler = b.bowler_id;

    if (b.is_wicket && b.dismissed_id) {
      if (b.dismissed_id === striker) striker = null;
      else if (b.dismissed_id === nonStriker) nonStriker = null;
    } else if (effect.runsRun % 2 === 1) {
      [striker, nonStriker] = [nonStriker, striker];
    }

    if (b.is_legal && totalBalls % 6 === 0) {
      if (striker && nonStriker) [striker, nonStriker] = [nonStriker, striker];
      bowler = null;
    }
  }

  await db.prepare(`
    UPDATE innings SET total_runs=?, total_wickets=?, total_balls=?,
      extras_wide=?, extras_noball=?, extras_bye=?, extras_legbye=?, extras_penalty=?,
      striker_id=?, non_striker_id=?, current_bowler_id=?
    WHERE id = ?
  `).run(totalRuns, totalWickets, totalBalls, extras.wide, extras.noball, extras.bye, extras.legbye, extras.penalty,
    striker, nonStriker, bowler, inningsId);
}

/** Checks all-out / overs-completed / target-reached conditions and closes out the innings/match as needed. */
async function checkAndFinalizeInnings(inningsId) {
  const innings = await getInnings(inningsId);
  const match = await getMatch(innings.match_id);

  const maxBalls = match.overs_limit * 6;
  const allOut = innings.total_wickets >= MAX_WICKETS;
  const oversDone = innings.total_balls >= maxBalls;
  const targetReached = innings.target != null && innings.total_runs >= innings.target;

  if (allOut || oversDone || targetReached) {
    await db.prepare('UPDATE innings SET is_completed = 1 WHERE id = ?').run(inningsId);

    if (innings.innings_number >= 2 || match.overs_limit === 0) {
      await finalizeMatch(match.id);
    } else {
      // First innings done -> mark match still live, waiting for 2nd innings to be started via API
      await db.prepare('UPDATE matches SET status = ? WHERE id = ?').run('innings-break', match.id);
    }
  }
}

async function finalizeMatch(matchId) {
  const match = await getMatch(matchId);
  const allInnings = await db.prepare('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number ASC').all(matchId);
  const inn1 = allInnings.find(i => i.innings_number === 1);
  const inn2 = allInnings.find(i => i.innings_number === 2);
  if (!inn1 || !inn2) return;

  const team1 = await db.prepare('SELECT * FROM teams WHERE id = ?').get(inn1.batting_team_id);
  const team2 = await db.prepare('SELECT * FROM teams WHERE id = ?').get(inn2.batting_team_id);

  let resultText, winnerId = null;
  if (inn2.total_runs > inn1.total_runs) {
    const wicketsInHand = MAX_WICKETS - inn2.total_wickets;
    resultText = `${team2.name} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`;
    winnerId = team2.id;
  } else if (inn1.total_runs > inn2.total_runs) {
    const margin = inn1.total_runs - inn2.total_runs;
    resultText = `${team1.name} won by ${margin} run${margin === 1 ? '' : 's'}`;
    winnerId = team1.id;
  } else {
    resultText = 'Match tied';
  }

  await db.prepare('UPDATE matches SET status = ?, result_text = ?, winner_id = ? WHERE id = ?').run('completed', resultText, winnerId, matchId);
}

/** Full batting scorecard for an innings, derived entirely from the balls table. */
async function computeBattingScorecard(inningsId) {
  const balls = await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence ASC').all(inningsId);
  const stats = {}; // player_id -> stats
  const order = [];

  const ensure = (id) => {
    if (!stats[id]) {
      stats[id] = { player_id: id, runs: 0, balls: 0, fours: 0, sixes: 0, is_out: false, how_out: null, dismissed_by: null };
      order.push(id);
    }
    return stats[id];
  };

  for (const b of balls) {
    const s = ensure(b.batsman_id);
    ensure(b.non_striker_id);
    if (b.extra_type !== 'wide') s.balls += 1; // wides don't count as a faced ball
    if (!b.extra_type || b.extra_type === 'noball') {
      s.runs += b.runs_batsman;
      if (b.runs_batsman === 4) s.fours += 1;
      if (b.runs_batsman === 6) s.sixes += 1;
    }
    if (b.is_wicket && b.dismissed_id) {
      const d = ensure(b.dismissed_id);
      d.is_out = true;
      d.how_out = b.wicket_type;
      d.dismissed_by = b.bowler_id;
      d.fielder_id = b.fielder_id;
    }
  }

  return order.map(id => {
    const s = stats[id];
    return { ...s, strike_rate: s.balls > 0 ? Number(((s.runs / s.balls) * 100).toFixed(2)) : 0 };
  });
}

/** Full bowling scorecard for an innings, derived entirely from the balls table. */
async function computeBowlingScorecard(inningsId) {
  const balls = await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence ASC').all(inningsId);
  const stats = {};
  const order = [];
  const overRuns = {}; // bowler_id -> { overNumber -> runs } for maiden detection

  const ensure = (id) => {
    if (!stats[id]) {
      stats[id] = { player_id: id, legalBalls: 0, runs: 0, wickets: 0, maidens: 0 };
      overRuns[id] = {};
      order.push(id);
    }
    return stats[id];
  };

  for (const b of balls) {
    const s = ensure(b.bowler_id);
    const effect = computeRunEffects({ runs: b.runs_batsman, extra_type: b.extra_type, extra_runs: b.extra_runs });
    if (b.is_legal) s.legalBalls += 1;
    // Byes/leg-byes are not charged against the bowler
    const chargedRuns = (b.extra_type === 'bye' || b.extra_type === 'legbye') ? 0 : effect.teamRuns;
    s.runs += chargedRuns;
    if (b.is_wicket && b.wicket_type && b.wicket_type !== 'run-out') s.wickets += 1;

    if (!overRuns[b.bowler_id][b.over_number]) overRuns[b.bowler_id][b.over_number] = 0;
    overRuns[b.bowler_id][b.over_number] += chargedRuns;
  }

  return order.map(id => {
    const s = stats[id];
    const overs = Object.entries(overRuns[id]);
    const maidens = overs.filter(([, runs]) => runs === 0).length;
    const completedOvers = Math.floor(s.legalBalls / 6);
    const ballsRem = s.legalBalls % 6;
    return {
      player_id: id,
      overs: `${completedOvers}.${ballsRem}`,
      runs: s.runs,
      wickets: s.wickets,
      maidens,
      economy: s.legalBalls > 0 ? Number((s.runs / (s.legalBalls / 6)).toFixed(2)) : 0,
    };
  });
}

/** Runs/balls added since the last wicket (or innings start) — the current batting partnership. */
async function computeCurrentPartnership(inningsId) {
  const balls = await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence ASC').all(inningsId);
  let runs = 0, ballsFaced = 0;
  for (const b of balls) {
    if (b.is_wicket) { runs = 0; ballsFaced = 0; continue; }
    const effect = computeRunEffects({ runs: b.runs_batsman, extra_type: b.extra_type, extra_runs: b.extra_runs });
    runs += effect.teamRuns;
    if (b.is_legal || b.extra_type === 'noball') ballsFaced += (b.extra_type === 'wide' ? 0 : 1);
  }
  return { runs, balls: ballsFaced };
}

async function getScoreboard(inningsId) {
  const innings = await getInnings(inningsId);
  if (!innings) return null;
  const battingCard = await computeBattingScorecard(inningsId);
  const bowlingCard = await computeBowlingScorecard(inningsId);
  const recentBalls = (await db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence DESC LIMIT 12').all(inningsId)).reverse();
  return {
    innings,
    overs: oversStr(innings.total_balls),
    battingCard,
    bowlingCard,
    recentBalls,
    partnership: await computeCurrentPartnership(inningsId),
    runRate: innings.total_balls > 0 ? Number((innings.total_runs / (innings.total_balls / 6)).toFixed(2)) : 0,
  };
}

/**
 * Career batting numbers for a player, aggregated across every innings/match
 * ever recorded — not just one innings. Computed straight from the balls log.
 */
async function computeCareerBattingStats(playerId) {
  const balls = await db.prepare('SELECT * FROM balls WHERE batsman_id = ?').all(playerId);

  let runs = 0, ballsFaced = 0, fours = 0, sixes = 0;
  for (const b of balls) {
    if (b.extra_type !== 'wide') ballsFaced += 1; // wides aren't a faced ball
    if (!b.extra_type || b.extra_type === 'noball') {
      runs += b.runs_batsman;
      if (b.runs_batsman === 4) fours += 1;
      if (b.runs_batsman === 6) sixes += 1;
    }
  }

  const timesOut = (await db.prepare('SELECT COUNT(*) AS c FROM balls WHERE dismissed_id = ? AND is_wicket = 1').get(playerId)).c;
  const inningsBatted = await db.prepare(
    'SELECT COUNT(DISTINCT innings_id) AS c FROM balls WHERE batsman_id = ? OR non_striker_id = ?'
  ).get(playerId, playerId).c;

  return {
    innings_batted: inningsBatted,
    runs,
    balls_faced: ballsFaced,
    fours,
    sixes,
    times_out: timesOut,
    not_outs: Math.max(0, inningsBatted - timesOut),
    strike_rate: ballsFaced > 0 ? Number(((runs / ballsFaced) * 100).toFixed(2)) : 0,
    average: timesOut > 0 ? Number((runs / timesOut).toFixed(2)) : runs,
  };
}

/**
 * Career bowling numbers for a player, aggregated across every innings/match
 * ever recorded.
 */
async function computeCareerBowlingStats(playerId) {
  const balls = await db.prepare('SELECT * FROM balls WHERE bowler_id = ?').all(playerId);

  let legalBalls = 0, runs = 0, wickets = 0, foursGiven = 0, sixesGiven = 0;
  for (const b of balls) {
    const effect = computeRunEffects({ runs: b.runs_batsman, extra_type: b.extra_type, extra_runs: b.extra_runs });
    if (b.is_legal) legalBalls += 1;
    const chargedRuns = (b.extra_type === 'bye' || b.extra_type === 'legbye') ? 0 : effect.teamRuns;
    runs += chargedRuns;
    if (b.is_wicket && b.wicket_type && b.wicket_type !== 'run-out') wickets += 1;
    if ((!b.extra_type || b.extra_type === 'noball') && b.runs_batsman === 4) foursGiven += 1;
    if ((!b.extra_type || b.extra_type === 'noball') && b.runs_batsman === 6) sixesGiven += 1;
  }

  const inningsBowled = (await db.prepare('SELECT COUNT(DISTINCT innings_id) AS c FROM balls WHERE bowler_id = ?').get(playerId)).c;
  const completedOvers = Math.floor(legalBalls / 6);
  const ballsRem = legalBalls % 6;

  return {
    innings_bowled: inningsBowled,
    overs: `${completedOvers}.${ballsRem}`,
    balls_bowled: legalBalls,
    runs_given: runs,
    wickets,
    fours_given: foursGiven,
    sixes_given: sixesGiven,
    economy: legalBalls > 0 ? Number((runs / (legalBalls / 6)).toFixed(2)) : 0,
  };
}

async function getPlayerCareerStats(playerId) {
  return {
    batting: await computeCareerBattingStats(playerId),
    bowling: await computeCareerBowlingStats(playerId),
  };
}

/**
 * All-time leaderboards across every match ever scored: highest individual score,
 * best bowling figures in an innings, and career-total leaderboards for both disciplines.
 */
async function getAllTimeRecords() {
  const inningsRows = await db.prepare('SELECT id, match_id FROM innings').all();

  let highestScore = null;
  let bestBowling = null;

  for (const inn of inningsRows) {
    for (const b of await computeBattingScorecard(inn.id)) {
      if (!highestScore || b.runs > highestScore.runs) {
        highestScore = { player_id: b.player_id, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, strike_rate: b.strike_rate, innings_id: inn.id, match_id: inn.match_id };
      }
    }
    for (const b of await computeBowlingScorecard(inn.id)) {
      const better = !bestBowling || b.wickets > bestBowling.wickets || (b.wickets === bestBowling.wickets && b.runs < bestBowling.runs);
      if (better) {
        bestBowling = { player_id: b.player_id, wickets: b.wickets, runs: b.runs, overs: b.overs, economy: b.economy, innings_id: inn.id, match_id: inn.match_id };
      }
    }
  }

  const batsmanIds = (await db.prepare('SELECT DISTINCT batsman_id AS id FROM balls').all()).map(r => r.id);
  const bowlerIds = (await db.prepare('SELECT DISTINCT bowler_id AS id FROM balls').all()).map(r => r.id);

  const battingLeaders = await Promise.all(batsmanIds.map(async id => ({ player_id: id, ...await computeCareerBattingStats(id) })));
  const bowlingLeaders = await Promise.all(bowlerIds.map(async id => ({ player_id: id, ...await computeCareerBowlingStats(id) })));

  const topBy = (arr, key, n = 10) => [...arr].sort((a, b) => b[key] - a[key]).slice(0, n);

  return {
    highestScore,
    bestBowling,
    mostRuns: topBy(battingLeaders, 'runs'),
    mostFours: topBy(battingLeaders, 'fours'),
    mostSixes: topBy(battingLeaders, 'sixes'),
    mostBallsFaced: topBy(battingLeaders, 'balls_faced'),
    bestStrikeRate: topBy(battingLeaders.filter(b => b.balls_faced >= 10), 'strike_rate'),
    mostWickets: topBy(bowlingLeaders, 'wickets'),
    mostBallsBowled: topBy(bowlingLeaders, 'balls_bowled'),
    bestEconomy: [...bowlingLeaders.filter(b => b.balls_bowled >= 12)].sort((a, b) => a.economy - b.economy).slice(0, 10),
  };
}

module.exports = {
  MAX_WICKETS,
  oversStr,
  recordBall,
  undoLastBall,
  computeBattingScorecard,
  computeBowlingScorecard,
  getScoreboard,
  finalizeMatch,
  checkAndFinalizeInnings,
  computeCareerBattingStats,
  computeCareerBowlingStats,
  getPlayerCareerStats,
  getAllTimeRecords,
};
