const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;

function oversStr(totalBalls) {
  const overs = Math.floor(Number(totalBalls || 0) / 6);
  const balls = Number(totalBalls || 0) % 6;
  return `${overs}.${balls}`;
}

async function getInnings(inningsId) {
  return db
    .prepare('SELECT * FROM innings WHERE id = ?')
    .get(inningsId);
}

async function getMatch(matchId) {
  return db
    .prepare('SELECT * FROM matches WHERE id = ?')
    .get(matchId);
}

function normalizeExtraType(extra_type) {
  if (!extra_type) return null;

  if (extra_type === 'no_ball') return 'noball';
  if (extra_type === 'leg_bye') return 'legbye';

  return extra_type;
}

function computeRunEffects({
  runs = 0,
  extra_type = null,
  extra_runs = 0
}) {
  runs = Number(runs) || 0;
  extra_runs = Number(extra_runs) || 0;

  extra_type = normalizeExtraType(extra_type);

  switch (extra_type) {
    case 'wide':
      return {
        teamRuns: Math.max(1, extra_runs || 1),
        batsmanRuns: 0,
        runsRun: 0,
        isLegal: 0
      };

    case 'noball':
      return {
        teamRuns: Math.max(1, extra_runs || 1) + runs,
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

async function recordBall(inningsId, payload = {}) {
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

  const extra_type = normalizeExtraType(
    payload.extra_type || payload.extraType || null
  );

  const is_wicket = Boolean(
    payload.is_wicket ||
    payload.wicket_type ||
    payload.wicket
  );

  const wicket_type = payload.wicket_type || null;

  const dismissed_id =
    payload.dismissed_id ||
    payload.dismissed_player_id ||
    null;

  const fielder_id = payload.fielder_id || null;

  const commentary = payload.commentary || null;

  const runs = Number(payload.runs || 0);

  const extra_runs = Number(payload.extra_runs || 0);

  const effect = computeRunEffects({
    runs,
    extra_type,
    extra_runs
  });

  const {
    teamRuns,
    batsmanRuns,
    runsRun,
    isLegal
  } = effect;

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

  const oldTotalBalls =
    Number(innings.total_balls || 0);

  const newTotalBalls =
    oldTotalBalls +
    (isLegal ? 1 : 0);

  let ballSequence;

  if (isLegal) {
    ballSequence = newTotalBalls;
  } else {
    const lastBall = await db
      .prepare(`
        SELECT ball_sequence
        FROM balls
        WHERE innings_id = ?
        ORDER BY ball_sequence DESC
        LIMIT 1
      `)
      .get(inningsId);

    ballSequence =
      lastBall
        ? Number(lastBall.ball_sequence) + 1
        : 1;
  }

  const overNumber =
    Math.floor(oldTotalBalls / 6);

  const ballInOver =
    isLegal
      ? (oldTotalBalls % 6) + 1
      : (oldTotalBalls % 6);

  const ballId = uuidv4();

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
    extra_runs,
    is_wicket: is_wicket ? 1 : 0,
    wicket_type,
    dismissed_id,
    fielder_id,
    is_legal: isLegal,
    commentary
  });

  const extraColumn = {
    wide: 'extras_wide',
    noball: 'extras_noball',
    bye: 'extras_bye',
    legbye: 'extras_legbye',
    penalty: 'extras_penalty'
  }[extra_type];

  const newTotalRuns =
    Number(innings.total_runs || 0) +
    teamRuns;

  const newTotalWickets =
    Number(innings.total_wickets || 0) +
    (is_wicket ? 1 : 0);

  let newStriker = innings.striker_id;
  let newNonStriker = innings.non_striker_id;

  if (is_wicket && dismissed_id) {
    if (dismissed_id === newStriker) {
      newStriker = null;
    }

    if (dismissed_id === newNonStriker) {
      newNonStriker = null;
    }
  } else if (runsRun % 2 === 1) {
    [
      newStriker,
      newNonStriker
    ] = [
      newNonStriker,
      newStriker
    ];
  }

  let newBowler = innings.current_bowler_id;

  const overJustCompleted =
    isLegal &&
    newTotalBalls % 6 === 0 &&
    newTotalBalls > oldTotalBalls;

  if (overJustCompleted) {
    if (newStriker && newNonStriker) {
      [
        newStriker,
        newNonStriker
      ] = [
        newNonStriker,
        newStriker
      ];
    }

    newBowler = null;
  }

  let updateSQL = `
    UPDATE innings SET
      total_runs = @total_runs,
      total_wickets = @total_wickets,
      total_balls = @total_balls,
      striker_id = @striker_id,
      non_striker_id = @non_striker_id,
      current_bowler_id = @current_bowler_id
  `;

  if (extraColumn) {
    updateSQL += `,
      ${extraColumn} =
        COALESCE(${extraColumn}, 0) + @extraAmt
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
    extraAmt: extra_runs,
    id: inningsId
  });

  const match = await getMatch(innings.match_id);

  const maxBalls =
    Number(match?.overs_limit || 0) * 6;

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
    overJustCompleted,
    innings: {
      ...innings,
      total_runs: newTotalRuns,
      total_wickets: newTotalWickets,
      total_balls: newTotalBalls,
      striker_id: newStriker,
      non_striker_id: newNonStriker,
      current_bowler_id: newBowler
    }
  };
}

async function undoLastBall(inningsId) {
  const last = await db
    .prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence DESC
      LIMIT 1
    `)
    .get(inningsId);

  if (!last) {
    throw new Error('No balls to undo');
  }

  await db
    .prepare('DELETE FROM balls WHERE id = ?')
    .run(last.id);

  await recomputeInningsFromBalls(inningsId);

  await db.prepare(`
    UPDATE innings
    SET is_completed = 0
    WHERE id = ?
  `).run(inningsId);

  return {
    removedBallId: last.id
  };
}

async function recomputeInningsFromBalls(inningsId) {
  const balls = await db
    .prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `)
    .all(inningsId);

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

  for (const ball of balls) {
    const effect = computeRunEffects({
      runs: ball.runs_batsman,
      extra_type: ball.extra_type,
      extra_runs: ball.extra_runs
    });

    totalRuns += effect.teamRuns;

    if (ball.is_legal) {
      totalBalls += 1;
    }

    if (ball.is_wicket) {
      totalWickets += 1;
    }

    if (
      ball.extra_type &&
      extras[ball.extra_type] !== undefined
    ) {
      extras[ball.extra_type] +=
        Number(ball.extra_runs || 0);
    }

    striker = ball.batsman_id;
    nonStriker = ball.non_striker_id;
    bowler = ball.bowler_id;

    if (
      ball.is_wicket &&
      ball.dismissed_id
    ) {
      if (ball.dismissed_id === striker) {
        striker = null;
      }

      if (ball.dismissed_id === nonStriker) {
        nonStriker = null;
      }
    } else if (effect.runsRun % 2 === 1) {
      [
        striker,
        nonStriker
      ] = [
        nonStriker,
        striker
      ];
    }

    if (
      ball.is_legal &&
      totalBalls % 6 === 0
    ) {
      if (striker && nonStriker) {
        [
          striker,
          nonStriker
        ] = [
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

async function checkAndFinalizeInnings(inningsId) {
  const innings = await getInnings(inningsId);

  if (!innings) return;

  const match = await getMatch(innings.match_id);

  if (!match) return;

  const maxBalls =
    Number(match.overs_limit || 0) * 6;

  const allOut =
    Number(innings.total_wickets || 0) >=
    MAX_WICKETS;

  const oversDone =
    maxBalls > 0 &&
    Number(innings.total_balls || 0) >= maxBalls;

  const targetReached =
    innings.target != null &&
    Number(innings.total_runs || 0) >=
      Number(innings.target);

  if (
    !allOut &&
    !oversDone &&
    !targetReached
  ) {
    return;
  }

  await db.prepare(`
    UPDATE innings
    SET is_completed = 1,
        current_bowler_id = NULL
    WHERE id = ?
  `).run(inningsId);

  if (
    Number(innings.innings_number || 1) >= 2
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

  if (!match) return;

  const allInnings = await db
    .prepare(`
      SELECT *
      FROM innings
      WHERE match_id = ?
      ORDER BY innings_number ASC
    `)
    .all(matchId);

  const inn1 = allInnings.find(
    i => Number(i.innings_number) === 1
  );

  const inn2 = allInnings.find(
    i => Number(i.innings_number) === 2
  );

  if (!inn1 || !inn2) return;

  const team1 = await db
    .prepare('SELECT * FROM teams WHERE id = ?')
    .get(inn1.batting_team_id);

  const team2 = await db
    .prepare('SELECT * FROM teams WHERE id = ?')
    .get(inn2.batting_team_id);

  if (!team1 || !team2) return;

  let resultText;
  let winnerId = null;

  const score1 =
    Number(inn1.total_runs || 0);

  const score2 =
    Number(inn2.total_runs || 0);

  const wickets2 =
    Number(inn2.total_wickets || 0);

  if (score2 > score1) {
    const wicketsInHand =
      Math.max(
        0,
        MAX_WICKETS - wickets2
      );

    resultText =
      `${team2.name} won by ${wicketsInHand} wicket` +
      `${wicketsInHand === 1 ? '' : 's'}`;

    winnerId = team2.id;
  } else if (score1 > score2) {
    const margin = score1 - score2;

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

async function getScoreboard(inningsId) {
  const innings = await getInnings(inningsId);

  if (!innings) {
    return null;
  }

  const balls = await db
    .prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `)
    .all(inningsId);

  const battingStats = {};
  const bowlingStats = {};

  const battingOrder = [];
  const bowlingOrder = [];

  const overRuns = {};

  function ensureBatting(id) {
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
  }

  function ensureBowling(id) {
    if (!id) return null;

    if (!bowlingStats[id]) {
      bowlingStats[id] = {
        player_id: id,
        legalBalls: 0,
        runs: 0,
        wickets: 0
      };

      bowlingOrder.push(id);
      overRuns[id] = {};
    }

    return bowlingStats[id];
  }

  for (const ball of balls) {
    const bat = ensureBatting(ball.batsman_id);

    ensureBatting(ball.non_striker_id);

    const bowl = ensureBowling(ball.bowler_id);

    const effect = computeRunEffects({
      runs: ball.runs_batsman,
      extra_type: ball.extra_type,
      extra_runs: ball.extra_runs
    });

    if (bat) {
      if (ball.extra_type !== 'wide') {
        bat.balls += 1;
      }

      if (
        !ball.extra_type ||
        ball.extra_type === 'noball'
      ) {
        const batRuns =
          Number(ball.runs_batsman || 0);

        bat.runs += batRuns;

        if (batRuns === 4) {
          bat.fours += 1;
        }

        if (batRuns === 6) {
          bat.sixes += 1;
        }
      }
    }

    if (
      ball.is_wicket &&
      ball.dismissed_id
    ) {
      const dismissed =
        ensureBatting(ball.dismissed_id);

      if (dismissed) {
        dismissed.is_out = true;
        dismissed.how_out = ball.wicket_type;
        dismissed.dismissed_by = ball.bowler_id;
        dismissed.fielder_id = ball.fielder_id;
      }
    }

    if (bowl) {
      if (ball.is_legal) {
        bowl.legalBalls += 1;
      }

      const chargedRuns =
        (
          ball.extra_type === 'bye' ||
          ball.extra_type === 'legbye'
        )
          ? 0
          : effect.teamRuns;

      bowl.runs += chargedRuns;

      if (
        ball.is_wicket &&
        ball.wicket_type &&
        ball.wicket_type !== 'run-out'
      ) {
        bowl.wickets += 1;
      }

      if (
        !overRuns[ball.bowler_id][ball.over_number]
      ) {
        overRuns[ball.bowler_id][ball.over_number] = 0;
      }

      overRuns[ball.bowler_id][ball.over_number] +=
        chargedRuns;
    }
  }

  const battingCard = battingOrder.map(id => {
    const stat = battingStats[id];

    return {
      ...stat,
      strike_rate:
        stat.balls > 0
          ? Number(
              (
                (stat.runs / stat.balls) *
                100
              ).toFixed(2)
            )
          : 0
    };
  });

  const bowlingCard = bowlingOrder.map(id => {
    const stat = bowlingStats[id];

    const overs =
      Math.floor(stat.legalBalls / 6);

    const ballsRemaining =
      stat.legalBalls % 6;

    const maidens =
      Object.values(
        overRuns[id] || {}
      ).filter(
        runs => runs === 0
      ).length;

    return {
      player_id: id,
      overs: `${overs}.${ballsRemaining}`,
      runs: stat.runs,
      wickets: stat.wickets,
      maidens,
      economy:
        stat.legalBalls > 0
          ? Number(
              (
                stat.runs /
                (stat.legalBalls / 6)
              ).toFixed(2)
            )
          : 0
    };
  });

  const recentBalls = balls.slice(-12);

  let partnershipRuns = 0;
  let partnershipBalls = 0;

  for (
    let i = balls.length - 1;
    i >= 0;
    i--
  ) {
    const ball = balls[i];

    if (
      ball.is_wicket &&
      ball.dismissed_id
    ) {
      break;
    }

    const effect = computeRunEffects({
      runs: ball.runs_batsman,
      extra_type: ball.extra_type,
      extra_runs: ball.extra_runs
    });

    partnershipRuns += effect.teamRuns;

    if (
      ball.is_legal &&
      ball.extra_type !== 'wide'
    ) {
      partnershipBalls += 1;
    }
  }

  const totalBalls =
    Number(innings.total_balls || 0);

  const totalRuns =
    Number(innings.total_runs || 0);

  return {
    innings,

    overs: oversStr(totalBalls),

    battingCard,

    bowlingCard,

    recentBalls,

    partnership: {
      runs: partnershipRuns,
      balls: partnershipBalls
    },

    runRate:
      totalBalls > 0
        ? Number(
            (
              totalRuns /
              (totalBalls / 6)
            ).toFixed(2)
          )
        : 0
  };
}

