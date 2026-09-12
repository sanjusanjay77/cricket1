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
  return db.prepare(`
    SELECT *
    FROM innings
    WHERE id = ?
  `).get(inningsId);
}

async function getMatch(matchId) {
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

    /* -----------------------------------------------------
       WIDE

       WD       = 1 team run
       WD + 1   = 2 team runs
       WD + 2   = 3 team runs

       All wide runs are extras.
    ----------------------------------------------------- */

    case 'wide': {
      const totalWideRuns =
        Math.max(1, extra_runs);

      return {
        teamRuns: totalWideRuns,
        batsmanRuns: 0,
        runsRun: totalWideRuns - 1,
        isLegal: 0
      };
    }

    /* -----------------------------------------------------
       NO BALL

       NB       = 1 extra
       NB + 1   = 2 team runs
       NB + 4   = 5 team runs
       NB + 6   = 7 team runs

       Only the automatic no-ball penalty is
       counted as an extra.

       Additional bat runs belong to batsman.
    ----------------------------------------------------- */

    case 'noball': {
      const noBallExtra =
        Math.max(1, extra_runs);

      return {
        teamRuns:
          noBallExtra + runs,

        batsmanRuns:
          runs,

        runsRun:
          runs,

        isLegal: 0
      };
    }

    /* -----------------------------------------------------
       BYE
    ----------------------------------------------------- */

    case 'bye': {
      const byeRuns =
        Math.max(0, extra_runs);

      return {
        teamRuns: byeRuns,
        batsmanRuns: 0,
        runsRun: byeRuns,
        isLegal: 1
      };
    }

    /* -----------------------------------------------------
       LEG BYE
    ----------------------------------------------------- */

    case 'legbye': {
      const legByeRuns =
        Math.max(0, extra_runs);

      return {
        teamRuns: legByeRuns,
        batsmanRuns: 0,
        runsRun: legByeRuns,
        isLegal: 1
      };
    }

    /* -----------------------------------------------------
       PENALTY
    ----------------------------------------------------- */

    case 'penalty': {
      const penaltyRuns =
        Math.max(0, extra_runs);

      return {
        teamRuns: penaltyRuns,
        batsmanRuns: 0,
        runsRun: 0,
        isLegal: 0
      };
    }

    /* -----------------------------------------------------
       NORMAL BALL
    ----------------------------------------------------- */

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

  const extraType =
    ball.extra_type;

  const batRuns =
    Number(
      ball.runs_batsman || 0
    );

  const extraRuns =
    Number(
      ball.extra_runs || 0
    );

  /* WIDE */

  if (extraType === 'wide') {
    return extraRuns > 1
      ? `WD${extraRuns}`
      : 'WD';
  }

  /* NO BALL */

  if (extraType === 'noball') {
    return batRuns > 0
      ? `NB+${batRuns}`
      : 'NB';
  }

  /* BYE */

  if (extraType === 'bye') {
    return `B${extraRuns}`;
  }

  /* LEG BYE */

  if (extraType === 'legbye') {
    return `LB${extraRuns}`;
  }

  /* PENALTY */

  if (extraType === 'penalty') {
    return `P${extraRuns}`;
  }

  /* NORMAL */

  return String(batRuns);
}

/* =========================================================
   FAST BALL NUMBER
========================================================= */

async function getNextBallSequence(inningsId) {
  const row =
    await db.prepare(`
      SELECT ball_sequence
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence DESC
      LIMIT 1
    `).get(inningsId);

  return (
    Number(
      row?.ball_sequence || 0
    ) + 1
  );
}

/* =========================================================
   RECORD BALL
========================================================= */

