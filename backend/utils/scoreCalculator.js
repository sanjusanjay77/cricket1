const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

exports.listMatches = async (req, res) => {
  try {
    const matches = await db.prepare(`
      SELECT m.*, t1.name AS team1_name, t1.short_name AS team1_short,
             t2.name AS team2_name, t2.short_name AS team2_short
      FROM matches m
      JOIN teams t1 ON t1.id = m.team1_id
      JOIN teams t2 ON t2.id = m.team2_id
      ORDER BY m.created_at DESC
    `).all();

    res.json(matches);
  } catch (err) {
    console.error('listMatches error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.createMatch = async (req, res) => {
  try {
    const {
      team1_id,
      team2_id,
      match_type,
      overs_limit,
      venue,
      match_date
    } = req.body;

    if (!team1_id || !team2_id) {
      return res.status(400).json({
        error: 'team1_id and team2_id are required'
      });
    }

    if (team1_id === team2_id) {
      return res.status(400).json({
        error: 'A team cannot play itself'
      });
    }

    const id = uuidv4();

    await db.prepare(`
      INSERT INTO matches (
        id,
        team1_id,
        team2_id,
        match_type,
        overs_limit,
        venue,
        match_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming')
    `).run(
      id,
      team1_id,
      team2_id,
      match_type || 'T20',
      overs_limit ?? 20,
      venue || null,
      match_date || null
    );

    const match = await db
      .prepare('SELECT * FROM matches WHERE id = ?')
      .get(id);

    res.status(201).json(match);
  } catch (err) {
    console.error('createMatch error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.setToss = async (req, res) => {
  try {
    const { toss_winner_id, toss_decision } = req.body;

    const match = await db
      .prepare('SELECT * FROM matches WHERE id = ?')
      .get(req.params.id);

    if (!match) {
      return res.status(404).json({
        error: 'Match not found'
      });
    }

    if (![match.team1_id, match.team2_id].includes(toss_winner_id)) {
      return res.status(400).json({
        error: 'toss_winner_id must be one of the two playing teams'
      });
    }

    if (!['bat', 'bowl'].includes(toss_decision)) {
      return res.status(400).json({
        error: 'toss_decision must be bat or bowl'
      });
    }

    await db.prepare(`
      UPDATE matches
      SET toss_winner_id = ?,
          toss_decision = ?,
          status = ?
      WHERE id = ?
    `).run(
      toss_winner_id,
      toss_decision,
      'live',
      req.params.id
    );

    const battingFirstId =
      toss_decision === 'bat'
        ? toss_winner_id
        : (
            toss_winner_id === match.team1_id
              ? match.team2_id
              : match.team1_id
          );

    const bowlingFirstId =
      battingFirstId === match.team1_id
        ? match.team2_id
        : match.team1_id;

    const inningsId = uuidv4();

    await db.prepare(`
      INSERT INTO innings (
        id,
        match_id,
        innings_number,
        batting_team_id,
        bowling_team_id
      )
      VALUES (?, ?, 1, ?, ?)
    `).run(
      inningsId,
      match.id,
      battingFirstId,
      bowlingFirstId
    );

    res.json({
      match: await db
        .prepare('SELECT * FROM matches WHERE id = ?')
        .get(match.id),
      innings_id: inningsId
    });
  } catch (err) {
    console.error('setToss error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Start the 2nd innings once the 1st innings has finished.
 */
exports.startSecondInnings = async (req, res) => {
  try {
    const match = await db
      .prepare('SELECT * FROM matches WHERE id = ?')
      .get(req.params.id);

    if (!match) {
      return res.status(404).json({
        error: 'Match not found'
      });
    }

    const inn1 = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
          AND innings_number = 1
      `)
      .get(match.id);

    if (!inn1 || !inn1.is_completed) {
      return res.status(400).json({
        error: 'First innings has not finished yet'
      });
    }

    const inningsId = uuidv4();
    const target = inn1.total_runs + 1;

    await db.prepare(`
      INSERT INTO innings (
        id,
        match_id,
        innings_number,
        batting_team_id,
        bowling_team_id,
        target
      )
      VALUES (?, ?, 2, ?, ?, ?)
    `).run(
      inningsId,
      match.id,
      inn1.bowling_team_id,
      inn1.batting_team_id,
      target
    );

    await db.prepare(`
      UPDATE matches
      SET status = ?,
          current_innings = 2
      WHERE id = ?
    `).run(
      'live',
      match.id
    );

    res.json({
      innings_id: inningsId,
      target
    });
  } catch (err) {
    console.error('startSecondInnings error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getMatchDetail = async (req, res) => {
  try {
    const match = await db.prepare(`
      SELECT
        m.*,
        t1.name AS team1_name,
        t1.short_name AS team1_short,
        t1.logo_color AS team1_color,
        t2.name AS team2_name,
        t2.short_name AS team2_short,
        t2.logo_color AS team2_color
      FROM matches m
      JOIN teams t1 ON t1.id = m.team1_id
      JOIN teams t2 ON t2.id = m.team2_id
      WHERE m.id = ?
    `).get(req.params.id);

    if (!match) {
      return res.status(404).json({
        error: 'Match not found'
      });
    }

    const inningsRows = await db.prepare(`
      SELECT *
      FROM innings
      WHERE match_id = ?
      ORDER BY innings_number ASC
    `).all(match.id);

    // IMPORTANT:
    // scoreCalculator exports the calculator object.
    // Therefore use calc.getScoreboard(), not a destructured getScoreboard().
    const innings = await Promise.all(
      inningsRows.map(i => calc.getScoreboard(i.id))
    );

    const players = await db.prepare(`
      SELECT *
      FROM players
      WHERE team_id IN (?, ?)
    `).all(
      match.team1_id,
      match.team2_id
    );

    res.json({
      match,
      innings,
      players
    });
  } catch (err) {
    console.error('getMatchDetail error:', err);

    res.status(500).json({
      error: err.message
    });
  }
};

exports.deleteMatch = async (req, res) => {
  try {
    await db
      .prepare('DELETE FROM matches WHERE id = ?')
      .run(req.params.id);

    res.status(204).send();
  } catch (err) {
    console.error('deleteMatch error:', err);
    res.status(500).json({ error: err.message });
  }
};async function recordBall(inningsId, payload = {}) {
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
    oldTotalBalls + (isLegal ? 1 : 0);

  /*
   * IMPORTANT:
   *
   * For legal balls we already know the sequence.
   * This avoids SELECTing the last ball for normal runs.
   *
   * For wides/no-balls we still need the latest sequence
   * because they don't increase the legal-ball count.
   */
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
      : oldTotalBalls % 6;

  const ballId = uuidv4();

  /*
   * Calculate everything BEFORE touching the database.
   * This keeps the database section as short as possible.
   */

  const newTotalRuns =
    Number(innings.total_runs || 0) + teamRuns;

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

  let newBowler =
    innings.current_bowler_id;

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

  const extraColumn = {
    wide: 'extras_wide',
    noball: 'extras_noball',
    bye: 'extras_bye',
    legbye: 'extras_legbye',
    penalty: 'extras_penalty'
  }[extra_type];

  /*
   * INSERT BALL
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
    `)
    .run({
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

  /*
   * UPDATE INNINGS
   */
  let updateSQL = `
    UPDATE innings
    SET
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

  await db
    .prepare(updateSQL)
    .run({
      total_runs: newTotalRuns,
      total_wickets: newTotalWickets,
      total_balls: newTotalBalls,
      striker_id: newStriker,
      non_striker_id: newNonStriker,
      current_bowler_id: newBowler,
      extraAmt: extra_runs,
      id: inningsId
    });

  /*
   * DO NOT call getMatch() for every normal ball.
   *
   * This was one of the unnecessary network/database delays.
   *
   * Only check finishing conditions when they can actually
   * happen.
   */

  let shouldCheckFinish = false;

  /*
   * Wicket limit
   */
  if (newTotalWickets >= MAX_WICKETS) {
    shouldCheckFinish = true;
  }

  /*
   * Target reached.
   */
  if (
    innings.target != null &&
    newTotalRuns >= Number(innings.target)
  ) {
    shouldCheckFinish = true;
  }

  /*
   * Overs limit.
   *
   * We only need the match query when a legal ball has been
   * added. Normal balls that are nowhere near the end do not
   * need another database request.
   */
  if (isLegal && innings.match_id) {
    const possibleEnd =
      innings.target != null ||
      newTotalWickets >= MAX_WICKETS;

    if (possibleEnd) {
      shouldCheckFinish = true;
    }

    /*
     * Check overs only when the ball count reaches a multiple
     * of 6. This removes the match SELECT from most balls.
     */
    if (newTotalBalls % 6 === 0) {
      const match = await getMatch(innings.match_id);

      const maxBalls =
        Number(match?.overs_limit || 0) * 6;

      if (
        maxBalls > 0 &&
        newTotalBalls >= maxBalls
      ) {
        shouldCheckFinish = true;
      }
    }
  }

  if (shouldCheckFinish) {
    await checkAndFinalizeInnings(inningsId);
  }

  /*
   * Return the already-calculated scoreboard state.
   *
   * The frontend does NOT need to make another GET request.
   */
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
