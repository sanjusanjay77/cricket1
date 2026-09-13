
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const MAX_WICKETS = 10;

/*
=========================================================
IN-MEMORY OPERATION LOCKS
=========================================================
*/

const inningsLocks = new Map();

async function withInningsLock(inningsId, operation) {
  const id = String(inningsId);

  while (inningsLocks.has(id)) {
    await inningsLocks.get(id);
  }

  let release;

  const lock = new Promise(resolve => {
    release = resolve;
  });

  inningsLocks.set(id, lock);

  try {
    return await operation();
  } finally {
    if (inningsLocks.get(id) === lock) {
      inningsLocks.delete(id);
    }

    release();
  }
}

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

function cleanId(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  return String(value);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return n;
}

/*
 * IMPORTANT:
 * Do not use Boolean("false").
 *
 * Boolean("false") === true in JavaScript.
 */
function toBool(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'TRUE' ||
    value === 'True' ||
    value === 'yes' ||
    value === 'YES'
  );
}

/* =========================================================
   PLAYER VALIDATION
========================================================= */

async function playerExists(playerId) {
  if (!playerId) {
    return false;
  }

  const player = await db.prepare(`
    SELECT id, active
    FROM players
    WHERE id = ?
  `).get(playerId);

  if (!player) {
    return false;
  }

  /*
   * Older rows may not have active populated.
   * Reject only explicitly inactive players.
   */
  if (
    player.active !== undefined &&
    player.active !== null &&
    Number(player.active) === 0
  ) {
    return false;
  }

  return true;
}

async function validatePlayer(
  playerId,
  label
) {
  if (!playerId) {
    throw new Error(
      `${label} is required`
    );
  }

  const exists =
    await playerExists(
      playerId
    );

  if (!exists) {
    throw new Error(
      `${label} does not exist or is inactive`
    );
  }
}

/* =========================================================
   RUN EFFECTS
========================================================= */

function computeRunEffects({
  runs = 0,
  extra_type = null,
  extra_runs = 0
}) {
  runs =
    Math.max(
      0,
      numberValue(runs)
    );

  extra_runs =
    Math.max(
      0,
      numberValue(extra_runs)
    );

  switch (extra_type) {

    case 'wide': {

      const totalWideRuns =
        Math.max(
          1,
          extra_runs
        );

      return {
        teamRuns:
          totalWideRuns,

        batsmanRuns:
          0,

        runsRun:
          totalWideRuns - 1,

        isLegal:
          0
      };
    }

    case 'noball': {

      const noBallExtra =
        Math.max(
          1,
          extra_runs
        );

      return {
        teamRuns:
          noBallExtra + runs,

        batsmanRuns:
          runs,

        runsRun:
          runs,

        isLegal:
          0
      };
    }

    case 'bye': {

      const byeRuns =
        Math.max(
          0,
          extra_runs
        );

      return {
        teamRuns:
          byeRuns,

        batsmanRuns:
          0,

        runsRun:
          byeRuns,

        isLegal:
          1
      };
    }

    case 'legbye': {

      const legByeRuns =
        Math.max(
          0,
          extra_runs
        );

      return {
        teamRuns:
          legByeRuns,

        batsmanRuns:
          0,

        runsRun:
          legByeRuns,

        isLegal:
          1
      };
    }

    case 'penalty': {

      const penaltyRuns =
        Math.max(
          0,
          extra_runs
        );

      return {
        teamRuns:
          penaltyRuns,

        batsmanRuns:
          0,

        runsRun:
          0,

        isLegal:
          0
      };
    }

    default: {

      return {
        teamRuns:
          runs,

        batsmanRuns:
          runs,

        runsRun:
          runs,

        isLegal:
          1
      };
    }
  }
}

/* =========================================================
   BALL DISPLAY
========================================================= */

