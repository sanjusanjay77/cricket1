const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;

/* =========================================================
   BASIC HELPERS
========================================================= */

function oversStr(totalBalls) {
  const balls = Number(totalBalls || 0);
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

async function getInnings(inningsId) {
  if (!inningsId) {
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM innings
    WHERE id = ?
  `).get(inningsId);
}

async function getMatch(matchId) {
  if (!matchId) {
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM matches
    WHERE id = ?
  `).get(matchId);
}

/* =========================================================
   RUN EFFECTS
========================================================= */

function computeRunEffects({
  runs = 0,
  extra_type = null,
  extra_runs = 0
}) {
  runs = Number(runs) || 0;
  extra_runs = Number(extra_runs) || 0;

  switch (extra_type) {

    case 'wide': {
      const totalWideRuns = Math.max(1, extra_runs);

      return {
        teamRuns: totalWideRuns,
        batsmanRuns: 0,
        runsRun: totalWideRuns - 1,
        isLegal: 0
      };
    }

    case 'noball': {
      const noBallExtra = Math.max(1, extra_runs);

      return {
        teamRuns: noBallExtra + runs,
        batsmanRuns: runs,
        runsRun: runs,
        isLegal: 0
      };
    }

    case 'bye': {
      const byeRuns = Math.max(0, extra_runs);

      return {
        teamRuns: byeRuns,
        batsmanRuns: 0,
        runsRun: byeRuns,
        isLegal: 1
      };
    }

    case 'legbye': {
      const legByeRuns = Math.max(0, extra_runs);

      return {
        teamRuns: legByeRuns,
        batsmanRuns: 0,
        runsRun: legByeRuns,
        isLegal: 1
      };
    }

    case 'penalty': {
      const penaltyRuns = Math.max(0, extra_runs);

      return {
        teamRuns: penaltyRuns,
        batsmanRuns: 0,
        runsRun: 0,
        isLegal: 0
      };
    }

    default:
      return {
        teamRuns: runs,
        batsmanRuns: runs,
        runsRun: runs,
        isLegal: 1
      };
  }
}

/* =========================================================
   BALL DISPLAY
========================================================= */

function getBallDisplay(ball) {
  if (!ball) {
    return '';
  }

  if (Number(ball.is_wicket) === 1) {
    return 'W';
  }

  const extraType = ball.extra_type;

  const batRuns = Number(ball.runs_batsman || 0);
  const extraRuns = Number(ball.extra_runs || 0);

  if (extraType === 'wide') {
    return extraRuns > 1
      ? `WD${extraRuns}`
      : 'WD';
  }

  if (extraType === 'noball') {
    return batRuns > 0
      ? `NB+${batRuns}`
      : 'NB';
  }

  if (extraType === 'bye') {
    return `B${extraRuns}`;
  }

  if (extraType === 'legbye') {
    return `LB${extraRuns}`;
  }

  if (extraType === 'penalty') {
    return `P${extraRuns}`;
  }

  return String(batRuns);
}

/* =========================================================
   FAST BALL NUMBER
========================================================= */

async function getNextBallSequence(inningsId) {
  const row = await db.prepare(`
    SELECT ball_sequence
    FROM balls
    WHERE innings_id = ?
    ORDER BY ball_sequence DESC
    LIMIT 1
  `).get(inningsId);

  return Number(row?.ball_sequence || 0) + 1;
}

/* =========================================================
   RECORD BALL
========================================================= */

async function recordBall(inningsId, payload = {}) {

  const innings = await getInnings(inningsId);

  if (!innings) {
    throw new Error('Innings not found');
  }

  if (Number(innings.is_completed)) {
    throw new Error('Innings is already completed');
  }

  if (!innings.striker_id || !innings.non_striker_id) {
    throw new Error(
      'Set both batsmen before recording a ball'
    );
  }

  if (!innings.current_bowler_id) {
    throw new Error(
      'Set the bowler before recording a ball'
    );
  }

  const extra_type =
    payload.extra_type || null;

  const is_wicket =
    Boolean(
      payload.is_wicket ||
      payload.wicket
    );

  const wicket_type =
    payload.wicket_type || null;

  const dismissed_id =
    payload.dismissed_id ||
    payload.dismissed_player_id ||
    null;

  const fielder_id =
    payload.fielder_id || null;

  const commentary =
    payload.commentary || null;

  const runs =
    Number(payload.runs || 0);

  const extra_runs =
    Number(payload.extra_runs || 0);

  const effect = computeRunEffects({
    runs,
    extra_type,
    extra_runs
  });

  const teamRuns = effect.teamRuns;
  const batsmanRuns = effect.batsmanRuns;
  const runsRun = effect.runsRun;
  const isLegal = effect.isLegal;

  /* -------------------------------------------------------
     WICKET VALIDATION
  ------------------------------------------------------- */

  if (is_wicket) {

    if (!dismissed_id) {
      throw new Error(
        'Dismissed player is required'
      );
    }

    if (
      ![
        innings.striker_id,
        innings.non_striker_id
      ].includes(dismissed_id)
    ) {
      throw new Error(
        'Dismissed player must be the current striker or non-striker'
      );
    }
  }

  /* -------------------------------------------------------
     BALL NUMBER
  ------------------------------------------------------- */

  const ballSequence =
    await getNextBallSequence(inningsId);

  const currentTotalBalls =
    Number(innings.total_balls || 0);

  const overNumber =
    Math.floor(currentTotalBalls / 6);

  const ballInOver =
    isLegal
      ? (currentTotalBalls % 6) + 1
      : (currentTotalBalls % 6);

  const ballId = uuidv4();

  /* -------------------------------------------------------
     INSERT BALL
  ------------------------------------------------------- */

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
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    ballId,
    inningsId,
    overNumber,
    ballInOver,
    ballSequence,
    innings.striker_id,
    innings.non_striker_id,
    innings.current_bowler_id,
    batsmanRuns,
    extra_type,
    extra_runs,
    is_wicket ? 1 : 0,
    wicket_type,
    dismissed_id,
    fielder_id,
    isLegal,
    commentary
  );

  /* -------------------------------------------------------
     NEW TOTALS
  ------------------------------------------------------- */

  const newTotalBalls =
    currentTotalBalls +
    (isLegal ? 1 : 0);

  const newTotalRuns =
    Number(innings.total_runs || 0) +
    teamRuns;

  const newTotalWickets =
    Number(innings.total_wickets || 0) +
    (is_wicket ? 1 : 0);

  let newStriker =
    innings.striker_id;

  let newNonStriker =
    innings.non_striker_id;

  /* -------------------------------------------------------
     STRIKE ROTATION
  ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     OVER COMPLETE
  ------------------------------------------------------- */

  const overJustCompleted =
    isLegal &&
    newTotalBalls > currentTotalBalls &&
    newTotalBalls % 6 === 0;

  let newBowler =
    innings.current_bowler_id;

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

  /* -------------------------------------------------------
     EXTRAS
  ------------------------------------------------------- */

  const extraColumn = {
    wide: 'extras_wide',
    noball: 'extras_noball',
    bye: 'extras_bye',
    legbye: 'extras_legbye',
    penalty: 'extras_penalty'
  }[extra_type];

  let updateSql = `
    UPDATE innings
    SET
      total_runs = ?,
      total_wickets = ?,
      total_balls = ?
  `;

  const updateParams = [
    newTotalRuns,
    newTotalWickets,
    newTotalBalls
  ];

  if (extraColumn) {

    const extrasToAdd =
      extra_type === 'wide'
        ? teamRuns
        : extra_runs;

    updateSql += `,
      ${extraColumn} =
        COALESCE(${extraColumn}, 0) + ?
    `;

    updateParams.push(extrasToAdd);
  }

  updateSql += `,
      striker_id = ?,
      non_striker_id = ?,
      current_bowler_id = ?
    WHERE id = ?
  `;

  updateParams.push(
    newStriker,
    newNonStriker,
    newBowler,
    inningsId
  );

  await db
    .prepare(updateSql)
    .run(...updateParams);

  /* -------------------------------------------------------
     FINALIZATION
  ------------------------------------------------------- */

  await checkAndFinalizeInnings(inningsId);

  const updatedInnings =
    await getInnings(inningsId);

  /* -------------------------------------------------------
     SAVED BALL
  ------------------------------------------------------- */

  const savedBall = {

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

    is_wicket:
      is_wicket ? 1 : 0,

    wicket_type,

    dismissed_id,

    fielder_id,

    is_legal: isLegal,

    commentary,

    display:
      getBallDisplay({
        is_wicket:
          is_wicket ? 1 : 0,

        extra_type,

        runs_batsman:
          batsmanRuns,

        extra_runs
      })
  };

  return {

    ballId,

    ball: savedBall,

    overJustCompleted,

    teamRuns,

    batsmanRuns,

    totalRuns:
      Number(
        updatedInnings?.total_runs ??
        newTotalRuns
      ),

    totalWickets:
      Number(
        updatedInnings?.total_wickets ??
        newTotalWickets
      ),

    totalBalls:
      Number(
        updatedInnings?.total_balls ??
        newTotalBalls
      ),

    innings:
      updatedInnings
  };
}

