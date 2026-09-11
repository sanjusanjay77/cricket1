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