async function recordBall(
  inningsId,
  payload = {}
) {
  /*
   * Only one innings read before
   * the ball is inserted.
   */

  const innings =
    await getInnings(
      inningsId
    );

  if (!innings) {
    throw new Error(
      'Innings not found'
    );
  }

  if (
    Number(
      innings.is_completed
    )
  ) {
    throw new Error(
      'Innings is already completed'
    );
  }

  if (
    !innings.striker_id ||
    !innings.non_striker_id
  ) {
    throw new Error(
      'Set both batsmen before recording a ball'
    );
  }

  if (
    !innings.current_bowler_id
  ) {
    throw new Error(
      'Set the bowler before recording a ball'
    );
  }

  const extra_type =
    payload.extra_type ||
    null;

  const is_wicket =
    Boolean(
      payload.is_wicket ||
      payload.wicket
    );

  const wicket_type =
    payload.wicket_type ||
    null;

  const dismissed_id =
    payload.dismissed_id ||
    payload.dismissed_player_id ||
    null;

  const fielder_id =
    payload.fielder_id ||
    null;

  const commentary =
    payload.commentary ||
    null;

  const runs =
    Number(
      payload.runs || 0
    );

  const extra_runs =
    Number(
      payload.extra_runs || 0
    );

  /* -------------------------------------------------------
     CALCULATE EFFECT
  ------------------------------------------------------- */

  const effect =
    computeRunEffects({
      runs,
      extra_type,
      extra_runs
    });

  const teamRuns =
    effect.teamRuns;

  const batsmanRuns =
    effect.batsmanRuns;

  const runsRun =
    effect.runsRun;

  const isLegal =
    effect.isLegal;

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
      ].includes(
        dismissed_id
      )
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
    await getNextBallSequence(
      inningsId
    );

  const currentTotalBalls =
    Number(
      innings.total_balls || 0
    );

  const overNumber =
    Math.floor(
      currentTotalBalls / 6
    );

  /*
   * Illegal deliveries do not consume
   * a legal ball.
   */

  const ballInOver =
    isLegal
      ? (
          currentTotalBalls % 6
        ) + 1
      : (
          currentTotalBalls % 6
        );

  const ballId =
    uuidv4();

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
    (
      isLegal
        ? 1
        : 0
    );

  const newTotalRuns =
    Number(
      innings.total_runs || 0
    ) +
    teamRuns;

  const newTotalWickets =
    Number(
      innings.total_wickets || 0
    ) +
    (
      is_wicket
        ? 1
        : 0
    );

  let newStriker =
    innings.striker_id;

  let newNonStriker =
    innings.non_striker_id;

  /* -------------------------------------------------------
     STRIKE ROTATION
  ------------------------------------------------------- */

  if (
    is_wicket &&
    dismissed_id
  ) {

    if (
      dismissed_id ===
      newStriker
    ) {
      newStriker = null;
    }

    if (
      dismissed_id ===
      newNonStriker
    ) {
      newNonStriker = null;
    }

  } else if (
    runsRun % 2 === 1
  ) {

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
    newTotalBalls >
      currentTotalBalls &&
    newTotalBalls % 6 === 0;

  let newBowler =
    innings.current_bowler_id;

  if (
    overJustCompleted
  ) {

    /*
     * Change strike at end of over.
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
     * Force scorer to choose
     * the next bowler.
     */

    newBowler = null;
  }

  /* -------------------------------------------------------
     EXTRAS
  ------------------------------------------------------- */

  const extraColumn = {
    wide:
      'extras_wide',

    noball:
      'extras_noball',

    bye:
      'extras_bye',

    legbye:
      'extras_legbye',

    penalty:
      'extras_penalty'

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

  if (
    extraColumn
  ) {

    /*
     * WIDE:
     *
     * WD       = 1
     * WD + 1   = 2
     * WD + 2   = 3
     *
     * All are wide extras.
     */

    const extrasToAdd =
      extra_type === 'wide'
        ? teamRuns
        : extra_runs;

    updateSql += `,
      ${extraColumn} =
        COALESCE(${extraColumn}, 0) + ?
    `;

    updateParams.push(
      extrasToAdd
    );
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

  /*
   * IMPORTANT:
   *
   * Positional parameters only.
   *
   * This avoids the Turso:
   *
   * Number of arguments mismatch
   *
   * problem.
   */

  await db
    .prepare(updateSql)
    .run(
      ...updateParams
    );

  /* -------------------------------------------------------
     FINALIZATION
  ------------------------------------------------------- */

  await checkAndFinalizeInnings(
    inningsId
  );

  /* -------------------------------------------------------
     FINAL INNINGS
  ------------------------------------------------------- */

  const updatedInnings =
    await getInnings(
      inningsId
    );

  /* -------------------------------------------------------
     SAVED BALL
  ------------------------------------------------------- */

  const savedBall = {

    id:
      ballId,

    innings_id:
      inningsId,

    over_number:
      overNumber,

    ball_in_over:
      ballInOver,

    ball_sequence:
      ballSequence,

    batsman_id:
      innings.striker_id,

    non_striker_id:
      innings.non_striker_id,

    bowler_id:
      innings.current_bowler_id,

    runs_batsman:
      batsmanRuns,

    extra_type,

    extra_runs,

    is_wicket:
      is_wicket
        ? 1
        : 0,

    wicket_type,

    dismissed_id,

    fielder_id,

    is_legal:
      isLegal,

    commentary,

    display:
      getBallDisplay({
        is_wicket:
          is_wicket
            ? 1
            : 0,

        extra_type,

        runs_batsman:
          batsmanRuns,

        extra_runs
      })
  };

  /* -------------------------------------------------------
     RETURN
  ------------------------------------------------------- */

  return {

    ballId,

    ball:
      savedBall,

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

async function undoLastBall(
  inningsId
) {
  const last =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence DESC
      LIMIT 1
    `).get(inningsId);

  if (!last) {
    throw new Error(
      'No balls to undo'
    );
  }

  await db.prepare(`
    DELETE FROM balls
    WHERE id = ?
  `).run(
    last.id
  );

  await recomputeInningsFromBalls(
    inningsId
  );

  await db.prepare(`
    UPDATE innings
    SET is_completed = 0
    WHERE id = ?
  `).run(
    inningsId
  );

  const innings =
    await getInnings(
      inningsId
    );

  if (innings) {

    await db.prepare(`
      UPDATE matches
      SET status = 'live'
      WHERE id = ?
        AND status = 'innings-break'
    `).run(
      innings.match_id
    );
  }

  const updatedInnings =
    await getInnings(
      inningsId
    );

  return {
    removedBallId:
      last.id,

    innings:
      updatedInnings
  };
}

/* =========================================================
   RECOMPUTE INNINGS
========================================================= */

async function recomputeInningsFromBalls(
  inningsId
) {
  const innings =
    await getInnings(
      inningsId
    );

  if (!innings) {
    throw new Error(
      'Innings not found'
    );
  }

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(
      inningsId
    );

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

  if (
    balls.length > 0
  ) {

    striker =
      balls[0].batsman_id;

    nonStriker =
      balls[0].non_striker_id;

    bowler =
      balls[0].bowler_id;
  }

  for (
    const b of balls
  ) {

    const effect =
      computeRunEffects({
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    /* TOTAL RUNS */

    totalRuns +=
      effect.teamRuns;

    /* LEGAL BALL */

    if (
      Number(
        b.is_legal
      ) === 1
    ) {
      totalBalls += 1;
    }

    /* WICKET */

    if (
      Number(
        b.is_wicket
      ) === 1
    ) {
      totalWickets += 1;
    }

    /* -----------------------------------------------------
       EXTRAS
    ----------------------------------------------------- */

    if (
      b.extra_type &&
      Object.prototype.hasOwnProperty.call(
        extras,
        b.extra_type
      )
    ) {

      if (
        b.extra_type === 'wide'
      ) {

        /*
         * WD + 2 = 3 wides
         */

        extras.wide +=
          effect.teamRuns;

      } else {

        /*
         * NB + 4:
         *
         * extra_runs = 1
         *
         * so only 1 is added to
         * no-ball extras.
         */

        extras[
          b.extra_type
        ] +=
          Number(
            b.extra_runs || 0
          );
      }
    }

    /* -----------------------------------------------------
       STRIKE
    ----------------------------------------------------- */

    let ballStriker =
      b.batsman_id;

    let ballNonStriker =
      b.non_striker_id;

    if (
      Number(
        b.is_wicket
      ) === 1 &&
      b.dismissed_id
    ) {

      if (
        b.dismissed_id ===
        ballStriker
      ) {
        ballStriker =
          null;

      } else if (
        b.dismissed_id ===
        ballNonStriker
      ) {
        ballNonStriker =
          null;
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

    /* -----------------------------------------------------
       END OF OVER
    ----------------------------------------------------- */

    if (
      Number(
        b.is_legal
      ) === 1 &&
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

async function checkAndFinalizeInnings(
  inningsId
) {
  const innings =
    await getInnings(
      inningsId
    );

  if (!innings) {
    return;
  }

  const match =
    await getMatch(
      innings.match_id
    );

  if (!match) {
    return;
  }

  const maxBalls =
    Number(
      match.overs_limit || 0
    ) * 6;

  const allOut =
    Number(
      innings.total_wickets || 0
    ) >= MAX_WICKETS;

  const oversDone =
    maxBalls > 0 &&
    Number(
      innings.total_balls || 0
    ) >= maxBalls;

  const targetReached =
    innings.target != null &&
    Number(
      innings.total_runs || 0
    ) >= Number(
      innings.target
    );

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
  `).run(
    inningsId
  );

  if (
    Number(
      innings.innings_number
    ) >= 2
  ) {

    await finalizeMatch(
      match.id
    );

    return;
  }

  await db.prepare(`
    UPDATE matches
    SET
      status = 'innings-break',
      current_innings = 1
    WHERE id = ?
  `).run(
    match.id
  );
}

/* =========================================================
   FINALIZE MATCH
========================================================= */

async function finalizeMatch(
  matchId
) {
  const match =
    await getMatch(
      matchId
    );

  if (!match) {
    return;
  }

  const allInnings =
    await db.prepare(`
      SELECT *
      FROM innings
      WHERE match_id = ?
      ORDER BY innings_number ASC
    `).all(
      matchId
    );

  const inn1 =
    allInnings.find(
      i =>
        Number(
          i.innings_number
        ) === 1
    );

  const inn2 =
    allInnings.find(
      i =>
        Number(
          i.innings_number
        ) === 2
    );

  if (
    !inn1 ||
    !inn2
  ) {
    return;
  }

  const team1 =
    await db.prepare(`
      SELECT *
      FROM teams
      WHERE id = ?
    `).get(
      inn1.batting_team_id
    );

  const team2 =
    await db.prepare(`
      SELECT *
      FROM teams
      WHERE id = ?
    `).get(
      inn2.batting_team_id
    );

  let resultText;
  let winnerId = null;

  if (
    Number(
      inn2.total_runs
    ) >
    Number(
      inn1.total_runs
    )
  ) {

    const wickets =
      Math.max(
        0,
        MAX_WICKETS -
          Number(
            inn2.total_wickets || 0
          )
      );

    resultText =
      `${team2.name} won by ${wickets} wicket${wickets === 1 ? '' : 's'}`;

    winnerId =
      team2.id;

  } else if (
    Number(
      inn1.total_runs
    ) >
    Number(
      inn2.total_runs
    )
  ) {

    const margin =
      Number(
        inn1.total_runs
      ) -
      Number(
        inn2.total_runs
      );

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

function buildBattingScorecard(
  balls
) {
  const stats = {};
  const order = [];

  function ensure(id) {
    if (!id) {
      return null;
    }

    if (!stats[id]) {

      stats[id] = {
        player_id:
          id,

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
  }

  for (
    const b of balls
  ) {

    const striker =
      ensure(
        b.batsman_id
      );

    ensure(
      b.non_striker_id
    );

    /*
     * Wide does not count as
     * ball faced.
     *
     * No-ball DOES count as a
     * ball faced for this app's
     * scoring model.
     */

    if (
      b.extra_type !==
      'wide'
    ) {

      if (striker) {
        striker.balls += 1;
      }
    }

    /*
     * Bat runs are credited on:
     *
     * normal delivery
     * no-ball
     */

    if (
      !b.extra_type ||
      b.extra_type ===
        'noball'
    ) {

      const batRuns =
        Number(
          b.runs_batsman || 0
        );

      if (striker) {

        striker.runs +=
          batRuns;

        if (
          batRuns === 4
        ) {
          striker.fours += 1;
        }

        if (
          batRuns === 6
        ) {
          striker.sixes += 1;
        }
      }
    }

    /* WICKET */

    if (
      Number(
        b.is_wicket
      ) === 1 &&
      b.dismissed_id
    ) {

      const dismissed =
        ensure(
          b.dismissed_id
        );

      if (dismissed) {

        dismissed.is_out =
          true;

        dismissed.how_out =
          b.wicket_type;

        dismissed.dismissed_by =
          b.bowler_id;

        dismissed.fielder_id =
          b.fielder_id;
      }
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
                  (
                    s.runs /
                    s.balls
                  ) * 100
                ).toFixed(2)
              )
            : 0
      };
    }
  );
}

/* =========================================================
   BOWLING SCORECARD BUILDER
========================================================= */

function buildBowlingScorecard(
  balls
) {
  const stats = {};
  const order = [];

  function ensure(id) {
    if (!id) {
      return null;
    }

    if (!stats[id]) {

      stats[id] = {
        player_id:
          id,

        legalBalls: 0,

        runs: 0,

        wickets: 0,

        maidens: 0,

        overRuns: {}
      };

      order.push(id);
    }

    return stats[id];
  }

  for (
    const b of balls
  ) {

    const s =
      ensure(
        b.bowler_id
      );

    if (!s) {
      continue;
    }

    const effect =
      computeRunEffects({
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    const legal =
      Number(
        b.is_legal
      ) === 1;

    if (legal) {
      s.legalBalls += 1;
    }

    /*
     * Bye and leg-bye are not
     * charged to bowler.
     */

    const chargedRuns =
      b.extra_type ===
        'bye' ||
      b.extra_type ===
        'legbye'
        ? 0
        : effect.teamRuns;

    s.runs +=
      chargedRuns;

    /*
     * Run-outs are not bowler
     * wickets.
     */

    if (
      Number(
        b.is_wicket
      ) === 1 &&
      b.wicket_type &&
      b.wicket_type !==
        'run-out'
    ) {
      s.wickets += 1;
    }

    /* OVER */

    const overNo =
      Number(
        b.over_number || 0
      );

    if (
      !s.overRuns[overNo]
    ) {

      s.overRuns[overNo] = {
        runs: 0,
        legalBalls: 0
      };
    }

    s.overRuns[
      overNo
    ].runs +=
      chargedRuns;

    if (legal) {

      s.overRuns[
        overNo
      ].legalBalls += 1;
    }
  }

  return order.map(
    id => {

      const s =
        stats[id];

      const completedOvers =
        Math.floor(
          s.legalBalls / 6
        );

      const ballsRem =
        s.legalBalls % 6;

      let maidens = 0;

      for (
        const over of
          Object.values(
            s.overRuns
          )
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
                (
                  s.legalBalls /
                  6
                )
              ).toFixed(2)
            )
          : 0;

      return {

        player_id:
          id,

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
    }
  );
}

/* =========================================================
   PARTNERSHIP
========================================================= */

function buildPartnership(
  balls
) {
  let runs = 0;
  let ballsFaced = 0;

  /*
   * Find the last wicket.
   */

  let startIndex = 0;

  for (
    let i =
      balls.length - 1;
    i >= 0;
    i--
  ) {

    if (
      Number(
        balls[i].is_wicket
      ) === 1
    ) {

      startIndex =
        i + 1;

      break;
    }
  }

  for (
    let i =
      startIndex;
    i < balls.length;
    i++
  ) {

    const b =
      balls[i];

    const effect =
      computeRunEffects({
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    runs +=
      effect.teamRuns;

    /*
     * Wide is not counted
     * as a ball faced.
     */

    if (
      b.extra_type !==
      'wide'
    ) {
      ballsFaced += 1;
    }
  }

  return {
    runs,

    balls:
      ballsFaced
  };
}

/* =========================================================
   CURRENT OVER
========================================================= */

function buildCurrentOver(
  balls,
  totalBalls
) {
  let overNumber =
    Math.floor(
      Number(
        totalBalls || 0
      ) / 6
    );

  /*
   * At exactly 6, 12, 18...
   * display the completed over.
   */

  if (
    Number(
      totalBalls || 0
    ) > 0 &&
    Number(
      totalBalls
    ) % 6 === 0
  ) {

    overNumber =
      Math.floor(
        Number(
          totalBalls
        ) / 6
      ) - 1;
  }

  if (
    overNumber < 0
  ) {
    return [];
  }

  return balls
    .filter(
      b =>
        Number(
          b.over_number
        ) ===
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
   EXTRAS BUILDER
========================================================= */

function buildExtras(
  innings,
  balls
) {
  /*
   * Prefer the values stored in innings.
   *
   * These are updated every time a ball
   * is recorded.
   */

  let wide =
    Number(
      innings.extras_wide || 0
    );

  let noball =
    Number(
      innings.extras_noball || 0
    );

  let bye =
    Number(
      innings.extras_bye || 0
    );

  let legbye =
    Number(
      innings.extras_legbye || 0
    );

  let penalty =
    Number(
      innings.extras_penalty || 0
    );

  /*
   * If stored values are unavailable or
   * zero while balls exist, rebuild from
   * balls.
   */

  if (
    balls.length > 0 &&
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

    for (
      const b of balls
    ) {

      const effect =
        computeRunEffects({
          runs:
            b.runs_batsman,

          extra_type:
            b.extra_type,

          extra_runs:
            b.extra_runs
        });

      switch (
        b.extra_type
      ) {

        case 'wide':
          wide +=
            effect.teamRuns;
          break;

        case 'noball':
          noball +=
            Number(
              b.extra_runs || 0
            );
          break;

        case 'bye':
          bye +=
            Number(
              b.extra_runs || 0
            );
          break;

        case 'legbye':
          legbye +=
            Number(
              b.extra_runs || 0
            );
          break;

        case 'penalty':
          penalty +=
            Number(
              b.extra_runs || 0
            );
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
   FULL SCOREBOARD
========================================================= */

async function getScoreboard(
  inningsId
) {
  /*
   * Only TWO database reads:
   *
   * 1. innings
   * 2. balls
   *
   * Everything else is calculated
   * in memory.
   */

  const innings =
    await getInnings(
      inningsId
    );

  if (!innings) {
    return null;
  }

  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(
      inningsId
    );

  /* -------------------------------------------------------
     SCORECARDS
  ------------------------------------------------------- */

  const battingCard =
    buildBattingScorecard(
      balls
    );

  const bowlingCard =
    buildBowlingScorecard(
      balls
    );

  /* -------------------------------------------------------
     RECENT BALLS
  ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     CURRENT OVER
  ------------------------------------------------------- */

  const currentOver =
    buildCurrentOver(
      balls,
      innings.total_balls
    );

  /* -------------------------------------------------------
     CURRENT BOWLER
  ------------------------------------------------------- */

  const currentBowler =
    innings.current_bowler_id
      ? bowlingCard.find(
          b =>
            b.player_id ===
            innings.current_bowler_id
        ) || null
      : null;

  /* -------------------------------------------------------
     STRIKER
  ------------------------------------------------------- */

  const striker =
    battingCard.find(
      b =>
        b.player_id ===
        innings.striker_id
    ) || null;

  /* -------------------------------------------------------
     NON-STRIKER
  ------------------------------------------------------- */

  const nonStriker =
    battingCard.find(
      b =>
        b.player_id ===
        innings.non_striker_id
    ) || null;

  /* -------------------------------------------------------
     RUN RATE
  ------------------------------------------------------- */

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
            (
              ballsTotal /
              6
            )
          ).toFixed(2)
        )
      : 0;

  /* -------------------------------------------------------
     EXTRAS
  ------------------------------------------------------- */

  const extras =
    buildExtras(
      innings,
      balls
    );

  /* -------------------------------------------------------
     RETURN
  ------------------------------------------------------- */

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

    currentOverNumber:
      ballsTotal === 0
        ? 0
        : Math.floor(
            (
              ballsTotal - 1
            ) / 6
          ),

    currentBowler,

    striker,

    nonStriker,

    partnership:
      buildPartnership(
        balls
      ),

    runRate,

    extras
  };
}

/* =========================================================
   CAREER BATTING
========================================================= */

async function computeCareerBattingStats(
  playerId
) {
  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE batsman_id = ?
    `).all(
      playerId
    );

  let runs = 0;
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;

  for (
    const b of balls
  ) {

    if (
      b.extra_type !==
      'wide'
    ) {
      ballsFaced += 1;
    }

    if (
      !b.extra_type ||
      b.extra_type ===
        'noball'
    ) {

      const batRuns =
        Number(
          b.runs_batsman || 0
        );

      runs +=
        batRuns;

      if (
        batRuns === 4
      ) {
        fours += 1;
      }

      if (
        batRuns === 6
      ) {
        sixes += 1;
      }
    }
  }

  const timesOutRow =
    await db.prepare(`
      SELECT COUNT(*) AS c
      FROM balls
      WHERE dismissed_id = ?
        AND is_wicket = 1
    `).get(
      playerId
    );

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

  return {

    innings_batted:
      inningsBatted,

    runs,

    balls_faced:
      ballsFaced,

    fours,

    sixes,

    times_out:
      timesOut,

    not_outs:
      Math.max(
        0,
        inningsBatted -
          timesOut
      ),

    strike_rate:
      ballsFaced > 0
        ? Number(
            (
              (
                runs /
                ballsFaced
              ) * 100
            ).toFixed(2)
          )
        : 0,

    average:
      timesOut > 0
        ? Number(
            (
              runs /
              timesOut
            ).toFixed(2)
          )
        : runs
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
    `).all(
      playerId
    );

  let legalBalls = 0;
  let runs = 0;
  let wickets = 0;
  let foursGiven = 0;
  let sixesGiven = 0;

  for (
    const b of balls
  ) {

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
      Number(
        b.is_legal
      )
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
      Number(
        b.is_wicket
      ) &&
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

  const inningsRow =
    await db.prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE bowler_id = ?
    `).get(
      playerId
    );

  const inningsBowled =
    Number(
      inningsRow?.c || 0
    );

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
              (
                legalBalls /
                6
              )
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
   ALL TIME RECORDS
========================================================= */

async function getAllTimeRecords() {
  const inningsRows =
    await db.prepare(`
      SELECT id, match_id
      FROM innings
    `).all();

  let highestScore = null;
  let bestBowling = null;

  for (
    const inn of inningsRows
  ) {

    const batting =
      await computeBattingScorecard(
        inn.id
      );

    for (
      const b of batting
    ) {

      if (
        !highestScore ||
        b.runs >
          highestScore.runs
      ) {

        highestScore = {

          player_id:
            b.player_id,

          runs:
            b.runs,

          balls:
            b.balls,

          fours:
            b.fours,

          sixes:
            b.sixes,

          strike_rate:
            b.strike_rate,

          innings_id:
            inn.id,

          match_id:
            inn.match_id
        };
      }
    }

    const bowling =
      await computeBowlingScorecard(
        inn.id
      );

    for (
      const b of bowling
    ) {

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

          player_id:
            b.player_id,

          wickets:
            b.wickets,

          runs:
            b.runs,

          overs:
            b.overs,

          economy:
            b.economy,

          innings_id:
            inn.id,

          match_id:
            inn.match_id
        };
      }
    }
  }

  const batsmanIds =
    (
      await db.prepare(`
        SELECT DISTINCT
          batsman_id AS id
        FROM balls
        WHERE batsman_id IS NOT NULL
      `).all()
    ).map(
      r => r.id
    );

  const bowlerIds =
    (
      await db.prepare(`
        SELECT DISTINCT
          bowler_id AS id
        FROM balls
        WHERE bowler_id IS NOT NULL
      `).all()
    ).map(
      r => r.id
    );

  const battingLeaders =
    await Promise.all(
      batsmanIds.map(
        async id => ({

          player_id:
            id,

          ...await computeCareerBattingStats(
            id
          )
        })
      )
    );

  const bowlingLeaders =
    await Promise.all(
      bowlerIds.map(
        async id => ({

          player_id:
            id,

          ...await computeCareerBowlingStats(
            id
          )
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
            b[key] -
            a[key]
        )
        .slice(
          0,
          n
        );

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
          b =>
            b.balls_faced >= 10
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
          b =>
            b.balls_bowled >= 12
        )
        .sort(
          (a, b) =>
            a.economy -
            b.economy
        )
        .slice(
          0,
          10
        )
  };
}

/* =========================================================
   COMPATIBILITY FUNCTIONS
========================================================= */

async function computeBattingScorecard(
  inningsId
) {
  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(
      inningsId
    );

  return buildBattingScorecard(
    balls
  );
}

async function computeBowlingScorecard(
  inningsId
) {
  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(
      inningsId
    );

  return buildBowlingScorecard(
    balls
  );
}

async function computeCurrentPartnership(
  inningsId
) {
  const balls =
    await db.prepare(`
      SELECT *
      FROM balls
      WHERE innings_id = ?
      ORDER BY ball_sequence ASC
    `).all(
      inningsId
    );

  return buildPartnership(
    balls
  );
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
    `).all(
      inningsId
    );

  return buildCurrentOver(
    balls,
    totalBalls
  );
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