/* =========================================================
   UNDO
========================================================= */

async function undoLastBall(inningsId) {

  const last =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence DESC
      LIMIT 1
    `).get(inningsId);

  if (!last) {
    throw new Error('No balls to undo');
  }

  await db.prepare(`
    DELETE FROM balls
    WHERE id = ?
  `).run(last.id);

  await recomputeInningsFromBalls(inningsId);

  await db.prepare(`
    UPDATE innings
    SET is_completed = 0
    WHERE id = ?
  `).run(inningsId);

  const innings =
    await getInnings(inningsId);

  if (innings) {

    await db.prepare(`
      UPDATE matches
      SET status = 'live'
      WHERE id = ?
        AND status = 'innings-break'
    `).run(innings.match_id);
  }

  const updatedInnings =
    await getInnings(inningsId);

  return {
    removedBallId: last.id,
    innings: updatedInnings
  };
}

/* =========================================================
   RECOMPUTE INNINGS
========================================================= */

async function recomputeInningsFromBalls(inningsId) {

  const innings =
    await getInnings(inningsId);

  if (!innings) {
    throw new Error('Innings not found');
  }

  const balls =
    await db.prepare(`
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

    striker =
      balls[0].batsman_id;

    nonStriker =
      balls[0].non_striker_id;

    bowler =
      balls[0].bowler_id;
  }

  for (const b of balls) {

    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });

    totalRuns += effect.teamRuns;

    if (Number(b.is_legal) === 1) {
      totalBalls += 1;
    }

    if (Number(b.is_wicket) === 1) {
      totalWickets += 1;
    }

    if (
      b.extra_type &&
      Object.prototype.hasOwnProperty.call(
        extras,
        b.extra_type
      )
    ) {

      if (b.extra_type === 'wide') {

        extras.wide +=
          effect.teamRuns;

      } else {

        extras[b.extra_type] +=
          Number(b.extra_runs || 0);
      }
    }

    let ballStriker =
      b.batsman_id;

    let ballNonStriker =
      b.non_striker_id;

    if (
      Number(b.is_wicket) === 1 &&
      b.dismissed_id
    ) {

      if (
        b.dismissed_id ===
        ballStriker
      ) {

        ballStriker = null;

      } else if (
        b.dismissed_id ===
        ballNonStriker
      ) {

        ballNonStriker = null;
      }

    } else if (
      effect.runsRun % 2 === 1
    ) {

      [
        ballStriker,
        ballNonStriker
      ] = [
        ballNonStriker,
        ballStriker
      ];
    }

    striker =
      ballStriker;

    nonStriker =
      ballNonStriker;

    bowler =
      b.bowler_id;

    if (
      Number(b.is_legal) === 1 &&
      totalBalls % 6 === 0
    ) {

      if (
        striker &&
        nonStriker
      ) {

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
    UPDATE innings
    SET
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

/* =========================================================
   CHECK INNINGS
========================================================= */

async function checkAndFinalizeInnings(inningsId) {

  const innings =
    await getInnings(inningsId);

  if (!innings) {
    return;
  }

  const match =
    await getMatch(innings.match_id);

  if (!match) {
    return;
  }

  const maxBalls =
    Number(match.overs_limit || 0) * 6;

  const allOut =
    Number(innings.total_wickets || 0) >=
    MAX_WICKETS;

  const oversDone =
    maxBalls > 0 &&
    Number(innings.total_balls || 0) >=
    maxBalls;

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
    SET
      is_completed = 1,
      current_bowler_id = NULL
    WHERE id = ?
  `).run(inningsId);

  if (
    Number(innings.innings_number) >= 2
  ) {

    await finalizeMatch(match.id);

    return;
  }

  await db.prepare(`
    UPDATE matches
    SET
      status = 'innings-break',
      current_innings = 1
    WHERE id = ?
  `).run(match.id);
}

/* =========================================================
   FINALIZE MATCH
========================================================= */

async function finalizeMatch(matchId) {

  const match =
    await getMatch(matchId);

  if (!match) {
    console.error(
      'Cannot finalize match: match not found',
      matchId
    );

    return;
  }

  const allInnings =
    await db.prepare(`
      SELECT *
      FROM innings
      WHERE match_id = ?
      ORDER BY innings_number ASC
    `).all(matchId);

  const inn1 =
    allInnings.find(
      i =>
        Number(i.innings_number) === 1
    );

  const inn2 =
    allInnings.find(
      i =>
        Number(i.innings_number) === 2
    );

  if (!inn1 || !inn2) {

    console.error(
      'Cannot finalize match: innings missing',
      {
        matchId,
        inningsCount: allInnings.length
      }
    );

    return;
  }

  const team1 =
    inn1.batting_team_id
      ? await db.prepare(`
          SELECT *
          FROM teams
          WHERE id = ?
        `).get(inn1.batting_team_id)
      : null;

  const team2 =
    inn2.batting_team_id
      ? await db.prepare(`
          SELECT *
          FROM teams
          WHERE id = ?
        `).get(inn2.batting_team_id)
      : null;

  if (!team1 || !team2) {

    console.error(
      'Cannot finalize match: team not found',
      {
        matchId,

        innings1TeamId:
          inn1.batting_team_id || null,

        innings2TeamId:
          inn2.batting_team_id || null,

        team1Found:
          Boolean(team1),

        team2Found:
          Boolean(team2)
      }
    );

    return;
  }

  let resultText;
  let winnerId = null;

  if (
    Number(inn2.total_runs) >
    Number(inn1.total_runs)
  ) {

    const wickets =
      Math.max(
        0,
        MAX_WICKETS -
        Number(inn2.total_wickets || 0)
      );

    resultText =
      `${team2.name} won by ${wickets} wicket${wickets === 1 ? '' : 's'}`;

    winnerId =
      team2.id;

  } else if (
    Number(inn1.total_runs) >
    Number(inn2.total_runs)
  ) {

    const margin =
      Number(inn1.total_runs) -
      Number(inn2.total_runs);

    resultText =
      `${team1.name} won by ${margin} run${margin === 1 ? '' : 's'}`;

    winnerId =
      team1.id;

  } else {

    resultText =
      'Match tied';
  }

  await db.prepare(`
    UPDATE matches
    SET
      status = ?,
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

/* =========================================================
   BATTING SCORECARD BUILDER
========================================================= */

function buildBattingScorecard(balls) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  const stats = {};
  const order = [];

  function ensure(id) {

    if (!id) {
      return null;
    }

    const key = String(id);

    if (!stats[key]) {

      stats[key] = {

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

      order.push(key);
    }

    return stats[key];
  }

  for (const b of safeBalls) {

    const striker =
      ensure(b.batsman_id);

    ensure(b.non_striker_id);

    if (b.extra_type !== 'wide') {

      if (striker) {
        striker.balls += 1;
      }
    }

    if (
      !b.extra_type ||
      b.extra_type === 'noball'
    ) {

      const batRuns =
        Number(
          b.runs_batsman || 0
        );

      if (striker) {

        striker.runs += batRuns;

        if (batRuns === 4) {
          striker.fours += 1;
        }

        if (batRuns === 6) {
          striker.sixes += 1;
        }
      }
    }

    if (
      Number(b.is_wicket) === 1 &&
      b.dismissed_id
    ) {

      const dismissed =
        ensure(b.dismissed_id);

      if (dismissed) {

        dismissed.is_out = true;

        dismissed.how_out =
          b.wicket_type;

        dismissed.dismissed_by =
          b.bowler_id;

        dismissed.fielder_id =
          b.fielder_id;
      }
    }
  }

  return order.map(id => {

    const s = stats[id];

    return {

      ...s,

      strike_rate:
        s.balls > 0
          ? Number(
              (
                (s.runs / s.balls) *
                100
              ).toFixed(2)
            )
          : 0
    };
  });
}

/* =========================================================
   BOWLING SCORECARD BUILDER
========================================================= */

function buildBowlingScorecard(balls) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  const stats = {};
  const order = [];

  function ensure(id) {

    if (!id) {
      return null;
    }

    const key = String(id);

    if (!stats[key]) {

      stats[key] = {

        player_id: id,

        legalBalls: 0,

        runs: 0,

        wickets: 0,

        maidens: 0,

        overRuns: {}
      };

      order.push(key);
    }

    return stats[key];
  }

  for (const b of safeBalls) {

    const s =
      ensure(b.bowler_id);

    if (!s) {
      continue;
    }

    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });

    const legal =
      Number(b.is_legal) === 1;

    if (legal) {
      s.legalBalls += 1;
    }

    const chargedRuns =
      b.extra_type === 'bye' ||
      b.extra_type === 'legbye'
        ? 0
        : effect.teamRuns;

    s.runs += chargedRuns;

    if (
      Number(b.is_wicket) === 1 &&
      b.wicket_type &&
      b.wicket_type !== 'run-out'
    ) {

      s.wickets += 1;
    }

    const overNo =
      Number(b.over_number || 0);

    if (!s.overRuns[overNo]) {

      s.overRuns[overNo] = {
        runs: 0,
        legalBalls: 0
      };
    }

    s.overRuns[overNo].runs +=
      chargedRuns;

    if (legal) {
      s.overRuns[overNo].legalBalls += 1;
    }
  }

  return order.map(id => {

    const s = stats[id];

    const completedOvers =
      Math.floor(
        s.legalBalls / 6
      );

    const ballsRem =
      s.legalBalls % 6;

    let maidens = 0;

    for (
      const over of
      Object.values(s.overRuns)
    ) {

      if (
        over.legalBalls >= 6 &&
        over.runs === 0
      ) {

        maidens += 1;
      }
    }

    const economy =
      s.legalBalls > 0
        ? Number(
            (
              s.runs /
              (s.legalBalls / 6)
            ).toFixed(2)
          )
        : 0;

    return {

      player_id: id,

      legalBalls:
        s.legalBalls,

      balls:
        s.legalBalls,

      overs:
        `${completedOvers}.${ballsRem}`,

      runs:
        s.runs,

      wickets:
        s.wickets,

      maidens,

      economy
    };
  });
}