function getBallDisplay(ball) {
  if (!ball) {
    return '';
  }

  if (
    Number(ball.is_wicket) === 1
  ) {
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

  if (
    extraType === 'wide'
  ) {
    return extraRuns > 1
      ? `WD${extraRuns}`
      : 'WD';
  }

  if (
    extraType === 'noball'
  ) {
    return batRuns > 0
      ? `NB+${batRuns}`
      : 'NB';
  }

  if (
    extraType === 'bye'
  ) {
    return `B${extraRuns}`;
  }

  if (
    extraType === 'legbye'
  ) {
    return `LB${extraRuns}`;
  }

  if (
    extraType === 'penalty'
  ) {
    return `P${extraRuns}`;
  }

  return String(
    batRuns
  );
}

/* =========================================================
   BALL SEQUENCE
========================================================= */

async function getNextBallSequence(
  inningsId
) {
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
   VALIDATE SCORE INPUT
========================================================= */

function validateScoreInput({
  runs,
  extra_type,
  extra_runs
}) {

  if (
    !Number.isFinite(runs) ||
    runs < 0
  ) {
    throw new Error(
      'Runs must be a valid non-negative number'
    );
  }

  if (
    !Number.isFinite(extra_runs) ||
    extra_runs < 0
  ) {
    throw new Error(
      'Extra runs must be a valid non-negative number'
    );
  }

  const allowedExtras = [
    null,
    '',
    'wide',
    'noball',
    'bye',
    'legbye',
    'penalty'
  ];

  if (
    !allowedExtras.includes(
      extra_type
    )
  ) {
    throw new Error(
      'Invalid extra type'
    );
  }

  if (
    extra_type === 'wide' &&
    runs !== 0
  ) {
    throw new Error(
      'Batsman runs must be 0 on a wide'
    );
  }

  if (
    (
      extra_type === 'bye' ||
      extra_type === 'legbye' ||
      extra_type === 'penalty'
    ) &&
    runs !== 0
  ) {
    throw new Error(
      'Batsman runs must be 0 for this extra'
    );
  }
}

/* =========================================================
   RESTORE INNINGS SNAPSHOT
========================================================= */

async function restoreInningsSnapshot(
  snapshot
) {
  if (!snapshot) {
    return;
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
      current_bowler_id = ?,
      is_completed = ?
    WHERE id = ?
  `).run(
    snapshot.total_runs,
    snapshot.total_wickets,
    snapshot.total_balls,
    snapshot.extras_wide,
    snapshot.extras_noball,
    snapshot.extras_bye,
    snapshot.extras_legbye,
    snapshot.extras_penalty,
    snapshot.striker_id,
    snapshot.non_striker_id,
    snapshot.current_bowler_id,
    snapshot.is_completed,
    snapshot.id
  );
}

/* =========================================================
   RESTORE MATCH SNAPSHOT
========================================================= */

async function restoreMatchSnapshot(
  snapshot
) {
  if (!snapshot) {
    return;
  }

  await db.prepare(`
    UPDATE matches
    SET
      status = ?,
      result_text = ?,
      winner_id = ?,
      current_innings = ?
    WHERE id = ?
  `).run(
    snapshot.status,
    snapshot.result_text,
    snapshot.winner_id,
    snapshot.current_innings,
    snapshot.id
  );
}

/* =========================================================
   RECORD BALL
========================================================= */

async function recordBall(
  inningsId,
  payload = {}
) {

  return withInningsLock(
    inningsId,
    async () => {

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
        ) === 1
      ) {
        throw new Error(
          'Innings is already completed'
        );
      }

      /*
       * Both batsmen are required.
       */
      if (
        !innings.striker_id ||
        !innings.non_striker_id
      ) {
        throw new Error(
          'Set both batsmen before recording a ball'
        );
      }

      if (
        String(
          innings.striker_id
        ) ===
        String(
          innings.non_striker_id
        )
      ) {
        throw new Error(
          'Striker and non-striker must be different'
        );
      }

      /*
       * Bowler required.
       */
      if (
        !innings.current_bowler_id
      ) {
        throw new Error(
          'Set the bowler before recording a ball'
        );
      }

      await validatePlayer(
        innings.striker_id,
        'Striker'
      );

      await validatePlayer(
        innings.non_striker_id,
        'Non-striker'
      );

      await validatePlayer(
        innings.current_bowler_id,
        'Bowler'
      );

      /* ===================================================
         IMPORTANT RUN FIX

         Scorer.jsx may send:

         runs
         OR
         runs_batter
         OR
         runs_batsman

         Accept all three.
      =================================================== */

      const runs =
        numberValue(
          payload.runs ??
          payload.runs_batter ??
          payload.runs_batsman,
          0
        );

      const extra_type =
        payload.extra_type ||
        null;

      const extra_runs =
        numberValue(
          payload.extra_runs,
          0
        );

      /*
       * IMPORTANT WICKET FIX
       */
      const is_wicket =
        toBool(
          payload.is_wicket ??
          payload.wicket
        );

      const wicket_type =
        payload.wicket_type ||
        null;

      const dismissed_id =
        cleanId(
          payload.dismissed_id ??
          payload.dismissed_player_id
        );

      const fielder_id =
        cleanId(
          payload.fielder_id
        );

      const commentary =
        payload.commentary
          ? String(
              payload.commentary
            ).slice(
              0,
              1000
            )
          : null;

      validateScoreInput({
        runs,
        extra_type,
        extra_runs
      });

      /* ===================================================
         WICKET VALIDATION
      =================================================== */

      if (is_wicket) {

        if (!dismissed_id) {
          throw new Error(
            'Dismissed player is required'
          );
        }

        if (
          dismissed_id !==
            String(
              innings.striker_id
            ) &&
          dismissed_id !==
            String(
              innings.non_striker_id
            )
        ) {
          throw new Error(
            'Dismissed player must be the current striker or non-striker'
          );
        }

        await validatePlayer(
          dismissed_id,
          'Dismissed player'
        );

        if (fielder_id) {
          await validatePlayer(
            fielder_id,
            'Fielder'
          );
        }

        if (!wicket_type) {
          throw new Error(
            'Wicket type is required'
          );
        }
      }

      /* ===================================================
         SCORE EFFECT
      =================================================== */

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

      if (
        !Number.isFinite(
          teamRuns
        ) ||
        teamRuns < 0
      ) {
        throw new Error(
          'Invalid calculated team runs'
        );
      }

      /* ===================================================
         MATCH SNAPSHOT
      =================================================== */

      const matchSnapshot =
        innings.match_id
          ? await getMatch(
              innings.match_id
            )
          : null;

      /* ===================================================
         BALL NUMBER
      =================================================== */

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

      let ballInserted =
        false;

      try {

        /* =================================================
           INSERT BALL
        ================================================= */

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
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?
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

        ballInserted =
          true;

        /* =================================================
           NEW TOTALS
        ================================================= */

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

        if (
          newTotalWickets >
          MAX_WICKETS
        ) {
          throw new Error(
            'Maximum wickets already reached'
          );
        }

        let newStriker =
          innings.striker_id;

        let newNonStriker =
          innings.non_striker_id;

        /* =================================================
           STRIKE ROTATION
        ================================================= */

        if (
          is_wicket &&
          dismissed_id
        ) {

          if (
            String(
              dismissed_id
            ) ===
            String(
              newStriker
            )
          ) {
            newStriker =
              null;
          }

          if (
            String(
              dismissed_id
            ) ===
            String(
              newNonStriker
            )
          ) {
            newNonStriker =
              null;
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

        /* =================================================
           OVER COMPLETE
        ================================================= */

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
           * Scorer must select a new bowler.
           */
          newBowler =
            null;
        }

        /* =================================================
           EXTRAS
        ================================================= */

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

        if (extraColumn) {

          const extrasToAdd =
            extra_type === 'wide'
              ? teamRuns
              : extra_runs;

          updateSql += `,
            ${extraColumn} =
              COALESCE(
                ${extraColumn},
                0
              ) + ?
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

        /* =================================================
           UPDATE INNINGS
        ================================================= */

        await db
          .prepare(updateSql)
          .run(
            ...updateParams
          );

        /* =================================================
           FINALIZATION
        ================================================= */

        await checkAndFinalizeInnings(
          inningsId
        );

        const updatedInnings =
          await getInnings(
            inningsId
          );

        /* =================================================
           SAVED BALL
        ================================================= */

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

      } catch (operationError) {

        console.error(
          'Ball operation failed. Attempting rollback:',
          operationError
        );

        if (ballInserted) {

          try {

            await db.prepare(`
              DELETE FROM balls
              WHERE id = ?
            `).run(ballId);

          } catch (deleteError) {

            console.error(
              'CRITICAL: Could not remove failed ball:',
              deleteError
            );
          }
        }

        try {

          await restoreInningsSnapshot(
            innings
          );

        } catch (restoreError) {

          console.error(
            'CRITICAL innings restore failure:',
            restoreError
          );
        }

        try {

          await restoreMatchSnapshot(
            matchSnapshot
          );

        } catch (restoreError) {

          console.error(
            'CRITICAL match restore failure:',
            restoreError
          );
        }

        throw operationError;
      }
    }
  );
}

