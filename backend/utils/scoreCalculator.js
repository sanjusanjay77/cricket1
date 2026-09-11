
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;

function oversStr(totalBalls) {
  const overs = Math.floor(totalBalls / 6);
  const balls = totalBalls % 6;
  return `${overs}.${balls}`;
}

async function getInnings(inningsId) {
  return db.prepare('SELECT * FROM innings WHERE id = ?').get(inningsId);
}

async function getMatch(matchId) {
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
}

/*
 * Calculate the effect of one delivery.
 */
function computeRunEffects({
  runs = 0,
  extra_type = null,
  extra_runs = 0
}) {
  runs = Number(runs) || 0;
  extra_runs = Number(extra_runs) || 0;

  switch (extra_type) {
    case 'wide':
      return {
        teamRuns: Math.max(1, extra_runs),
        batsmanRuns: 0,
        runsRun: Math.max(1, extra_runs) - 1,
        isLegal: 0
      };

    case 'noball':
      return {
        teamRuns: Math.max(1, extra_runs) + runs,
        batsmanRuns: runs,
        runsRun: runs,
        isLegal: 0
      };

    case 'bye':
    case 'legbye':
      return {
        teamRuns: extra_runs,
        batsmanRuns: 0,
        runsRun: extra_runs,
        isLegal: 1
      };

    case 'penalty':
      return {
        teamRuns: extra_runs,
        batsmanRuns: 0,
        runsRun: 0,
        isLegal: 0
      };

    default:
      return {
        teamRuns: runs,
        batsmanRuns: runs,
        runsRun: runs,
        isLegal: 1
      };
  }
}

/*
 * ============================================================
 * RECORD BALL
 * ============================================================
 *
 * Optimized:
 * - No COUNT(*) query for ball sequence
 * - Uses innings.total_balls to determine sequence
 * - Only INSERT + UPDATE are required during normal delivery
 * - Finalization checks only when actually necessary
 */