/* =========================================================
   CURRENT PARTNERSHIP
========================================================= */

function buildPartnership(balls) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  let runs = 0;
  let ballsFaced = 0;

  let startIndex = 0;

  for (
    let i = safeBalls.length - 1;
    i >= 0;
    i--
  ) {

    if (
      Number(
        safeBalls[i].is_wicket
      ) === 1
    ) {

      startIndex =
        i + 1;

      break;
    }
  }

  for (
    let i = startIndex;
    i < safeBalls.length;
    i++
  ) {

    const b =
      safeBalls[i];

    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });

    runs += effect.teamRuns;

    if (Number(b.is_legal) === 1) {
      ballsFaced += 1;
    }
  }

  return {
    runs,
    balls: ballsFaced
  };
}

/* =========================================================
   ALL PARTNERSHIPS
========================================================= */

function buildPartnerships(balls) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  const partnerships = [];

  if (safeBalls.length === 0) {
    return partnerships;
  }

  let partnershipRuns = 0;
  let partnershipBalls = 0;

  let batsman1Id = null;
  let batsman2Id = null;

  let partnershipNumber = 1;

  for (const b of safeBalls) {

    if (!batsman1Id || !batsman2Id) {

      batsman1Id =
        b.batsman_id;

      batsman2Id =
        b.non_striker_id;
    }

    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });

    partnershipRuns +=
      effect.teamRuns;

    if (Number(b.is_legal) === 1) {
      partnershipBalls += 1;
    }

    if (Number(b.is_wicket) === 1) {

      if (batsman1Id && batsman2Id) {

        partnerships.push({

          partnership_no:
            partnershipNumber,

          batsman1_id:
            batsman1Id,

          batsman2_id:
            batsman2Id,

          runs:
            partnershipRuns,

          balls:
            partnershipBalls,

          is_current:
            false
        });
      }

      partnershipNumber += 1;

      batsman1Id = null;
      batsman2Id = null;

      partnershipRuns = 0;
      partnershipBalls = 0;
    }
  }

  if (batsman1Id && batsman2Id) {

    partnerships.push({

      partnership_no:
        partnershipNumber,

      batsman1_id:
        batsman1Id,

      batsman2_id:
        batsman2Id,

      runs:
        partnershipRuns,

      balls:
        partnershipBalls,

      is_current:
        true
    });
  }

  return partnerships;
}