/* =========================================================
   UNDO LAST BALL
========================================================= */

async function undoLastBall(
  inningsId
) {

  return withInningsLock(
    inningsId,
    async () => {

      const innings =
        await getInnings(
          inningsId
        );

      if (!innings) {
        throw new Error(
          'Innings not found'
        );
      }

      const inningsSnapshot = {
        ...innings
      };

      const matchSnapshot =
        innings.match_id
          ? await getMatch(
              innings.match_id
            )
          : null;

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

      let ballDeleted =
        false;

      try {

        await db.prepare(`
          DELETE FROM balls
          WHERE id = ?
        `).run(last.id);

        ballDeleted =
          true;

        await recomputeInningsFromBalls(
          inningsId
        );

        await db.prepare(`
          UPDATE innings
          SET
            is_completed = 0
          WHERE id = ?
        `).run(inningsId);

        const updatedBeforeMatch =
          await getInnings(
            inningsId
          );

        if (
          updatedBeforeMatch &&
          updatedBeforeMatch.match_id
        ) {

          await db.prepare(`
            UPDATE matches
            SET status = 'live'
            WHERE id = ?
              AND status = 'innings-break'
          `).run(
            updatedBeforeMatch.match_id
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

      } catch (undoError) {

        console.error(
          'Undo operation failed. Attempting rollback:',
          undoError
        );

        if (ballDeleted) {

          try {

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
                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?
              )
            `).run(
              last.id,
              last.innings_id,
              last.over_number,
              last.ball_in_over,
              last.ball_sequence,
              last.batsman_id,
              last.non_striker_id,
              last.bowler_id,
              last.runs_batsman,
              last.extra_type,
              last.extra_runs,
              last.is_wicket,
              last.wicket_type,
              last.dismissed_id,
              last.fielder_id,
              last.is_legal,
              last.commentary
            );

          } catch (
            restoreBallError
          ) {

            console.error(
              'CRITICAL: Failed to restore deleted ball:',
              restoreBallError
            );
          }
        }

        try {

          await restoreInningsSnapshot(
            inningsSnapshot
          );

        } catch (restoreError) {

          console.error(
            'CRITICAL undo innings restore failure:',
            restoreError
          );
        }

        try {

          await restoreMatchSnapshot(
            matchSnapshot
          );

        } catch (restoreError) {

          console.error(
            'CRITICAL undo match restore failure:',
            restoreError
          );
        }

        throw undoError;
      }
    }
  );
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
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    totalRuns +=
      effect.teamRuns;

    if (
      Number(
        b.is_legal
      ) === 1
    ) {
      totalBalls += 1;
    }

    if (
      Number(
        b.is_wicket
      ) === 1
    ) {
      totalWickets += 1;
    }

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

        extras.wide +=
          effect.teamRuns;

      } else {

        extras[
          b.extra_type
        ] +=
          Number(
            b.extra_runs || 0
          );
      }
    }

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
        String(
          b.dismissed_id
        ) ===
        String(
          ballStriker
        )
      ) {

        ballStriker =
          null;

      } else if (
        String(
          b.dismissed_id
        ) ===
        String(
          ballNonStriker
        )
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

      bowler =
        null;
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
    ) >=
    Number(
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
  `).run(inningsId);

  /*
   * Second innings -> complete match.
   */
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

  /*
   * First innings -> innings break.
   */
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
    `).all(matchId);

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

  if (!inn1 || !inn2) {
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

  if (!team1 || !team2) {
    throw new Error(
      'Cannot finalize match because batting team information is missing'
    );
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
        Number(
          inn2.total_wickets || 0
        )
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
   BATTING SCORECARD
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

        runs:
          0,

        balls:
          0,

        fours:
          0,

        sixes:
          0,

        is_out:
          false,

        how_out:
          null,

        dismissed_by:
          null,

        fielder_id:
          null
      };

      order.push(id);
    }

    return stats[id];
  }

  for (const b of balls) {

    const striker =
      ensure(
        b.batsman_id
      );

    ensure(
      b.non_striker_id
    );

    /*
     * IMPORTANT:
     * Wide and no-ball are not legal balls.
     * Neither counts as a batsman's official ball faced.
     */
    if (
      b.extra_type !== 'wide' &&
      b.extra_type !== 'noball'
    ) {

      if (striker) {
        striker.balls += 1;
      }
    }

    /*
     * Batsman runs.
     */
    if (
      !b.extra_type ||
      b.extra_type === 'noball'
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

    /*
     * Wicket.
     */
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
   BOWLING SCORECARD
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

        legalBalls:
          0,

        runs:
          0,

        wickets:
          0,

        maidens:
          0,

        overRuns:
          {}
      };

      order.push(id);
    }

    return stats[id];
  }

  for (const b of balls) {

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

    const chargedRuns =
      b.extra_type === 'bye' ||
      b.extra_type === 'legbye'
        ? 0
        : effect.teamRuns;

    s.runs +=
      chargedRuns;

    /*
     * Run-out does not count as bowler wicket.
     */
    if (
      Number(
        b.is_wicket
      ) === 1 &&
      b.wicket_type &&
      b.wicket_type !== 'run-out'
    ) {
      s.wickets += 1;
    }

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
                  s.legalBalls / 6
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
   CURRENT PARTNERSHIP
========================================================= */

function buildPartnership(
  balls
) {

  let runs = 0;
  let ballsFaced = 0;

  let startIndex = 0;

  for (
    let i = balls.length - 1;
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
    let i = startIndex;
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

    if (
      Number(
        b.is_legal
      ) === 1
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
   ALL PARTNERSHIPS
========================================================= */

function buildPartnerships(
  balls
) {

  const partnerships = [];

  if (
    !balls ||
    balls.length === 0
  ) {
    return partnerships;
  }

  let partnershipRuns = 0;
  let partnershipBalls = 0;

  let batsman1Id = null;
  let batsman2Id = null;

  let partnershipNumber = 1;

  for (const b of balls) {

    if (
      !batsman1Id ||
      !batsman2Id
    ) {

      batsman1Id =
        b.batsman_id;

      batsman2Id =
        b.non_striker_id;
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

    partnershipRuns +=
      effect.teamRuns;

    if (
      Number(
        b.is_legal
      ) === 1
    ) {
      partnershipBalls += 1;
    }

    if (
      Number(
        b.is_wicket
      ) === 1
    ) {

      if (
        batsman1Id &&
        batsman2Id
      ) {

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

  if (
    batsman1Id &&
    batsman2Id
  ) {

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

function buildFallOfWickets(
  balls
) {

  const wickets = [];

  let totalRuns = 0;
  let legalBalls = 0;
  let wicketNumber = 0;

  for (const b of balls) {

    const effect =
      computeRunEffects({
        runs:
          b.runs_batsman,

        extra_type:
          b.extra_type,

        extra_runs:
          b.extra_runs
      });

    totalRuns +=
      effect.teamRuns;

    if (
      Number(
        b.is_legal
      ) === 1
    ) {
      legalBalls += 1;
    }

    if (
      Number(
        b.is_wicket
      ) === 1
    ) {

      wicketNumber += 1;

      wickets.push({

        wicket_no:
          wicketNumber,

        score:
          totalRuns,

        overs:
          oversStr(
            legalBalls
          ),

        player_id:
          b.dismissed_id,

        how_out:
          b.wicket_type ||
          'out',

        fielder_id:
          b.fielder_id ||
          null
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

  let overNumber =
    Math.floor(
      Number(
        totalBalls || 0
      ) / 6
    );

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
   EXTRAS
========================================================= */

function buildExtras(
  innings,
  balls
) {

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
   * Recalculate only if stored values are all zero.
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

    for (const b of balls) {

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

          /*
           * Only the no-ball extra itself.
           * Batsman runs are not extras.
           */
          noball += 1;

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
    `).all(inningsId);

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
    `).all(inningsId);

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
    `).all(inningsId);

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
    `).all(inningsId);

  return buildCurrentOver(
    balls,
    totalBalls
  );
}

/* =========================================================
   FULL SCOREBOARD
========================================================= */

async function getScoreboard(
  inningsId
) {

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
    `).all(inningsId);

  const battingCard =
    buildBattingScorecard(
      balls
    );

  const bowlingCard =
    buildBowlingScorecard(
      balls
    );

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

  const currentBowler =
    innings.current_bowler_id
      ? bowlingCard.find(
          b =>
            String(
              b.player_id
            ) ===
            String(
              innings.current_bowler_id
            )
        ) || null
      : null;

  const striker =
    battingCard.find(
      b =>
        String(
          b.player_id
        ) ===
        String(
          innings.striker_id
        )
    ) || null;

  const nonStriker =
    battingCard.find(
      b =>
        String(
          b.player_id
        ) ===
        String(
          innings.non_striker_id
        )
    ) || null;

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
              ballsTotal / 6
            )
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

async function computeCareerBattingStats(
  playerId
) {

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

    if (
      inningsScores[
        inningsId
      ] === undefined
    ) {
      inningsScores[
        inningsId
      ] = 0;
    }

    /*
     * Wide and no-ball are not official balls faced.
     */
    if (
      b.extra_type !== 'wide' &&
      b.extra_type !== 'noball'
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

      runs +=
        batRuns;

      inningsScores[
        inningsId
      ] += batRuns;

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

  const inningsScoreValues =
    Object.values(
      inningsScores
    ).map(
      score =>
        Number(
          score || 0
        )
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
    `).all(playerId);

  let legalBalls = 0;
  let runs = 0;
  let wickets = 0;
  let foursGiven = 0;
  let sixesGiven = 0;

  for (const b of balls) {

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
      ) === 1
    ) {
      legalBalls += 1;
    }

    const chargedRuns =
      b.extra_type === 'bye' ||
      b.extra_type === 'legbye'
        ? 0
        : effect.teamRuns;

    runs +=
      chargedRuns;

    if (
      Number(
        b.is_wicket
      ) === 1 &&
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
      Number(
        b.runs_batsman
      ) === 4
    ) {
      foursGiven += 1;
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
      sixesGiven += 1;
    }
  }

  const inningsRow =
    await db.prepare(`
      SELECT COUNT(DISTINCT innings_id) AS c
      FROM balls
      WHERE bowler_id = ?
    `).get(playerId);

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
                legalBalls / 6
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
   ALL TIME RECORDS — GCC ONLY
========================================================= */

async function getAllTimeRecords() {

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
      WHERE LOWER(
        TRIM(t.name)
      ) = 'gcc'
    `).all();

  const gccPlayerIds =
    new Set(
      gccPlayers.map(
        p => String(p.id)
      )
    );

  console.log(
    'GCC PLAYER IDS:',
    [...gccPlayerIds]
  );

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

  let bestBattingFigure =
    null;

  let bestBowling =
    null;

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
        !gccPlayerIds.has(
          String(
            b.player_id
          )
        )
      ) {
        continue;
      }

      const candidate = {

        player_id:
          b.player_id,

        player_name:
          gccPlayers.find(
            p =>
              String(p.id) ===
              String(b.player_id)
          )?.name ||
          'Unknown Player',

        runs:
          Number(
            b.runs || 0
          ),

        balls:
          Number(
            b.balls || 0
          ),

        fours:
          Number(
            b.fours || 0
          ),

        sixes:
          Number(
            b.sixes || 0
          ),

        strike_rate:
          Number(
            b.strike_rate || 0
          ),

        innings_id:
          inn.id,

        match_id:
          inn.match_id,

        innings_number:
          inn.innings_number,

        batting_team_id:
          inn.batting_team_id
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

    const bowling =
      await computeBowlingScorecard(
        inn.id
      );

    for (
      const b of bowling
    ) {

      if (
        !gccPlayerIds.has(
          String(
            b.player_id
          )
        )
      ) {
        continue;
      }

      const candidate = {

        player_id:
          b.player_id,

        player_name:
          gccPlayers.find(
            p =>
              String(p.id) ===
              String(b.player_id)
          )?.name ||
          'Unknown Player',

        wickets:
          Number(
            b.wickets || 0
          ),

        runs:
          Number(
            b.runs || 0
          ),

        overs:
          b.overs,

        balls:
          Number(
            b.balls || 0
          ),

        economy:
          Number(
            b.economy || 0
          ),

        innings_id:
          inn.id,

        match_id:
          inn.match_id,

        innings_number:
          inn.innings_number,

        bowling_team_id:
          inn.batting_team_id
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

  const battingLeaders =
    await Promise.all(
      gccPlayers.map(
        async player => ({

          player_id:
            player.id,

          player_name:
            player.name,

          ...await computeCareerBattingStats(
            player.id
          )
        })
      )
    );

  const bowlingLeaders =
    await Promise.all(
      gccPlayers.map(
        async player => ({

          player_id:
            player.id,

          player_name:
            player.name,

          ...await computeCareerBowlingStats(
            player.id
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
          b =>
            Number(
              b.balls_faced || 0
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
          b =>
            Number(
              b.balls_bowled || 0
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