async function computeBattingScorecard(inningsId) {
  const scoreboard =
    await getScoreboard(inningsId);

  return scoreboard
    ? scoreboard.battingCard
    : [];
}

async function computeBowlingScorecard(inningsId) {
  const scoreboard =
    await getScoreboard(inningsId);

  return scoreboard
    ? scoreboard.bowlingCard
    : [];
}

async function computeCareerBattingStats(playerId) {
  const balls = await db
    .prepare(`
      SELECT *
      FROM balls
      WHERE batsman_id = ?
    `)
    .all(playerId);

  let runs = 0;
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;

  for (const ball of balls) {
    if (ball.extra_type !== 'wide') {
      ballsFaced += 1;
    }

    if (
      !ball.extra_type ||
      ball.extra_type === 'noball'
    ) {
      const batRuns =
        Number(ball.runs_batsman || 0);

      runs += batRuns;

      if (batRuns === 4) {
        fours += 1;
      }

      if (batRuns === 6) {
        sixes += 1;
      }
    }
  }

  const outRow = await db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM balls
      WHERE dismissed_id = ?
        AND is_wicket = 1
    `)
    .get(playerId);

  const inningsRow = await db
    .prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE batsman_id = ?
         OR non_striker_id = ?
    `)
    .get(
      playerId,
      playerId
    );

  const timesOut =
    Number(outRow?.c || 0);

  const inningsBatted =
    Number(inningsRow?.c || 0);

  return {
    innings_batted: inningsBatted,
    runs,
    balls_faced: ballsFaced,
    fours,
    sixes,
    times_out: timesOut,

    not_outs:
      Math.max(
        0,
        inningsBatted - timesOut
      ),

    strike_rate:
      ballsFaced > 0
        ? Number(
            (
              (runs / ballsFaced) *
              100
            ).toFixed(2)
          )
        : 0,

    average:
      timesOut > 0
        ? Number(
            (
              runs / timesOut
            ).toFixed(2)
          )
        : runs
  };
}