/* =========================================================
   FALL OF WICKETS
========================================================= */

function buildFallOfWickets(balls) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  const wickets = [];

  let totalRuns = 0;
  let legalBalls = 0;
  let wicketNumber = 0;

  for (const b of safeBalls) {

    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });

    totalRuns +=
      effect.teamRuns;

    if (Number(b.is_legal) === 1) {
      legalBalls += 1;
    }

    if (Number(b.is_wicket) === 1) {

      wicketNumber += 1;

      wickets.push({

        wicket_no:
          wicketNumber,

        score:
          totalRuns,

        overs:
          oversStr(legalBalls),

        player_id:
          b.dismissed_id,

        how_out:
          b.wicket_type || 'out',

        fielder_id:
          b.fielder_id || null
      });
    }
  }

  return wickets;
}

/* =========================================================
   CURRENT OVER
========================================================= */

function buildCurrentOver(
  balls,
  totalBalls
) {

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  let overNumber =
    Math.floor(
      Number(totalBalls || 0) / 6
    );

  if (
    Number(totalBalls || 0) > 0 &&
    Number(totalBalls) % 6 === 0
  ) {

    overNumber =
      Math.floor(
        Number(totalBalls) / 6
      ) - 1;
  }

  if (overNumber < 0) {
    return [];
  }

  return safeBalls
    .filter(
      b =>
        Number(b.over_number) ===
        overNumber
    )
    .map(
      b => ({
        ...b,
        display:
          getBallDisplay(b)
      })
    );
}

/* =========================================================
   EXTRAS
========================================================= */

function buildExtras(
  innings,
  balls
) {

  const safeInnings =
    innings || {};

  const safeBalls =
    Array.isArray(balls)
      ? balls
      : [];

  let wide =
    Number(
      safeInnings.extras_wide || 0
    );

  let noball =
    Number(
      safeInnings.extras_noball || 0
    );

  let bye =
    Number(
      safeInnings.extras_bye || 0
    );

  let legbye =
    Number(
      safeInnings.extras_legbye || 0
    );

  let penalty =
    Number(
      safeInnings.extras_penalty || 0
    );

  if (
    safeBalls.length > 0 &&
    wide === 0 &&
    noball === 0 &&
    bye === 0 &&
    legbye === 0 &&
    penalty === 0
  ) {

    wide = 0;
    noball = 0;
    bye = 0;
    legbye = 0;
    penalty = 0;

    for (const b of safeBalls) {

      const effect =
        computeRunEffects({
          runs: b.runs_batsman,
          extra_type: b.extra_type,
          extra_runs: b.extra_runs
        });

      switch (b.extra_type) {

        case 'wide':
          wide += effect.teamRuns;
          break;

        case 'noball':
          noball +=
            Number(b.extra_runs || 0);
          break;

        case 'bye':
          bye +=
            Number(b.extra_runs || 0);
          break;

        case 'legbye':
          legbye +=
            Number(b.extra_runs || 0);
          break;

        case 'penalty':
          penalty +=
            Number(b.extra_runs || 0);
          break;

        default:
          break;
      }
    }
  }

  const total =
    wide +
    noball +
    bye +
    legbye +
    penalty;

  return {
    wide,
    noball,
    bye,
    legbye,
    penalty,
    total
  };
}

/* =========================================================
   COMPATIBILITY FUNCTIONS
========================================================= */

async function computeBattingScorecard(inningsId) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(inningsId);

  return buildBattingScorecard(balls);
}

