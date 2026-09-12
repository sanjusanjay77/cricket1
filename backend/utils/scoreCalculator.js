
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;


/*
====================================================
OVERS
====================================================
*/

function oversStr(totalBalls) {
  const ballsTotal = Number(totalBalls || 0);

  const overs = Math.floor(ballsTotal / 6);
  const balls = ballsTotal % 6;

  return `${overs}.${balls}`;
}


/*
====================================================
DATABASE HELPERS
====================================================
*/

async function getInnings(inningsId) {
  return await db
    .prepare('SELECT * FROM innings WHERE id = ?')
    .get(inningsId);
}


async function getMatch(matchId) {
  return await db
    .prepare('SELECT * FROM matches WHERE id = ?')
    .get(matchId);
}


/*
====================================================
RUN EFFECTS
====================================================

teamRuns   = total runs added to team
batsmanRuns = runs credited to batsman
runsRun    = physical runs used for strike rotation
isLegal    = whether ball counts in over
====================================================
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
      return {
        teamRuns: Math.max(0, extra_runs),
        batsmanRuns: 0,
        runsRun: Math.max(0, extra_runs),
        isLegal: 1
      };


    case 'legbye':
      return {
        teamRuns: Math.max(0, extra_runs),
        batsmanRuns: 0,
        runsRun: Math.max(0, extra_runs),
        isLegal: 1
      };


    case 'penalty':
      return {
        teamRuns: Math.max(0, extra_runs),
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
====================================================
RECORD BALL
====================================================
*/