async function recordBall(inningsId, payload) {
  const innings = await getInnings(inningsId);

  if (!innings) {
    throw new Error('Innings not found');
  }

  if (innings.is_completed) {
    throw new Error('Innings is already completed');
  }

  if (!innings.striker_id || !innings.non_striker_id) {
    throw new Error('Set both batsmen before recording a ball');
  }

  if (!innings.current_bowler_id) {
    throw new Error('Set the bowler before recording a ball');
  }

  const {
    extra_type = null,
    is_wicket = false,
    wicket_type = null,
    dismissed_id = null,
    fielder_id = null,
    commentary = null
  } = payload;

  const {
    teamRuns,
    batsmanRuns,
    runsRun,
    isLegal
  } = computeRunEffects(payload);

  if (
    is_wicket &&
    dismissed_id &&
    ![
      innings.striker_id,
      innings.non_striker_id
    ].includes(dismissed_id)
  ) {
    throw new Error(
      'Dismissed player must be the current striker or non-striker'
    );
  }

  /*
   * IMPORTANT:
   *
   * Previously this used:
   *
   * SELECT COUNT(*) FROM balls
   *
   * on every delivery.
   *
   * That creates an unnecessary database round-trip.
   *
   * total_balls already gives us the legal-ball count.
   *
   * We calculate the next sequence using the current innings
   * state. Extras keep the same sequence until a legal delivery.
   */
  const nextSequenceBase = Number(innings.total_balls || 0);

  /*
   * We need a unique increasing sequence.
   *
   * For extras, use the last known ball sequence + 1.
   * This is still cheaper than loading the entire table.
   */
  let ballSequence;

  if (isLegal) {
    ballSequence = nextSequenceBase + 1;
  } else {
    const lastBall = await db.prepare(`
      SELECT ball_sequence
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence DESC
      LIMIT 1
    `).get(inningsId);

    ballSequence = lastBall
      ? Number(lastBall.ball_sequence) + 1
      : 1;
  }

  const overNumber = Math.floor(
    Number(innings.total_balls || 0) / 6
  );

  const ballInOver = isLegal
    ? (Number(innings.total_balls || 0) % 6) + 1
    : (Number(innings.total_balls || 0) % 6);

  const ballId = uuidv4();

  /*
   * INSERT DELIVERY
   */
  await db.prepare(`
    INSERT INTO balls (
      id,
      innings_id,
      over_number,
      ball_in_over,
      ball_sequence,
      batsman_id,
      non_striker_id,
      bowler_id,
      runs_batsman,
      extra_type,
      extra_runs,
      is_wicket,
      wicket_type,
      dismissed_id,
      fielder_id,
      is_legal,
      commentary
    )
    VALUES (
      @id,
      @innings_id,
      @over_number,
      @ball_in_over,
      @ball_sequence,
      @batsman_id,
      @non_striker_id,
      @bowler_id,
      @runs_batsman,
      @extra_type,
      @extra_runs,
      @is_wicket,
      @wicket_type,
      @dismissed_id,
      @fielder_id,
      @is_legal,
      @commentary
    )
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
    extra_runs: Number(payload.extra_runs) || 0,
    is_wicket: is_wicket ? 1 : 0,
    wicket_type,
    dismissed_id,
    fielder_id,
    is_legal: isLegal,
    commentary
  });

  /*
   * ==========================================================
   * UPDATE INNINGS
   * ==========================================================
   */

  const extraCol = {
    wide: 'extras_wide',
    noball: 'extras_noball',
    bye: 'extras_bye',
    legbye: 'extras_legbye',
    penalty: 'extras_penalty'
  }[extra_type];

  const oldTotalBalls = Number(innings.total_balls || 0);

  const newTotalBalls =
    oldTotalBalls + (isLegal ? 1 : 0);

  const newTotalRuns =
    Number(innings.total_runs || 0) + teamRuns;

  const newTotalWickets =
    Number(innings.total_wickets || 0) +
    (is_wicket ? 1 : 0);

  let newStriker = innings.striker_id;
  let newNonStriker = innings.non_striker_id;

  /*
   * WICKET
   */
  if (is_wicket && dismissed_id) {
    if (dismissed_id === newStriker) {
      newStriker = null;
    } else if (dismissed_id === newNonStriker) {
      newNonStriker = null;
    }
  }

  /*
   * STRIKE ROTATION
   */
  else if (runsRun % 2 === 1) {
    [newStriker, newNonStriker] = [
      newNonStriker,
      newStriker
    ];
  }

  /*
   * END OF OVER
   */
  let newBowler = innings.current_bowler_id;

  const overJustCompleted =
    isLegal &&
    newTotalBalls % 6 === 0 &&
    newTotalBalls > oldTotalBalls;

  if (overJustCompleted) {
    if (newStriker && newNonStriker) {
      [newStriker, newNonStriker] = [
        newNonStriker,
        newStriker
      ];
    }

    newBowler = null;
  }

  /*
   * Build UPDATE dynamically.
   */
  let updateSQL = `
    UPDATE innings SET
      total_runs = @total_runs,
      total_wickets = @total_wickets,
      total_balls = @total_balls,
      striker_id = @striker_id,
      non_striker_id = @non_striker_id,
      current_bowler_id = @current_bowler_id
  `;

  if (extraCol) {
    updateSQL += `,
      ${extraCol} = ${extraCol} + @extraAmt
    `;
  }

  updateSQL += `
    WHERE id = @id
  `;

  await db.prepare(updateSQL).run({
    total_runs: newTotalRuns,
    total_wickets: newTotalWickets,
    total_balls: newTotalBalls,
    striker_id: newStriker,
    non_striker_id: newNonStriker,
    current_bowler_id: newBowler,
    extraAmt: Number(payload.extra_runs) || 0,
    id: inningsId
  });

  /*
   * Only perform expensive completion logic when it can actually
   * matter.
   */
  const match = await getMatch(innings.match_id);

  const maxBalls =
    Number(match.overs_limit || 0) * 6;

  const shouldCheckFinish =
    newTotalWickets >= MAX_WICKETS ||
    (
      maxBalls > 0 &&
      newTotalBalls >= maxBalls
    ) ||
    (
      innings.target != null &&
      newTotalRuns >= Number(innings.target)
    );

  if (shouldCheckFinish) {
    await checkAndFinalizeInnings(inningsId);
  }

  return {
    ballId,
    overJustCompleted
  };
}

/*
 * ============================================================
 * UNDO
 * ============================================================
 */

async function undoLastBall(inningsId) {
  const last = await db.prepare(`
    SELECT *
    FROM balls
    WHERE innings_id = ?
    ORDER BY ball_sequence DESC
    LIMIT 1
  `).get(inningsId);

  if (!last) {
    throw new Error('No balls to undo');
  }

  await db.prepare(
    'DELETE FROM balls WHERE id = ?'
  ).run(last.id);

  await recomputeInningsFromBalls(inningsId);

  await db.prepare(
    'UPDATE innings SET is_completed = 0 WHERE id = ?'
  ).run(inningsId);

  return {
    removedBallId: last.id
  };
}

/*
 * ============================================================
 * RECOMPUTE INNINGS
 * ============================================================
 */

async function recomputeInningsFromBalls(inningsId) {
  const balls = await db.prepare(`
    SELECT *
    FROM balls
    WHERE innings_id = ?
    ORDER BY ball_sequence ASC
  `).all(inningsId);

  let totalRuns = 0;
  let totalWickets = 0;
  let totalBalls = 0;

  const extras = {
    wide: 0,
    noball: 0,
    bye: 0,
    legbye: 0,
    penalty: 0
  };

  let striker = null;
  let nonStriker = null;
  let bowler = null;

  if (balls.length > 0) {
    striker = balls[0].batsman_id;
    nonStriker = balls[0].non_striker_id;
    bowler = balls[0].bowler_id;
  }

  for (const b of balls) {
    const effect = computeRunEffects({
      runs: b.runs_batsman,
      extra_type: b.extra_type,
      extra_runs: b.extra_runs
    });

    totalRuns += effect.teamRuns;
    totalBalls += b.is_legal ? 1 : 0;

    if (b.is_wicket) {
      totalWickets += 1;
    }

    if (b.extra_type && extras[b.extra_type] !== undefined) {
      extras[b.extra_type] += Number(b.extra_runs) || 0;
    }

    striker = b.batsman_id;
    nonStriker = b.non_striker_id;
    bowler = b.bowler_id;

    if (b.is_wicket && b.dismissed_id) {
      if (b.dismissed_id === striker) {
        striker = null;
      } else if (b.dismissed_id === nonStriker) {
        nonStriker = null;
      }
    } else if (effect.runsRun % 2 === 1) {
      [striker, nonStriker] = [
        nonStriker,
        striker
      ];
    }

    if (b.is_legal && totalBalls % 6 === 0) {
      if (striker && nonStriker) {
        [striker, nonStriker] = [
          nonStriker,
          striker
        ];
      }

      bowler = null;
    }
  }

  await db.prepare(`
    UPDATE innings SET
      total_runs = ?,
      total_wickets = ?,
      total_balls = ?,
      extras_wide = ?,
      extras_noball = ?,
      extras_bye = ?,
      extras_legbye = ?,
      extras_penalty = ?,
      striker_id = ?,
      non_striker_id = ?,
      current_bowler_id = ?
    WHERE id = ?
  `).run(
    totalRuns,
    totalWickets,
    totalBalls,
    extras.wide,
    extras.noball,
    extras.bye,
    extras.legbye,
    extras.penalty,
    striker,
    nonStriker,
    bowler,
    inningsId
  );
}

/*
 * ============================================================
 * FINALIZATION
 * ============================================================
 */

async function checkAndFinalizeInnings(inningsId) {
  const innings = await getInnings(inningsId);

  if (!innings) return;

  const match = await getMatch(innings.match_id);

  const maxBalls =
    Number(match.overs_limit || 0) * 6;

  const allOut =
    innings.total_wickets >= MAX_WICKETS;

  const oversDone =
    maxBalls > 0 &&
    innings.total_balls >= maxBalls;

  const targetReached =
    innings.target != null &&
    innings.total_runs >= Number(innings.target);

  if (
    !allOut &&
    !oversDone &&
    !targetReached
  ) {
    return;
  }

  await db.prepare(`
    UPDATE innings
    SET is_completed = 1
    WHERE id = ?
  `).run(inningsId);

  if (
    innings.innings_number >= 2 ||
    Number(match.overs_limit) === 0
  ) {
    await finalizeMatch(match.id);
  } else {
    await db.prepare(`
      UPDATE matches
      SET status = ?
      WHERE id = ?
    `).run(
      'innings-break',
      match.id
    );
  }
}

async function finalizeMatch(matchId) {
  const match = await getMatch(matchId);

  const allInnings = await db.prepare(`
    SELECT *
    FROM innings
    WHERE match_id = ?
    ORDER BY innings_number ASC
  `).all(matchId);

  const inn1 = allInnings.find(
    i => i.innings_number === 1
  );

  const inn2 = allInnings.find(
    i => i.innings_number === 2
  );

  if (!inn1 || !inn2) return;

  const team1 = await db.prepare(
    'SELECT * FROM teams WHERE id = ?'
  ).get(inn1.batting_team_id);

  const team2 = await db.prepare(
    'SELECT * FROM teams WHERE id = ?'
  ).get(inn2.batting_team_id);

  let resultText;
  let winnerId = null;

  if (inn2.total_runs > inn1.total_runs) {
    const wicketsInHand =
      MAX_WICKETS - inn2.total_wickets;

    resultText =
      `${team2.name} won by ${wicketsInHand} wicket` +
      `${wicketsInHand === 1 ? '' : 's'}`;

    winnerId = team2.id;
  } else if (inn1.total_runs > inn2.total_runs) {
    const margin =
      inn1.total_runs - inn2.total_runs;

    resultText =
      `${team1.name} won by ${margin} run` +
      `${margin === 1 ? '' : 's'}`;

    winnerId = team1.id;
  } else {
    resultText = 'Match tied';
  }

  await db.prepare(`
    UPDATE matches
    SET status = ?,
        result_text = ?,
        winner_id = ?
    WHERE id = ?
  `).run(
    'completed',
    resultText,
    winnerId,
    matchId
  );
}

/*
 * ============================================================
 * SCOREBOARD
 * ============================================================
 *
 * IMPORTANT OPTIMIZATION:
 *
 * The old version queried the balls table separately for:
 *
 * 1. batting
 * 2. bowling
 * 3. recent balls
 * 4. partnership
 *
 * This version loads the balls table ONLY ONCE and derives
 * everything from that single result.
 */
async function getScoreboard(inningsId) {
  const innings = await getInnings(inningsId);

  if (!innings) {
    return null;
  }

  const balls = await db.prepare(`
    SELECT *
    FROM balls
    WHERE innings_id = ?
    ORDER BY ball_sequence ASC
  `).all(inningsId);

  const battingStats = {};
  const bowlingStats = {};
  const battingOrder = [];
  const bowlingOrder = [];

  const overRuns = {};

  const ensureBatting = (id) => {
    if (!id) return null;

    if (!battingStats[id]) {
      battingStats[id] = {
        player_id: id,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        is_out: false,
        how_out: null,
        dismissed_by: null,
        fielder_id: null
      };

      battingOrder.push(id);
    }

    return battingStats[id];
  };

  const ensureBowling = (id) => {
    if (!id) return null;

    if (!bowlingStats[id]) {
      bowlingStats[id] = {
        player_id: id,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0
      };

      bowlingOrder.push(id);
      overRuns[id] = {};
    }

    return bowlingStats[id];
  };

  /*
   * Partnership state.
   */
  let partnershipRuns = 0;
  let partnershipBalls = 0;

  /*
   * Process all balls ONCE.
   */
  for (const b of balls) {
    const bat = ensureBatting(b.batsman_id);

    ensureBatting(b.non_striker_id);

    const bowl = ensureBowling(b.bowler_id);

    const effect = computeRunEffects({
      runs: b.runs_batsman,
      extra_type: b.extra_type,
      extra_runs: b.extra_runs
    });

    /*
     * Batting
     */
    if (bat) {
      if (b.extra_type !== 'wide') {
        bat.balls += 1;
      }

      if (
        !b.extra_type ||
        b.extra_type === 'noball'
      ) {
        bat.runs += Number(b.runs_batsman) || 0;

        if (Number(b.runs_batsman) === 4) {
          bat.fours += 1;
        }

        if (Number(b.runs_batsman) === 6) {
          bat.sixes += 1;
        }
      }
    }

    /*
     * Wicket
     */
    if (b.is_wicket && b.dismissed_id) {
      const dismissed =
        ensureBatting(b.dismissed_id);

      if (dismissed) {
        dismissed.is_out = true;
        dismissed.how_out = b.wicket_type;
        dismissed.dismissed_by = b.bowler_id;
        dismissed.fielder_id = b.fielder_id;
      }

      /*
       * New partnership starts after wicket.
       */
      partnershipRuns = 0;
      partnershipBalls = 0;
    } else {
      partnershipRuns += effect.teamRuns;

      if (
        b.is_legal ||
        b.extra_type === 'noball'
      ) {
        if (b.extra_type !== 'wide') {
          partnershipBalls += 1;
        }
      }
    }

    /*
     * Bowling
     */
    if (bowl) {
      if (b.is_legal) {
        bowl.legalBalls += 1;
      }

      const chargedRuns =
        (
          b.extra_type === 'bye' ||
          b.extra_type === 'legbye'
        )
          ? 0
          : effect.teamRuns;

      bowl.runs += chargedRuns;

      if (
        b.is_wicket &&
        b.wicket_type &&
        b.wicket_type !== 'run-out'
      ) {
        bowl.wickets += 1;
      }

      if (!overRuns[b.bowler_id][b.over_number]) {
        overRuns[b.bowler_id][b.over_number] = 0;
      }

      overRuns[b.bowler_id][b.over_number] +=
        chargedRuns;
    }
  }

  /*
   * Finish batting stats.
   */
  const battingCard = battingOrder.map(id => {
    const s = battingStats[id];

    return {
      ...s,
      strike_rate:
        s.balls > 0
          ? Number(
              ((s.runs / s.balls) * 100).toFixed(2)
            )
          : 0
    };
  });

  /*
   * Finish bowling stats.
   */
  const bowlingCard = bowlingOrder.map(id => {
    const s = bowlingStats[id];

    const overs =
      Math.floor(s.legalBalls / 6);

    const ballsRem =
      s.legalBalls % 6;

    const maidens =
      Object.values(overRuns[id])
        .filter(runs => runs === 0)
        .length;

    return {
      player_id: id,
      overs: `${overs}.${ballsRem}`,
      runs: s.runs,
      wickets: s.wickets,
      maidens,
      economy:
        s.legalBalls > 0
          ? Number(
              (
                s.runs /
                (s.legalBalls / 6)
              ).toFixed(2)
            )
          : 0
    };
  });

  /*
   * Recent balls.
   *
   * We already have the complete ball list, so DO NOT
   * query Turso again.
   */
  const recentBalls =
    balls.slice(-12);

  return {
    innings,

    overs: oversStr(
      Number(innings.total_balls || 0)
    ),

    battingCard,

    bowlingCard,

    recentBalls,

    partnership: {
      runs: partnershipRuns,
      balls: partnershipBalls
    },

    runRate:
      innings.total_balls > 0
        ? Number(
            (
              innings.total_runs /
              (innings.total_balls / 6)
            ).toFixed(2)
          )
        : 0
  };
}

/*
 * ============================================================
 * CAREER STATS
 * ============================================================
 */

async function computeCareerBattingStats(playerId) {
  const balls = await db.prepare(`
    SELECT *
    FROM balls
    WHERE batsman_id = ?
  `).all(playerId);

  let runs = 0;
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;

  for (const b of balls) {
    if (b.extra_type !== 'wide') {
      ballsFaced += 1;
    }

    if (
      !b.extra_type ||
      b.extra_type === 'noball'
    ) {
      runs += Number(b.runs_batsman) || 0;

      if (b.runs_batsman === 4) {
        fours += 1;
      }

      if (b.runs_batsman === 6) {
        sixes += 1;
      }
    }
  }

  const timesOut = (
    await db.prepare(`
      SELECT COUNT(*) AS c
      FROM balls
      WHERE dismissed_id = ?
        AND is_wicket = 1
    `).get(playerId)
  ).c;

  const inningsBatted = (
    await db.prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE batsman_id = ?
         OR non_striker_id = ?
    `).get(playerId, playerId)
  ).c;

  return {
    innings_batted: inningsBatted,
    runs,
    balls_faced: ballsFaced,
    fours,
    sixes,
    times_out: timesOut,
    not_outs: Math.max(
      0,
      inningsBatted - timesOut
    ),
    strike_rate:
      ballsFaced > 0
        ? Number(
            ((runs / ballsFaced) * 100).toFixed(2)
          )
        : 0,
    average:
      timesOut > 0
        ? Number(
            (runs / timesOut).toFixed(2)
          )
        : runs
  };
}