async function computeBowlingScorecard(inningsId) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(inningsId);

  return buildBowlingScorecard(balls);
}

async function computeCurrentPartnership(inningsId) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(inningsId);

  return buildPartnership(balls);
}

async function computeCurrentOver(
  inningsId,
  totalBalls
) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(inningsId);

  return buildCurrentOver(
    balls,
    totalBalls
  );
}

/* =========================================================
   FULL SCOREBOARD
   SAFE VERSION
========================================================= */

async function getScoreboard(inningsId) {

  if (!inningsId) {
    console.error(
      'getScoreboard: inningsId is missing'
    );

    return null;
  }

  const innings =
    await getInnings(inningsId);

  if (!innings) {

    console.error(
      'getScoreboard: innings not found',
      inningsId
    );

    return null;
  }

  const ballsResult =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(inningsId);

  const balls =
    Array.isArray(ballsResult)
      ? ballsResult
      : [];

  const battingCard =
    buildBattingScorecard(balls);

  const bowlingCard =
    buildBowlingScorecard(balls);

  const recentBalls =
    balls
      .slice(-18)
      .map(
        b => ({
          ...b,
          display:
            getBallDisplay(b)
        })
      );

  const currentOver =
    buildCurrentOver(
      balls,
      innings.total_balls
    );

  let currentBowler = null;

  if (innings.current_bowler_id) {

    const currentBowlerId =
      String(
        innings.current_bowler_id
      );

    currentBowler =
      bowlingCard.find(
        b =>
          b &&
          b.player_id != null &&
          String(b.player_id) ===
          currentBowlerId
      ) || null;
  }

  let striker = null;

  if (innings.striker_id) {

    const strikerId =
      String(
        innings.striker_id
      );

    striker =
      battingCard.find(
        b =>
          b &&
          b.player_id != null &&
          String(b.player_id) ===
          strikerId
      ) || null;
  }

  let nonStriker = null;

  if (innings.non_striker_id) {

    const nonStrikerId =
      String(
        innings.non_striker_id
      );

    nonStriker =
      battingCard.find(
        b =>
          b &&
          b.player_id != null &&
          String(b.player_id) ===
          nonStrikerId
      ) || null;
  }

  const ballsTotal =
    Number(
      innings.total_balls || 0
    );

  const totalRuns =
    Number(
      innings.total_runs || 0
    );

  const runRate =
    ballsTotal > 0
      ? Number(
          (
            totalRuns /
            (ballsTotal / 6)
          ).toFixed(2)
        )
      : 0;

  const extras =
    buildExtras(
      innings,
      balls
    );

  const partnership =
    buildPartnership(
      balls
    );

  const partnerships =
    buildPartnerships(
      balls
    );

  const fallOfWickets =
    buildFallOfWickets(
      balls
    );

  const currentOverNumber =
    ballsTotal === 0
      ? 0
      : Math.floor(
          (ballsTotal - 1) / 6
        );

  return {

    innings,

    overs:
      oversStr(
        innings.total_balls
      ),

    battingCard,

    bowlingCard,

    recentBalls,

    currentOver,

    currentOverBalls:
      currentOver,

    currentOverNumber,

    currentBowler,

    striker,

    nonStriker,

    partnership,

    partnerships,

    fallOfWickets,

    runRate,

    extras
  };
}

/* =========================================================
   CAREER BATTING
========================================================= */

async function computeCareerBattingStats(playerId) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE batsman_id = ?
      ORDER BY innings_id, ball_sequence ASC
    `).all(playerId);

  let runs = 0;
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;

  const inningsScores = {};

  for (const b of balls) {

    const inningsId =
      b.innings_id;

    if (!inningsScores[inningsId]) {
      inningsScores[inningsId] = 0;
    }

    if (
      b.extra_type !== 'wide'
    ) {

      ballsFaced += 1;
    }

    if (
      !b.extra_type ||
      b.extra_type === 'noball'
    ) {

      const batRuns =
        Number(
          b.runs_batsman || 0
        );

      runs += batRuns;

      inningsScores[inningsId] +=
        batRuns;

      if (batRuns === 4) {
        fours += 1;
      }

      if (batRuns === 6) {
        sixes += 1;
      }
    }
  }

  const inningsScoreValues =
    Object.values(
      inningsScores
    ).map(
      score =>
        Number(score || 0)
    );

  const highestScore =
    inningsScoreValues.length > 0
      ? Math.max(
          ...inningsScoreValues
        )
      : 0;

  const timesOutRow =
    await db.prepare(`
      SELECT COUNT(*) AS c
      FROM balls
      WHERE dismissed_id = ?
        AND is_wicket = 1
    `).get(playerId);

  const timesOut =
    Number(
      timesOutRow?.c || 0
    );

  const inningsBattedRow =
    await db.prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE batsman_id = ?
         OR non_striker_id = ?
    `).get(
      playerId,
      playerId
    );

  const inningsBatted =
    Number(
      inningsBattedRow?.c || 0
    );

  const notOuts =
    Math.max(
      0,
      inningsBatted -
      timesOut
    );

  const strikeRate =
    ballsFaced > 0
      ? Number(
          (
            (
              runs /
              ballsFaced
            ) * 100
          ).toFixed(2)
        )
      : 0;

  const average =
    timesOut > 0
      ? Number(
          (
            runs /
            timesOut
          ).toFixed(2)
        )
      : runs;

  return {

    innings_batted:
      inningsBatted,

    runs,

    highest_score:
      highestScore,

    balls_faced:
      ballsFaced,

    fours,

    sixes,

    times_out:
      timesOut,

    not_outs:
      notOuts,

    strike_rate:
      strikeRate,

    average
  };
}

/* =========================================================
   CAREER BOWLING
========================================================= */