async function recordBall(inningsId, payload = {}) {

  const innings = await getInnings(inningsId);

  if (!innings) {
    throw new Error('Innings not found');
  }

  if (innings.is_completed) {
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


  /*
  --------------------------------------------
  INPUT
  --------------------------------------------
  */

  const extra_type =
    payload.extra_type || null;

  const is_wicket =
    Boolean(payload.is_wicket);

  const wicket_type =
    payload.wicket_type || null;

  const dismissed_id =
    payload.dismissed_id || null;

  const fielder_id =
    payload.fielder_id || null;

  const commentary =
    payload.commentary || null;


  const runs =
    Number(payload.runs || 0);

  const extra_runs =
    Number(payload.extra_runs || 0);


  /*
  --------------------------------------------
  RUN EFFECT
  --------------------------------------------
  */

  const effect = computeRunEffects({
    runs,
    extra_type,
    extra_runs
  });

  const teamRuns = effect.teamRuns;
  const batsmanRuns = effect.batsmanRuns;
  const runsRun = effect.runsRun;
  const isLegal = effect.isLegal;


  /*
  --------------------------------------------
  VALIDATE WICKET
  --------------------------------------------
  */

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
  --------------------------------------------
  BALL NUMBER
  --------------------------------------------
  */

  const ballCountRow = await db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM balls
      WHERE innings_id = ?
    `)
    .get(inningsId);

  const ballSequence =
    Number(ballCountRow?.c || 0) + 1;


  const currentTotalBalls =
    Number(innings.total_balls || 0);


  const overNumber =
    Math.floor(currentTotalBalls / 6);


  /*
  Legal delivery gets next ball number.
  Illegal delivery keeps the current legal-ball
  position.
  */

  const ballInOver =
    isLegal
      ? (currentTotalBalls % 6) + 1
      : (currentTotalBalls % 6);


  const ballId = uuidv4();


  /*
====================================================
IMPORTANT DATABASE FIX
====================================================

DO NOT use:

.run({
   id: ...,
   innings_id: ...
})

The current database adapter expects positional
arguments.

This fixes:

SQLITE_UNKNOWN:
Number of arguments mismatch:
expected 17, got 1
====================================================
*/

  await db
    .prepare(`
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
    `)
    .run(
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


  /*
====================================================
UPDATE INNINGS TOTALS
====================================================
*/

  const extraCol = {
    wide: 'extras_wide',
    noball: 'extras_noball',
    bye: 'extras_bye',
    legbye: 'extras_legbye',
    penalty: 'extras_penalty'
  }[extra_type];


  const newTotalBalls =
    currentTotalBalls +
    (isLegal ? 1 : 0);


  const newTotalRuns =
    Number(innings.total_runs || 0) +
    teamRuns;


  const newTotalWickets =
    Number(innings.total_wickets || 0) +
    (is_wicket ? 1 : 0);


  /*
====================================================
STRIKE
====================================================
*/

  let newStriker =
    innings.striker_id;

  let newNonStriker =
    innings.non_striker_id;


  /*
  WICKET
  */

  if (is_wicket && dismissed_id) {

    if (
      dismissed_id === newStriker
    ) {
      newStriker = null;
    }

    else if (
      dismissed_id === newNonStriker
    ) {
      newNonStriker = null;
    }
  }


  /*
  ODD PHYSICAL RUNS
  */

  else if (runsRun % 2 === 1) {

    [
      newStriker,
      newNonStriker
    ] = [
      newNonStriker,
      newStriker
    ];
  }


  /*
====================================================
OVER COMPLETION
====================================================
*/

  let newBowler =
    innings.current_bowler_id;


  const overJustCompleted =
    isLegal &&
    newTotalBalls % 6 === 0 &&
    newTotalBalls > currentTotalBalls;


  if (overJustCompleted) {

    /*
    At the end of an over the batsmen change ends.
    */

    if (
      newStriker &&
      newNonStriker
    ) {
      [
        newStriker,
        newNonStriker
      ] = [
        newNonStriker,
        newStriker
      ];
    }


    /*
    Force scorer to select the next bowler.
    */

    newBowler = null;
  }


  /*
====================================================
UPDATE DATABASE
====================================================
*/

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


  /*
  Add extras column only when necessary.
  */

  if (extraCol) {

    updateSql += `,
      ${extraCol} =
        COALESCE(${extraCol}, 0) + ?
    `;

    updateParams.push(extra_runs);
  }


  updateSql += `
      ,
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


  /*
  IMPORTANT:
  Positional parameters again.
  */

  await db
    .prepare(updateSql)
    .run(...updateParams);


  /*
====================================================
CHECK MATCH / INNINGS END
====================================================
*/

  await checkAndFinalizeInnings(
    inningsId
  );


  /*
====================================================
RETURN
====================================================
*/

  return {
    ballId,
    overJustCompleted,
    teamRuns,
    batsmanRuns,
    totalRuns: newTotalRuns,
    totalWickets: newTotalWickets,
    totalBalls: newTotalBalls
  };
}


/*
====================================================
UNDO
====================================================
*/

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
    throw new Error(
      'No balls to undo'
    );
  }


  await db
    .prepare(`
      DELETE FROM balls
      WHERE id = ?
    `)
    .run(last.id);


  await recomputeInningsFromBalls(
    inningsId
  );


  await db
    .prepare(`
      UPDATE innings
      SET is_completed = 0
      WHERE id = ?
    `)
    .run(inningsId);


  return {
    removedBallId: last.id
  };
}


/*
====================================================
RECOMPUTE INNINGS
====================================================
*/