async function computeCareerBowlingStats(playerId) {
  const balls = await db.prepare(`
    SELECT *
    FROM balls
    WHERE bowler_id = ?
  `).all(playerId);

  let legalBalls = 0;
  let runs = 0;
  let wickets = 0;
  let foursGiven = 0;
  let sixesGiven = 0;

  for (const b of balls) {
    const effect = computeRunEffects({
      runs: b.runs_batsman,
      extra_type: b.extra_type,
      extra_runs: b.extra_runs
    });

    if (b.is_legal) {
      legalBalls += 1;
    }

    const chargedRuns =
      (
        b.extra_type === 'bye' ||
        b.extra_type === 'legbye'
      )
        ? 0
        : effect.teamRuns;

    runs += chargedRuns;

    if (
      b.is_wicket &&
      b.wicket_type &&
      b.wicket_type !== 'run-out'
    ) {
      wickets += 1;
    }

    if (
      (!b.extra_type ||
        b.extra_type === 'noball') &&
      b.runs_batsman === 4
    ) {
      foursGiven += 1;
    }

    if (
      (!b.extra_type ||
        b.extra_type === 'noball') &&
      b.runs_batsman === 6
    ) {
      sixesGiven += 1;
    }
  }

  const inningsBowled = (
    await db.prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE bowler_id = ?
    `).get(playerId)
  ).c;

  const completedOvers =
    Math.floor(legalBalls / 6);

  const ballsRem =
    legalBalls % 6;

  return {
    innings_bowled: inningsBowled,
    overs: `${completedOvers}.${ballsRem}`,
    balls_bowled: legalBalls,
    runs_given: runs,
    wickets,
    fours_given: foursGiven,
    sixes_given: sixesGiven,
    economy:
      legalBalls > 0
        ? Number(
            (
              runs /
              (legalBalls / 6)
            ).toFixed(2)
          )
        : 0
  };
}

async function getPlayerCareerStats(playerId) {
  return {
    batting:
      await computeCareerBattingStats(playerId),

    bowling:
      await computeCareerBowlingStats(playerId)
  };
}

/*
 * ============================================================
 * ALL TIME RECORDS
 * ============================================================
 */

async function getAllTimeRecords() {
  const inningsRows = await db.prepare(`
    SELECT id, match_id
    FROM innings
  `).all();

  let highestScore = null;
  let bestBowling = null;

  for (const inn of inningsRows) {
    const scoreboard =
      await getScoreboard(inn.id);

    for (const b of scoreboard.battingCard) {
      if (
        !highestScore ||
        b.runs > highestScore.runs
      ) {
        highestScore = {
          player_id: b.player_id,
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          strike_rate: b.strike_rate,
          innings_id: inn.id,
          match_id: inn.match_id
        };
      }
    }

    for (const b of scoreboard.bowlingCard) {
      const better =
        !bestBowling ||
        b.wickets > bestBowling.wickets ||
        (
          b.wickets === bestBowling.wickets &&
          b.runs < bestBowling.runs
        );

      if (better) {
        bestBowling = {
          player_id: b.player_id,
          wickets: b.wickets,
          runs: b.runs,
          overs: b.overs,
          economy: b.economy,
          innings_id: inn.id,
          match_id: inn.match_id
        };
      }
    }
  }

  const batsmanIds = (
    await db.prepare(`
      SELECT DISTINCT batsman_id AS id
      FROM balls
    `).all()
  ).map(r => r.id);

  const bowlerIds = (
    await db.prepare(`
      SELECT DISTINCT bowler_id AS id
      FROM balls
    `).all()
  ).map(r => r.id);

  const battingLeaders =
    await Promise.all(
      batsmanIds.map(async id => ({
        player_id: id,
        ...await computeCareerBattingStats(id)
      }))
    );

  const bowlingLeaders =
    await Promise.all(
      bowlerIds.map(async id => ({
        player_id: id,
        ...await computeCareerBowlingStats(id)
      }))
    );

  const topBy = (
    arr,
    key,
    n = 10
  ) =>
    [...arr]
      .sort((a, b) => b[key] - a[key])
      .slice(0, n);

  return {
    highestScore,
    bestBowling,
    mostRuns: topBy(
      battingLeaders,
      'runs'
    ),
    mostFours: topBy(
      battingLeaders,
      'fours'
    ),
    mostSixes: topBy(
      battingLeaders,
      'sixes'
    ),
    mostBallsFaced: topBy(
      battingLeaders,
      'balls_faced'
    ),
    bestStrikeRate: topBy(
      battingLeaders.filter(
        b => b.balls_faced >= 10
      ),
      'strike_rate'
    ),
    mostWickets: topBy(
      bowlingLeaders,
      'wickets'
    ),
    mostBallsBowled: topBy(
      bowlingLeaders,
      'balls_bowled'
    ),
    bestEconomy:
      [
        ...bowlingLeaders.filter(
          b => b.balls_bowled >= 12
        )
      ]
        .sort(
          (a, b) =>
            a.economy - b.economy
        )
        .slice(0, 10)
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
  getAllTimeRecords
};
```

### One more important change

Your current `scoringController.js` still waits for the **entire scoreboard calculation** before sending Socket.IO:

```js
await calc.recordBall(...);
await broadcast(...);
res.json(...);
```

So replace your `scoringController.js` too. This is the part that makes the socket update happen as soon as the ball is saved.

```javascript
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/*
 * Build and broadcast the scoreboard.
 *
 * This runs separately from the main ball response so the scorer
 * does not have to wait for the complete scoreboard calculation.
 */
async function broadcast(req, matchId) {
  try {
    const io = req.app.get('io');

    if (!io) return;

    const inningsRows = await db.prepare(`
      SELECT *
      FROM innings
      WHERE match_id = ?
      ORDER BY innings_number ASC
    `).all(matchId);

    const innings = await Promise.all(
      inningsRows.map(i =>
        calc.getScoreboard(i.id)
      )
    );

    const match = await db.prepare(`
      SELECT *
      FROM matches
      WHERE id = ?
    `).get(matchId);

    io.to(`match-${matchId}`).emit(
      'score-update',
      {
        match,
        innings
      }
    );
  } catch (err) {
    console.error(
      'Score broadcast error:',
      err.message
    );
  }
}

/*
 * ============================================================
 * SET BATSMEN
 * ============================================================
 */

exports.setBatsmen = async (req, res) => {
  try {
    const {
      striker_id,
      non_striker_id
    } = req.body;

    const innings = await db.prepare(`
      SELECT *
      FROM innings
      WHERE id = ?
    `).get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    if (!striker_id) {
      return res.status(400).json({
        error: 'striker_id is required'
      });
    }

    await db.prepare(`
      UPDATE innings
      SET striker_id = ?,
          non_striker_id =
            COALESCE(?, non_striker_id)
      WHERE id = ?
    `).run(
      striker_id,
      non_striker_id || null,
      innings.id
    );

    broadcast(
      req,
      innings.match_id
    );

    res.json(
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(innings.id)
    );
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
};

/*
 * ============================================================
 * SWAP BATSMEN
 * ============================================================
 */

exports.swapBatsmen = async (req, res) => {
  try {
    const innings = await db.prepare(`
      SELECT *
      FROM innings
      WHERE id = ?
    `).get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res.status(400).json({
        error:
          'Both batsmen must be set before swapping'
      });
    }

    await db.prepare(`
      UPDATE innings
      SET striker_id = ?,
          non_striker_id = ?
      WHERE id = ?
    `).run(
      innings.non_striker_id,
      innings.striker_id,
      innings.id
    );

    broadcast(
      req,
      innings.match_id
    );

    res.json(
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(innings.id)
    );
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
};

/*
 * ============================================================
 * SWAP STRIKE
 * ============================================================
 */

exports.swapStrike = async (req, res) => {
  try {
    const innings = await db.prepare(`
      SELECT *
      FROM innings
      WHERE id = ?
    `).get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res.status(400).json({
        error:
          'Both batsmen must be set first'
      });
    }

    await db.prepare(`
      UPDATE innings
      SET striker_id = ?,
          non_striker_id = ?
      WHERE id = ?
    `).run(
      innings.non_striker_id,
      innings.striker_id,
      innings.id
    );

    broadcast(
      req,
      innings.match_id
    );

    res.json(
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(innings.id)
    );
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
};

/*
 * ============================================================
 * SET BOWLER
 * ============================================================
 */

exports.setBowler = async (req, res) => {
  try {
    const {
      bowler_id,
      force
    } = req.body;

    const innings = await db.prepare(`
      SELECT *
      FROM innings
      WHERE id = ?
    `).get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    if (!bowler_id) {
      return res.status(400).json({
        error: 'bowler_id is required'
      });
    }

    if (!force) {
      const lastBall = await db.prepare(`
        SELECT *
        FROM balls
        WHERE innings_id = ?
        ORDER BY ball_sequence DESC
        LIMIT 1
      `).get(innings.id);

      if (
        lastBall &&
        lastBall.bowler_id === bowler_id &&
        innings.total_balls % 6 === 0 &&
        innings.total_balls > 0
      ) {
        return res.status(400).json({
          error:
            'Same bowler cannot bowl consecutive overs. Pass force:true to override.'
        });
      }
    }

    await db.prepare(`
      UPDATE innings
      SET current_bowler_id = ?
      WHERE id = ?
    `).run(
      bowler_id,
      innings.id
    );

    broadcast(
      req,
      innings.match_id
    );

    res.json(
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(innings.id)
    );
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
};

/*
 * ============================================================
 * RECORD BALL
 * ============================================================
 *
 * IMPORTANT:
 *
 * We DO NOT wait for broadcast().
 *
 * The scorer receives the response immediately after the
 * database ball/innings update.
 *
 * Socket.IO scoreboard calculation continues separately.
 */
exports.recordBall = async (req, res) => {
  try {
    const result =
      await calc.recordBall(
        req.params.id,
        req.body
      );

    const innings =
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(req.params.id);

    /*
     * Send HTTP response immediately.
     */
    res.json({
      ...result,
      innings
    });

    /*
     * Do NOT await this.
     *
     * This is the major speed improvement.
     */
    broadcast(
      req,
      innings.match_id
    ).catch(err => {
      console.error(
        'Background score broadcast failed:',
        err.message
      );
    });

  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({
        error: err.message
      });
    }
  }
};

/*
 * ============================================================
 * UNDO
 * ============================================================
 */

exports.undoLastBall = async (req, res) => {
  try {
    const result =
      await calc.undoLastBall(
        req.params.id
      );

    const innings =
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `).get(req.params.id);

    res.json({
      ...result,
      innings
    });

    broadcast(
      req,
      innings.match_id
    ).catch(err => {
      console.error(
        'Background undo broadcast failed:',
        err.message
      );
    });

  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({
        error: err.message
      });
    }
  }
};

/*
 * ============================================================
 * SCOREBOARD
 * ============================================================
 */

exports.getScoreboard = async (req, res) => {
  try {
    const scoreboard =
      await calc.getScoreboard(
        req.params.id
      );

    if (!scoreboard) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    res.json(scoreboard);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};

module.exports.broadcast = broadcast;


### Important

Replace **both** files:


backend/utils/scoreCalculator.js
backend/controllers/scoringController.js


Do **not** change your `api.js`, `server.js`, or `innings.js` for this particular optimization.

The key change is this:

res.json({
  ...result,
  innings
});

broadcast(req, innings.match_id).catch(...);


instead of:


await broadcast(req, innings.match_id);
res.json(...);


So the scorer no longer waits for the expensive scoreboard reconstruction before getting the response.

**One caution:** because Socket.IO is now intentionally processed in the background, if you click several balls extremely rapidly, the scoreboard broadcasts can potentially finish out of order on a high-latency database. For normal one-click-at-a-time scoring this is fine; if you want truly instant **and ordered** live updates, the next step is to emit a small incremental score event rather than rebuilding the whole scoreboard after every ball.