async function computeCareerBowlingStats(
  playerId
) {

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE bowler_id = ?
      ORDER BY innings_id, ball_sequence ASC
    `).all(playerId);

  let legalBalls = 0;
  let runs = 0;
  let wickets = 0;
  let foursGiven = 0;
  let sixesGiven = 0;

  const inningsSet =
    new Set();

  for (const b of balls) {

    inningsSet.add(
      String(b.innings_id)
    );

    const effect =
      computeRunEffects({
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    if (
      Number(b.is_legal) === 1
    ) {

      legalBalls += 1;
    }

    const chargedRuns =
      b.extra_type ===
        'bye' ||
      b.extra_type ===
        'legbye'
        ? 0
        : effect.teamRuns;

    runs +=
      chargedRuns;

    if (
      Number(b.is_wicket) === 1 &&
      b.wicket_type &&
      b.wicket_type !==
        'run-out'
    ) {

      wickets += 1;
    }

    if (
      (
        !b.extra_type ||
        b.extra_type ===
          'noball'
      ) &&
      Number(
        b.runs_batsman
      ) === 4
    ) {

      foursGiven += 1;
    }

    if (
      (
        !b.extra_type ||
        b.extra_type ===
          'noball'
      ) &&
      Number(
        b.runs_batsman
      ) === 6
    ) {

      sixesGiven += 1;
    }
  }

  const inningsBowled =
    inningsSet.size;

  return {

    innings_bowled:
      inningsBowled,

    overs:
      oversStr(
        legalBalls
      ),

    balls_bowled:
      legalBalls,

    runs_given:
      runs,

    wickets,

    fours_given:
      foursGiven,

    sixes_given:
      sixesGiven,

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

/* =========================================================
   PLAYER CAREER
========================================================= */

async function getPlayerCareerStats(
  playerId
) {

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

/* =========================================================
   ALL TIME RECORDS — OPTIMIZED
========================================================= */

async function getAllTimeRecords() {

  /*
   * -------------------------------------------------------
   * LOAD GCC PLAYERS ONCE
   * -------------------------------------------------------
   */

  const gccPlayers =
    await db.prepare(`
      SELECT
        p.id,
        p.name,
        p.team_id,
        t.name AS team_name
      FROM players p
      LEFT JOIN teams t
        ON t.id = p.team_id
      WHERE LOWER(TRIM(t.name)) = 'gcc'
    `).all();

  const gccPlayerIds =
    new Set(
      gccPlayers.map(
        player => String(player.id)
      )
    );

  const playerMap =
    new Map(
      gccPlayers.map(
        player => [
          String(player.id),
          player
        ]
      )
    );

  /*
   * -------------------------------------------------------
   * LOAD INNINGS ONCE
   * -------------------------------------------------------
   */

  const inningsRows =
    await db.prepare(`
      SELECT
        id,
        match_id,
        batting_team_id,
        innings_number
      FROM innings
      ORDER BY
        match_id,
        innings_number
    `).all();

  const inningsMap =
    new Map(
      inningsRows.map(
        innings => [
          String(innings.id),
          innings
        ]
      )
    );

  /*
   * -------------------------------------------------------
   * LOAD BALLS ONCE
   *
   * This replaces the old repeated ball-table scans.
   * -------------------------------------------------------
   */

  const allBalls =
    await db.prepare(`
      SELECT
        b.*,
        i.match_id,
        i.innings_number,
        i.batting_team_id
      FROM balls b
      INNER JOIN innings i
        ON i.id = b.innings_id
      ORDER BY
        b.innings_id,
        b.ball_sequence
    `).all();

  /*
   * -------------------------------------------------------
   * CAREER STAT CONTAINERS
   * -------------------------------------------------------
   */

  const battingStats =
    new Map();

  const bowlingStats =
    new Map();

  function createBattingStats(playerId) {

    const key =
      String(playerId);

    if (!battingStats.has(key)) {

      battingStats.set(
        key,
        {
          player_id:
            playerId,

          inningsSet:
            new Set(),

          runs:
            0,

          balls_faced:
            0,

          fours:
            0,

          sixes:
            0,

          times_out:
            0,

          inningsScores:
            new Map()
        }
      );
    }

    return battingStats.get(key);
  }

  function createBowlingStats(playerId) {

    const key =
      String(playerId);

    if (!bowlingStats.has(key)) {

      bowlingStats.set(
        key,
        {
          player_id:
            playerId,

          inningsSet:
            new Set(),

          balls_bowled:
            0,

          runs_given:
            0,

          wickets:
            0,

          fours_given:
            0,

          sixes_given:
            0
        }
      );
    }

    return bowlingStats.get(key);
  }

  /*
   * Ensure every GCC player appears.
   */

  for (const player of gccPlayers) {

    createBattingStats(
      player.id
    );

    createBowlingStats(
      player.id
    );
  }

  /*
   * -------------------------------------------------------
   * SINGLE-INNINGS RECORD CONTAINERS
   * -------------------------------------------------------
   */

  const inningsBatting =
    new Map();

  const inningsBowling =
    new Map();

  function getInningsBattingStats(
    inningsId,
    playerId
  ) {

    const inningsKey =
      String(inningsId);

    const playerKey =
      String(playerId);

    if (
      !inningsBatting.has(
        inningsKey
      )
    ) {

      inningsBatting.set(
        inningsKey,
        new Map()
      );
    }

    const map =
      inningsBatting.get(
        inningsKey
      );

    if (
      !map.has(playerKey)
    ) {

      map.set(
        playerKey,
        {
          player_id:
            playerId,

          runs:
            0,

          balls:
            0,

          fours:
            0,

          sixes:
            0
        }
      );
    }

    return map.get(playerKey);
  }

  function getInningsBowlingStats(
    inningsId,
    playerId
  ) {

    const inningsKey =
      String(inningsId);

    const playerKey =
      String(playerId);

    if (
      !inningsBowling.has(
        inningsKey
      )
    ) {

      inningsBowling.set(
        inningsKey,
        new Map()
      );
    }

    const map =
      inningsBowling.get(
        inningsKey
      );

    if (
      !map.has(playerKey)
    ) {

      map.set(
        playerKey,
        {
          player_id:
            playerId,

          legalBalls:
            0,

          runs:
            0,

          wickets:
            0
        }
      );
    }

    return map.get(playerKey);
  }

  let bestBattingFigure =
    null;

  let bestBowling =
    null;

  /*
   * -------------------------------------------------------
   * ONE PASS THROUGH ALL BALLS
   * -------------------------------------------------------
   */

  for (const b of allBalls) {

    const inningsId =
      String(b.innings_id);

    const innings =
      inningsMap.get(
        inningsId
      );

    if (!innings) {
      continue;
    }

    /* =====================================================
       BATTING
    ===================================================== */

    const batsmanId =
      b.batsman_id;

    const batsmanKey =
      batsmanId != null
        ? String(batsmanId)
        : null;

    if (
      batsmanKey &&
      gccPlayerIds.has(
        batsmanKey
      )
    ) {

      const career =
        createBattingStats(
          batsmanId
        );

      career.inningsSet.add(
        inningsId
      );

      /*
       * Preserve current application behavior:
       * every non-wide delivery counts as a ball faced.
       */

      if (
        b.extra_type !== 'wide'
      ) {

        career.balls_faced += 1;
      }

      const inningBatting =
        getInningsBattingStats(
          inningsId,
          batsmanId
        );

      if (
        b.extra_type !== 'wide'
      ) {

        inningBatting.balls += 1;
      }

      if (
        !b.extra_type ||
        b.extra_type === 'noball'
      ) {

        const batRuns =
          Number(
            b.runs_batsman || 0
          );

        career.runs +=
          batRuns;

        inningBatting.runs +=
          batRuns;

        if (
          batRuns === 4
        ) {

          career.fours += 1;

          inningBatting.fours +=
            1;
        }

        if (
          batRuns === 6
        ) {

          career.sixes += 1;

          inningBatting.sixes +=
            1;
        }

        const previousScore =
          Number(
            career.inningsScores.get(
              inningsId
            ) || 0
          );

        career.inningsScores.set(
          inningsId,
          previousScore +
            batRuns
        );
      }
    }

    /*
     * -----------------------------------------------------
     * NON-STRIKER
     *
     * Preserve old behavior where an innings is counted
     * when batsman_id OR non_striker_id matches.
     * -----------------------------------------------------
     */

    const nonStrikerId =
      b.non_striker_id;

    const nonStrikerKey =
      nonStrikerId != null
        ? String(nonStrikerId)
        : null;

    if (
      nonStrikerKey &&
      gccPlayerIds.has(
        nonStrikerKey
      )
    ) {

      const career =
        createBattingStats(
          nonStrikerId
        );

      career.inningsSet.add(
        inningsId
      );
    }

    /*
     * -----------------------------------------------------
     * DISMISSAL
     * -----------------------------------------------------
     */

    if (
      Number(b.is_wicket) === 1 &&
      b.dismissed_id
    ) {

      const dismissedKey =
        String(
          b.dismissed_id
        );

      if (
        gccPlayerIds.has(
          dismissedKey
        )
      ) {

        const career =
          createBattingStats(
            b.dismissed_id
          );

        career.times_out +=
          1;
      }
    }

    /* =====================================================
       BOWLING
    ===================================================== */

    const bowlerId =
      b.bowler_id;

    const bowlerKey =
      bowlerId != null
        ? String(bowlerId)
        : null;

    if (
      bowlerKey &&
      gccPlayerIds.has(
        bowlerKey
      )
    ) {

      const career =
        createBowlingStats(
          bowlerId
        );

      career.inningsSet.add(
        inningsId
      );

      const effect =
        computeRunEffects({
          runs:
            b.runs_batsman,

          extra_type:
            b.extra_type,

          extra_runs:
            b.extra_runs
        });

      if (
        Number(b.is_legal) === 1
      ) {

        career.balls_bowled +=
          1;
      }

      const chargedRuns =
        b.extra_type === 'bye' ||
        b.extra_type === 'legbye'
          ? 0
          : effect.teamRuns;

      career.runs_given +=
        chargedRuns;

      if (
        Number(b.is_wicket) === 1 &&
        b.wicket_type &&
        b.wicket_type !== 'run-out'
      ) {

        career.wickets +=
          1;
      }

      if (
        (
          !b.extra_type ||
          b.extra_type === 'noball'
        ) &&
        Number(
          b.runs_batsman
        ) === 4
      ) {

        career.fours_given +=
          1;
      }

      if (
        (
          !b.extra_type ||
          b.extra_type === 'noball'
        ) &&
        Number(
          b.runs_batsman
        ) === 6
      ) {

        career.sixes_given +=
          1;
      }

      const inningBowling =
        getInningsBowlingStats(
          inningsId,
          bowlerId
        );

      if (
        Number(b.is_legal) === 1
      ) {

        inningBowling.legalBalls +=
          1;
      }

      inningBowling.runs +=
        chargedRuns;

      if (
        Number(b.is_wicket) === 1 &&
        b.wicket_type &&
        b.wicket_type !== 'run-out'
      ) {

        inningBowling.wickets +=
          1;
      }
    }
  }

  /*
   * -------------------------------------------------------
   * BEST SINGLE-INNINGS BATTING
   * -------------------------------------------------------
   */

  for (
    const [
      inningsId,
      playerStatsMap
    ]
    of inningsBatting
  ) {

    const innings =
      inningsMap.get(
        inningsId
      );

    if (!innings) {
      continue;
    }

    for (
      const stats
      of playerStatsMap.values()
    ) {

      const player =
        playerMap.get(
          String(
            stats.player_id
          )
        );

      if (!player) {
        continue;
      }

      const strikeRate =
        stats.balls > 0
          ? Number(
              (
                (
                  stats.runs /
                  stats.balls
                ) * 100
              ).toFixed(2)
            )
          : 0;

      const candidate = {

        player_id:
          stats.player_id,

        player_name:
          player.name,

        runs:
          Number(
            stats.runs || 0
          ),

        balls:
          Number(
            stats.balls || 0
          ),

        fours:
          Number(
            stats.fours || 0
          ),

        sixes:
          Number(
            stats.sixes || 0
          ),

        strike_rate:
          strikeRate,

        innings_id:
          innings.id,

        match_id:
          innings.match_id,

        innings_number:
          innings.innings_number,

        batting_team_id:
          innings.batting_team_id
      };

      const isBetter =
        !bestBattingFigure ||

        candidate.runs >
        bestBattingFigure.runs ||

        (
          candidate.runs ===
          bestBattingFigure.runs &&
          candidate.balls <
          bestBattingFigure.balls
        ) ||

        (
          candidate.runs ===
          bestBattingFigure.runs &&
          candidate.balls ===
          bestBattingFigure.balls &&
          candidate.strike_rate >
          bestBattingFigure.strike_rate
        ) ||

        (
          candidate.runs ===
          bestBattingFigure.runs &&
          candidate.balls ===
          bestBattingFigure.balls &&
          candidate.strike_rate ===
          bestBattingFigure.strike_rate &&
          candidate.fours >
          bestBattingFigure.fours
        ) ||

        (
          candidate.runs ===
          bestBattingFigure.runs &&
          candidate.balls ===
          bestBattingFigure.balls &&
          candidate.strike_rate ===
          bestBattingFigure.strike_rate &&
          candidate.fours ===
          bestBattingFigure.fours &&
          candidate.sixes >
          bestBattingFigure.sixes
        );

      if (isBetter) {
        bestBattingFigure =
          candidate;
      }
    }
  }

  /*
   * -------------------------------------------------------
   * BEST SINGLE-INNINGS BOWLING
   * -------------------------------------------------------
   */

  for (
    const [
      inningsId,
      playerStatsMap
    ]
    of inningsBowling
  ) {

    const innings =
      inningsMap.get(
        inningsId
      );

    if (!innings) {
      continue;
    }

    for (
      const stats
      of playerStatsMap.values()
    ) {

      const player =
        playerMap.get(
          String(
            stats.player_id
          )
        );

      if (!player) {
        continue;
      }

      const economy =
        stats.legalBalls > 0
          ? Number(
              (
                stats.runs /
                (
                  stats.legalBalls /
                  6
                )
              ).toFixed(2)
            )
          : 0;

      const candidate = {

        player_id:
          stats.player_id,

        player_name:
          player.name,

        wickets:
          Number(
            stats.wickets || 0
          ),

        runs:
          Number(
            stats.runs || 0
          ),

        overs:
          oversStr(
            stats.legalBalls
          ),

        balls:
          Number(
            stats.legalBalls || 0
          ),

        economy,

        innings_id:
          innings.id,

        match_id:
          innings.match_id,

        innings_number:
          innings.innings_number,

        bowling_team_id:
          innings.batting_team_id
      };

      const better =
        !bestBowling ||

        candidate.wickets >
        bestBowling.wickets ||

        (
          candidate.wickets ===
          bestBowling.wickets &&
          candidate.runs <
          bestBowling.runs
        ) ||

        (
          candidate.wickets ===
          bestBowling.wickets &&
          candidate.runs ===
          bestBowling.runs &&
          candidate.economy <
          bestBowling.economy
        );

      if (better) {
        bestBowling =
          candidate;
      }
    }
  }

  /*
   * -------------------------------------------------------
   * CAREER BATTING LEADERS
   * -------------------------------------------------------
   */

  const battingLeaders =
    gccPlayers.map(
      player => {

        const stats =
          battingStats.get(
            String(
              player.id
            )
          );

        const inningsBatted =
          stats.inningsSet.size;

        const inningsScoreValues =
          [
            ...stats.inningsScores.values()
          ].map(
            value =>
              Number(value || 0)
          );

        const highestScore =
          inningsScoreValues.length > 0
            ? Math.max(
                ...inningsScoreValues
              )
            : 0;

        const notOuts =
          Math.max(
            0,
            inningsBatted -
            stats.times_out
          );

        const strikeRate =
          stats.balls_faced > 0
            ? Number(
                (
                  (
                    stats.runs /
                    stats.balls_faced
                  ) * 100
                ).toFixed(2)
              )
            : 0;

        const average =
          stats.times_out > 0
            ? Number(
                (
                  stats.runs /
                  stats.times_out
                ).toFixed(2)
              )
            : stats.runs;

        return {

          player_id:
            player.id,

          player_name:
            player.name,

          innings_batted:
            inningsBatted,

          runs:
            stats.runs,

          highest_score:
            highestScore,

          balls_faced:
            stats.balls_faced,

          fours:
            stats.fours,

          sixes:
            stats.sixes,

          times_out:
            stats.times_out,

          not_outs:
            notOuts,

          strike_rate:
            strikeRate,

          average
        };
      }
    );

  /*
   * -------------------------------------------------------
   * CAREER BOWLING LEADERS
   * -------------------------------------------------------
   */

  const bowlingLeaders =
    gccPlayers.map(
      player => {

        const stats =
          bowlingStats.get(
            String(
              player.id
            )
          );

        const economy =
          stats.balls_bowled > 0
            ? Number(
                (
                  stats.runs_given /
                  (
                    stats.balls_bowled /
                    6
                  )
                ).toFixed(2)
              )
            : 0;

        return {

          player_id:
            player.id,

          player_name:
            player.name,

          innings_bowled:
            stats.inningsSet.size,

          overs:
            oversStr(
              stats.balls_bowled
            ),

          balls_bowled:
            stats.balls_bowled,

          runs_given:
            stats.runs_given,

          wickets:
            stats.wickets,

          fours_given:
            stats.fours_given,

          sixes_given:
            stats.sixes_given,

          economy
        };
      }
    );

  /*
   * -------------------------------------------------------
   * TOP RECORD HELPER
   * -------------------------------------------------------
   */

  const topBy =
    (
      arr,
      key,
      n = 10
    ) =>
      [...arr]
        .sort(
          (a, b) => {

            const av =
              Number(
                a[key] || 0
              );

            const bv =
              Number(
                b[key] || 0
              );

            return bv - av;
          }
        )
        .slice(
          0,
          n
        );

  /*
   * -------------------------------------------------------
   * FINAL RECORD RESPONSE
   * -------------------------------------------------------
   */

  return {

    bestBattingFigure,

    bestBowling,

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
            Number(
              player.balls_faced || 0
            ) >= 10
        ),
        'strike_rate'
      ),

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
            Number(
              player.balls_bowled || 0
            ) >= 12
        )
        .sort(
          (a, b) =>
            Number(
              a.economy || 0
            ) -
            Number(
              b.economy || 0
            )
        )
        .slice(
          0,
          10
        )
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  MAX_WICKETS,

  oversStr,

  computeRunEffects,

  getBallDisplay,

  recordBall,

  undoLastBall,

  computeBattingScorecard,

  computeBowlingScorecard,

  computeCurrentPartnership,

  computeCurrentOver,

  getScoreboard,

  finalizeMatch,

  checkAndFinalizeInnings,

  computeCareerBattingStats,

  computeCareerBowlingStats,

  getPlayerCareerStats,

  getAllTimeRecords
};