async function computeCareerBowlingStats(playerId) {
  const balls = await db
    .prepare(`
      SELECT *
      FROM balls
      WHERE bowler_id = ?
    `)
    .all(playerId);

  let legalBalls = 0;
  let runs = 0;
  let wickets = 0;
  let foursGiven = 0;
  let sixesGiven = 0;

  for (const ball of balls) {
    const effect = computeRunEffects({
      runs: ball.runs_batsman,
      extra_type: ball.extra_type,
      extra_runs: ball.extra_runs
    });

    if (ball.is_legal) {
      legalBalls += 1;
    }

    const chargedRuns =
      (
        ball.extra_type === 'bye' ||
        ball.extra_type === 'legbye'
      )
        ? 0
        : effect.teamRuns;

    runs += chargedRuns;

    if (
      ball.is_wicket &&
      ball.wicket_type &&
      ball.wicket_type !== 'run-out'
    ) {
      wickets += 1;
    }

    if (
      (
        !ball.extra_type ||
        ball.extra_type === 'noball'
      ) &&
      Number(ball.runs_batsman || 0) === 4
    ) {
      foursGiven += 1;
    }

    if (
      (
        !ball.extra_type ||
        ball.extra_type === 'noball'
      ) &&
      Number(ball.runs_batsman || 0) === 6
    ) {
      sixesGiven += 1;
    }
  }

  const inningsRow = await db
    .prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE bowler_id = ?
    `)
    .get(playerId);

  const inningsBowled =
    Number(inningsRow?.c || 0);

  const overs =
    Math.floor(legalBalls / 6);

  const ballsRemaining =
    legalBalls % 6;

  return {
    innings_bowled: inningsBowled,

    overs:
      `${overs}.${ballsRemaining}`,

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
      await computeCareerBattingStats(
        playerId
      ),

    bowling:
      await computeCareerBowlingStats(
        playerId
      )
  };
}

/*
====================================================
GCC ONLY - ALL TIME RECORDS
====================================================
*/

async function getAllTimeRecords() {

  /*
   * Get only players who belong to GCC.
   */
  const gccPlayers = await db
    .prepare(`
      SELECT DISTINCT
        tp.player_id AS id
      FROM team_players tp
      INNER JOIN teams t
        ON t.id = tp.team_id
      WHERE UPPER(TRIM(t.name)) = 'GCC'
    `)
    .all();

  const gccPlayerIds = new Set(
    gccPlayers
      .map(row => row.id)
      .filter(Boolean)
  );

  /*
   * If GCC has no players yet,
   * return empty records.
   */
  if (gccPlayerIds.size === 0) {
    return {
      highestScore: null,
      bestBowling: null,
      mostRuns: [],
      mostFours: [],
      mostSixes: [],
      mostBallsFaced: [],
      bestStrikeRate: [],
      mostWickets: [],
      mostBallsBowled: [],
      bestEconomy: []
    };
  }

  const inningsRows = await db
    .prepare(`
      SELECT id, match_id
      FROM innings
    `)
    .all();

  let highestScore = null;
  let bestBowling = null;

  /*
   * Highest GCC batting score
   * and best GCC bowling performance.
   */
  for (const innings of inningsRows) {

    const scoreboard =
      await getScoreboard(innings.id);

    if (!scoreboard) continue;

    /*
     * GCC batting only
     */
    for (const batting of scoreboard.battingCard) {

      if (
        !gccPlayerIds.has(
          batting.player_id
        )
      ) {
        continue;
      }

      if (
        !highestScore ||
        batting.runs >
          highestScore.runs
      ) {
        highestScore = {
          player_id:
            batting.player_id,

          runs:
            batting.runs,

          balls:
            batting.balls,

          fours:
            batting.fours,

          sixes:
            batting.sixes,

          strike_rate:
            batting.strike_rate,

          innings_id:
            innings.id,

          match_id:
            innings.match_id
        };
      }
    }

    /*
     * GCC bowling only
     */
    for (const bowling of scoreboard.bowlingCard) {

      if (
        !gccPlayerIds.has(
          bowling.player_id
        )
      ) {
        continue;
      }

      const better =
        !bestBowling ||
        bowling.wickets >
          bestBowling.wickets ||
        (
          bowling.wickets ===
            bestBowling.wickets &&
          bowling.runs <
            bestBowling.runs
        );

      if (better) {
        bestBowling = {
          player_id:
            bowling.player_id,

          wickets:
            bowling.wickets,

          runs:
            bowling.runs,

          overs:
            bowling.overs,

          economy:
            bowling.economy,

          innings_id:
            innings.id,

          match_id:
            innings.match_id
        };
      }
    }
  }

  /*
   * GCC batting leaders only
   */
  const battingLeaders =
    await Promise.all(
      [...gccPlayerIds].map(
        async playerId => ({
          player_id: playerId,

          ...await computeCareerBattingStats(
            playerId
          )
        })
      )
    );

  /*
   * GCC bowling leaders only
   */
  const bowlingLeaders =
    await Promise.all(
      [...gccPlayerIds].map(
        async playerId => ({
          player_id: playerId,

          ...await computeCareerBowlingStats(
            playerId
          )
        })
      )
    );

  const topBy = (
    array,
    key,
    count = 10
  ) =>
    [...array]
      .sort(
        (a, b) =>
          Number(b[key] || 0) -
          Number(a[key] || 0)
      )
      .slice(0, count);

  return {

    highestScore,

    bestBowling,

    /*
     * GCC batting records
     */
    mostRuns:
      topBy(
        battingLeaders,
        'runs'
      ),

    mostFours:
      topBy(
        battingLeaders,
        'fours'
      ),

    mostSixes:
      topBy(
        battingLeaders,
        'sixes'
      ),

    mostBallsFaced:
      topBy(
        battingLeaders,
        'balls_faced'
      ),

    bestStrikeRate:
      topBy(
        battingLeaders.filter(
          player =>
            player.balls_faced >= 10
        ),
        'strike_rate'
      ),

    /*
     * GCC bowling records
     */
    mostWickets:
      topBy(
        bowlingLeaders,
        'wickets'
      ),

    mostBallsBowled:
      topBy(
        bowlingLeaders,
        'balls_bowled'
      ),

    bestEconomy:
      [...bowlingLeaders]
        .filter(
          player =>
            player.balls_bowled >= 12
        )
        .sort(
          (a, b) =>
            Number(a.economy || 0) -
            Number(b.economy || 0)
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