async function recomputeInningsFromBalls(
  inningsId
) {

  const innings =
    await getInnings(inningsId);


  const balls =
    await db
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


  /*
  First recorded ball establishes initial players.
  */

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


    totalRuns +=
      effect.teamRuns;


    totalBalls +=
      b.is_legal ? 1 : 0;


    if (b.is_wicket) {
      totalWickets += 1;
    }


    if (
      b.extra_type &&
      Object.prototype.hasOwnProperty.call(
        extras,
        b.extra_type
      )
    ) {
      extras[b.extra_type] +=
        Number(b.extra_runs || 0);
    }


    striker =
      b.batsman_id;

    nonStriker =
      b.non_striker_id;

    bowler =
      b.bowler_id;


    /*
    Wicket
    */

    if (
      b.is_wicket &&
      b.dismissed_id
    ) {

      if (
        b.dismissed_id === striker
      ) {
        striker = null;
      }

      else if (
        b.dismissed_id === nonStriker
      ) {
        nonStriker = null;
      }
    }


    /*
    Odd runs
    */

    else if (
      effect.runsRun % 2 === 1
    ) {

      [
        striker,
        nonStriker
      ] = [
        nonStriker,
        striker
      ];
    }


    /*
    End of over
    */

    if (
      b.is_legal &&
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


  /*
====================================================
UPDATE RECOMPUTED INNINGS
====================================================
*/

  await db
    .prepare(`
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
    `)
    .run(
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
====================================================
CHECK / FINALIZE INNINGS
====================================================
*/

async function checkAndFinalizeInnings(
  inningsId
) {

  const innings =
    await getInnings(inningsId);


  if (!innings) return;


  const match =
    await getMatch(
      innings.match_id
    );


  if (!match) return;


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
    allOut ||
    oversDone ||
    targetReached
  ) {

    await db
      .prepare(`
        UPDATE innings
        SET is_completed = 1
        WHERE id = ?
      `)
      .run(inningsId);


    if (
      innings.innings_number >= 2 ||
      Number(match.overs_limit || 0) === 0
    ) {

      await finalizeMatch(
        match.id
      );

    } else {

      await db
        .prepare(`
          UPDATE matches
          SET status = ?
          WHERE id = ?
        `)
        .run(
          'innings-break',
          match.id
        );
    }
  }
}


/*
====================================================
FINALIZE MATCH
====================================================
*/

async function finalizeMatch(matchId) {

  const match =
    await getMatch(matchId);


  const allInnings =
    await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `)
      .all(matchId);


  const inn1 =
    allInnings.find(
      i => i.innings_number === 1
    );


  const inn2 =
    allInnings.find(
      i => i.innings_number === 2
    );


  if (!inn1 || !inn2) {
    return;
  }


  const team1 =
    await db
      .prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `)
      .get(inn1.batting_team_id);


  const team2 =
    await db
      .prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `)
      .get(inn2.batting_team_id);


  let resultText;
  let winnerId = null;


  if (
    inn2.total_runs >
    inn1.total_runs
  ) {

    const wicketsInHand =
      MAX_WICKETS -
      inn2.total_wickets;


    resultText =
      `${team2.name} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`;


    winnerId =
      team2.id;

  } else if (
    inn1.total_runs >
    inn2.total_runs
  ) {

    const margin =
      inn1.total_runs -
      inn2.total_runs;


    resultText =
      `${team1.name} won by ${margin} run${margin === 1 ? '' : 's'}`;


    winnerId =
      team1.id;

  } else {

    resultText =
      'Match tied';
  }


  await db
    .prepare(`
      UPDATE matches
      SET
        status = ?,
        result_text = ?,
        winner_id = ?
      WHERE id = ?
    `)
    .run(
      'completed',
      resultText,
      winnerId,
      matchId
    );
}


/*
====================================================
BATTING SCORECARD
====================================================
*/

async function computeBattingScorecard(
  inningsId
) {

  const balls =
    await db
      .prepare(`
        SELECT *
        FROM balls
        WHERE innings_id = ?
        ORDER BY ball_sequence ASC
      `)
      .all(inningsId);


  const stats = {};
  const order = [];


  const ensure = (id) => {

    if (!id) return null;


    if (!stats[id]) {

      stats[id] = {
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


      order.push(id);
    }


    return stats[id];
  };


  for (const b of balls) {

    const s =
      ensure(b.batsman_id);


    ensure(b.non_striker_id);


    /*
    Wides don't count as balls faced.
    */

    if (
      b.extra_type !== 'wide'
    ) {
      s.balls += 1;
    }


    /*
    Bat runs.
    */

    if (
      !b.extra_type ||
      b.extra_type === 'noball'
    ) {

      s.runs +=
        Number(b.runs_batsman || 0);


      if (
        Number(b.runs_batsman) === 4
      ) {
        s.fours += 1;
      }


      if (
        Number(b.runs_batsman) === 6
      ) {
        s.sixes += 1;
      }
    }


    /*
    Wicket.
    */

    if (
      b.is_wicket &&
      b.dismissed_id
    ) {

      const d =
        ensure(b.dismissed_id);


      d.is_out = true;

      d.how_out =
        b.wicket_type;

      d.dismissed_by =
        b.bowler_id;

      d.fielder_id =
        b.fielder_id;
    }
  }


  return order.map(
    id => {

      const s =
        stats[id];


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
    }
  );
}


/*
====================================================
BOWLING SCORECARD
====================================================
*/

async function computeBowlingScorecard(
  inningsId
) {

  const balls =
    await db
      .prepare(`
        SELECT *
        FROM balls
        WHERE innings_id = ?
        ORDER BY ball_sequence ASC
      `)
      .all(inningsId);


  const stats = {};
  const order = [];
  const overRuns = {};


  const ensure = (id) => {

    if (!id) return null;


    if (!stats[id]) {

      stats[id] = {
        player_id: id,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0
      };


      overRuns[id] = {};

      order.push(id);
    }


    return stats[id];
  };


  for (const b of balls) {

    const s =
      ensure(b.bowler_id);


    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });


    if (b.is_legal) {
      s.legalBalls += 1;
    }


    /*
    Byes and leg-byes are not charged
    to bowler.
    */

    const chargedRuns =
      (
        b.extra_type === 'bye' ||
        b.extra_type === 'legbye'
      )
        ? 0
        : effect.teamRuns;


    s.runs +=
      chargedRuns;


    /*
    Run-out is not bowler wicket.
    */

    if (
      b.is_wicket &&
      b.wicket_type &&
      b.wicket_type !== 'run-out'
    ) {
      s.wickets += 1;
    }


    if (
      !overRuns[b.bowler_id][b.over_number]
    ) {
      overRuns[b.bowler_id][b.over_number] = 0;
    }


    overRuns[b.bowler_id][b.over_number] +=
      chargedRuns;
  }


  return order.map(
    id => {

      const s =
        stats[id];


      const overs =
        Object.entries(
          overRuns[id]
        );


      const maidens =
        overs.filter(
          ([, runs]) =>
            runs === 0
        ).length;


      const completedOvers =
        Math.floor(
          s.legalBalls / 6
        );


      const ballsRem =
        s.legalBalls % 6;


      return {
        player_id: id,

        overs:
          `${completedOvers}.${ballsRem}`,

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
    }
  );
}


/*
====================================================
CURRENT PARTNERSHIP
====================================================
*/

async function computeCurrentPartnership(
  inningsId
) {

  const balls =
    await db
      .prepare(`
        SELECT *
        FROM balls
        WHERE innings_id = ?
        ORDER BY ball_sequence ASC
      `)
      .all(inningsId);


  let runs = 0;
  let ballsFaced = 0;


  for (const b of balls) {

    if (b.is_wicket) {
      runs = 0;
      ballsFaced = 0;
      continue;
    }


    const effect =
      computeRunEffects({
        runs: b.runs_batsman,
        extra_type: b.extra_type,
        extra_runs: b.extra_runs
      });


    runs += effect.teamRuns;


    if (
      b.is_legal &&
      b.extra_type !== 'wide'
    ) {
      ballsFaced += 1;
    }
  }


  return {
    runs,
    balls: ballsFaced
  };
}


/*
====================================================
FULL SCOREBOARD
====================================================
*/

async function getScoreboard(
  inningsId
) {

  const innings =
    await getInnings(inningsId);


  if (!innings) {
    return null;
  }


  const battingCard =
    await computeBattingScorecard(
      inningsId
    );


  const bowlingCard =
    await computeBowlingScorecard(
      inningsId
    );


  const recentBalls =
    (
      await db
        .prepare(`
          SELECT *
          FROM balls
          WHERE innings_id = ?
          ORDER BY ball_sequence DESC
          LIMIT 12
        `)
        .all(inningsId)
    ).reverse();


  return {
    innings,

    overs:
      oversStr(innings.total_balls),

    battingCard,

    bowlingCard,

    recentBalls,

    partnership:
      await computeCurrentPartnership(
        inningsId
      ),

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
====================================================
CAREER BATTING
====================================================
*/

async function computeCareerBattingStats(
  playerId
) {

  const balls =
    await db
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


  for (const b of balls) {

    if (
      b.extra_type !== 'wide'
    ) {
      ballsFaced += 1;
    }


    if (
      !b.extra_type ||
      b.extra_type === 'noball'
    ) {

      runs +=
        Number(b.runs_batsman || 0);


      if (
        Number(b.runs_batsman) === 4
      ) {
        fours += 1;
      }


      if (
        Number(b.runs_batsman) === 6
      ) {
        sixes += 1;
      }
    }
  }


  const timesOut =
    (
      await db
        .prepare(`
          SELECT COUNT(*) AS c
          FROM balls
          WHERE dismissed_id = ?
            AND is_wicket = 1
        `)
        .get(playerId)
    ).c;


  const inningsBatted =
    (
      await db
        .prepare(`
          SELECT COUNT(DISTINCT innings_id) AS c
          FROM balls
          WHERE batsman_id = ?
             OR non_striker_id = ?
        `)
        .get(
          playerId,
          playerId
        )
    ).c;


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


/*
====================================================
CAREER BOWLING
====================================================
*/

async function computeCareerBowlingStats(
  playerId
) {

  const balls =
    await db
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


  for (const b of balls) {

    const effect =
      computeRunEffects({
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


    runs +=
      chargedRuns;


    if (
      b.is_wicket &&
      b.wicket_type &&
      b.wicket_type !== 'run-out'
    ) {
      wickets += 1;
    }


    if (
      (
        !b.extra_type ||
        b.extra_type === 'noball'
      ) &&
      Number(b.runs_batsman) === 4
    ) {
      foursGiven += 1;
    }


    if (
      (
        !b.extra_type ||
        b.extra_type === 'noball'
      ) &&
      Number(b.runs_batsman) === 6
    ) {
      sixesGiven += 1;
    }
  }


  const inningsBowled =
    (
      await db
        .prepare(`
          SELECT COUNT(DISTINCT innings_id) AS c
          FROM balls
          WHERE bowler_id = ?
        `)
        .get(playerId)
    ).c;


  const completedOvers =
    Math.floor(
      legalBalls / 6
    );


  const ballsRem =
    legalBalls % 6;


  return {
    innings_bowled:
      inningsBowled,

    overs:
      `${completedOvers}.${ballsRem}`,

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


/*
====================================================
PLAYER CAREER
====================================================
*/

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


/*
====================================================
ALL TIME RECORDS
====================================================
*/

async function getAllTimeRecords() {

  const inningsRows =
    await db
      .prepare(`
        SELECT id, match_id
        FROM innings
      `)
      .all();


  let highestScore = null;
  let bestBowling = null;


  for (const inn of inningsRows) {

    const batting =
      await computeBattingScorecard(
        inn.id
      );


    for (const b of batting) {

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


    const bowling =
      await computeBowlingScorecard(
        inn.id
      );


    for (const b of bowling) {

      const better =
        !bestBowling ||
        b.wickets >
          bestBowling.wickets ||
        (
          b.wickets ===
            bestBowling.wickets &&
          b.runs <
            bestBowling.runs
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


  const batsmanIds =
    (
      await db
        .prepare(`
          SELECT DISTINCT batsman_id AS id
          FROM balls
        `)
        .all()
    ).map(
      r => r.id
    );


  const bowlerIds =
    (
      await db
        .prepare(`
          SELECT DISTINCT bowler_id AS id
          FROM balls
        `)
        .all()
    ).map(
      r => r.id
    );


  const battingLeaders =
    await Promise.all(
      batsmanIds.map(
        async id => ({
          player_id: id,
          ...await computeCareerBattingStats(id)
        })
      )
    );


  const bowlingLeaders =
    await Promise.all(
      bowlerIds.map(
        async id => ({
          player_id: id,
          ...await computeCareerBowlingStats(id)
        })
      )
    );


  const topBy =
    (
      arr,
      key,
      n = 10
    ) =>
      [...arr]
        .sort(
          (a, b) =>
            b[key] - a[key]
        )
        .slice(0, n);


  return {

    highestScore,

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
          b => b.balls_faced >= 10
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


/*
====================================================
EXPORTS
====================================================
*/

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

