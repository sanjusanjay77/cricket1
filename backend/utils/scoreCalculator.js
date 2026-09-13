
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/*
====================================================
HELPERS
====================================================
*/

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

function isTruthy(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true'
  );
}

function sendError(res, err, fallbackStatus = 400) {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  return res.status(fallbackStatus).json({
    error:
      err?.message ||
      'Something went wrong'
  });
}

/*
====================================================
PLAYER VALIDATION
====================================================
*/

async function validatePlayer(playerId, label) {
  if (!playerId) {
    throw new Error(`${label} is required`);
  }

  const player = await db.prepare(`
    SELECT id, name, active
    FROM players
    WHERE id = ?
  `).get(playerId);

  if (!player) {
    throw new Error(
      `${label} does not exist`
    );
  }

  /*
   * Only reject explicitly inactive players.
   *
   * This keeps compatibility with older player rows
   * where active may be NULL.
   */
  if (
    player.active !== undefined &&
    player.active !== null &&
    Number(player.active) === 0
  ) {
    throw new Error(
      `${label} "${player.name}" is inactive`
    );
  }

  return player;
}

/*
====================================================
FAST BACKGROUND SOCKET BROADCAST
====================================================
*/

async function broadcast(req, matchId) {
  try {
    if (!req || !matchId) {
      return;
    }

    const io = req.app?.get('io');

    if (!io) {
      return;
    }

    const inningsRows = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `)
      .all(matchId);

    const innings = await Promise.all(
      inningsRows.map(async (row) => {
        try {
          return await calc.getScoreboard(row.id);
        } catch (err) {
          console.error(
            `Broadcast scoreboard failed for innings ${row.id}:`,
            err.message
          );

          return null;
        }
      })
    );

    const validInnings =
      innings.filter(Boolean);

    const match = await db
      .prepare(`
        SELECT *
        FROM matches
        WHERE id = ?
      `)
      .get(matchId);

    if (!match) {
      return;
    }

    io.to(`match-${matchId}`).emit(
      'score-update',
      {
        match,
        innings: validInnings
      }
    );

  } catch (err) {
    console.error(
      'Background broadcast failed:',
      err?.message || err
    );
  }
}

/*
====================================================
GET INNINGS
====================================================
*/

async function getInnings(inningsId) {
  return await db
    .prepare(`
      SELECT *
      FROM innings
      WHERE id = ?
    `)
    .get(inningsId);
}

/*
====================================================
SET BATSMEN
====================================================
*/

exports.setBatsmen = async (req, res) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const body =
      req.body || {};

    /*
    Support both formats:

    striker_id
    strikerId

    non_striker_id
    nonStrikerId
    */
    const strikerId =
      cleanId(
        body.striker_id ??
        body.strikerId
      );

    const nonStrikerId =
      cleanId(
        body.non_striker_id ??
        body.nonStrikerId
      );

    if (!strikerId) {
      return res.status(400).json({
        error:
          'striker_id is required'
      });
    }

    /*
    Striker and non-striker cannot
    be the same player.
    */
    if (
      nonStrikerId &&
      String(strikerId) ===
        String(nonStrikerId)
    ) {
      return res.status(400).json({
        error:
          'Striker and non-striker must be different'
      });
    }

    /*
    Get innings.
    */
    const innings =
      await getInnings(
        inningsId
      );

    if (!innings) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    /*
    Do not change batsmen after
    innings has finished.
    */
    if (
      isTruthy(
        innings.is_completed
      )
    ) {
      return res.status(400).json({
        error:
          'Innings is already completed'
      });
    }

    /*
    ====================================================
    VALIDATE STRIKER
    ====================================================
    */

    await validatePlayer(
      strikerId,
      'Striker'
    );

    /*
    ====================================================
    VALIDATE NON-STRIKER
    ====================================================

    If null is intentionally supplied, allow it.

    This is useful immediately after a wicket,
    where the scorer may need to select the
    replacement batsman.
    */

    if (nonStrikerId) {
      await validatePlayer(
        nonStrikerId,
        'Non-striker'
      );
    }

    /*
    ====================================================
    UPDATE BATSMEN
    ====================================================
    */

    await db
      .prepare(`
        UPDATE innings
        SET
          striker_id = ?,
          non_striker_id = ?
        WHERE id = ?
      `)
      .run(
        strikerId,
        nonStrikerId,
        inningsId
      );

    /*
    Get authoritative updated state.
    */
    const updated =
      await getInnings(
        inningsId
      );

    /*
    Respond FIRST.
    */
    res.json(updated);

    /*
    Broadcast AFTER response.
    */
    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
SWAP BATSMEN
====================================================
*/

exports.swapBatsmen = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const innings =
      await getInnings(
        inningsId
      );

    if (!innings) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    if (
      isTruthy(
        innings.is_completed
      )
    ) {
      return res.status(400).json({
        error:
          'Innings is already completed'
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

    /*
    Validate both players before swapping.
    */
    await validatePlayer(
      innings.striker_id,
      'Striker'
    );

    await validatePlayer(
      innings.non_striker_id,
      'Non-striker'
    );

    /*
    Swap.
    */
    await db
      .prepare(`
        UPDATE innings
        SET
          striker_id = ?,
          non_striker_id = ?
        WHERE id = ?
      `)
      .run(
        innings.non_striker_id,
        innings.striker_id,
        inningsId
      );

    const updated =
      await getInnings(
        inningsId
      );

    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
SWAP STRIKE
====================================================
*/

exports.swapStrike = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const innings =
      await getInnings(
        inningsId
      );

    if (!innings) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    if (
      isTruthy(
        innings.is_completed
      )
    ) {
      return res.status(400).json({
        error:
          'Innings is already completed'
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

    /*
    Validate both players before swapping.
    */
    await validatePlayer(
      innings.striker_id,
      'Striker'
    );

    await validatePlayer(
      innings.non_striker_id,
      'Non-striker'
    );

    await db
      .prepare(`
        UPDATE innings
        SET
          striker_id = ?,
          non_striker_id = ?
        WHERE id = ?
      `)
      .run(
        innings.non_striker_id,
        innings.striker_id,
        inningsId
      );

    const updated =
      await getInnings(
        inningsId
      );

    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
SET BOWLER
====================================================
*/

exports.setBowler = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const body =
      req.body || {};

    const bowlerId =
      cleanId(
        body.bowler_id ??
        body.bowlerId ??
        body.bowler
      );

    const force =
      isTruthy(body.force);

    if (!bowlerId) {
      return res.status(400).json({
        error:
          'bowler_id is required'
      });
    }

    const innings =
      await getInnings(
        inningsId
      );

    if (!innings) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    if (
      isTruthy(
        innings.is_completed
      )
    ) {
      return res.status(400).json({
        error:
          'Innings is already completed'
      });
    }

    /*
    Validate bowler.
    */
    await validatePlayer(
      bowlerId,
      'Bowler'
    );

    /*
    Same bowler cannot normally bowl
    consecutive overs.
    */
    if (!force) {
      const lastBall =
        await db
          .prepare(`
            SELECT bowler_id
            FROM balls
            WHERE innings_id = ?
            ORDER BY ball_sequence DESC
            LIMIT 1
          `)
          .get(inningsId);

      const totalBalls =
        Number(
          innings.total_balls || 0
        );

      const isOverBoundary =
        totalBalls > 0 &&
        totalBalls % 6 === 0;

      if (
        lastBall &&
        String(
          lastBall.bowler_id
        ) === String(bowlerId) &&
        isOverBoundary
      ) {
        return res.status(400).json({
          error:
            'Same bowler cannot bowl consecutive overs.'
        });
      }
    }

    await db
      .prepare(`
        UPDATE innings
        SET current_bowler_id = ?
        WHERE id = ?
      `)
      .run(
        bowlerId,
        inningsId
      );

    const updated =
      await getInnings(
        inningsId
      );

    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
RECORD BALL
====================================================
*/

exports.recordBall = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const body =
      req.body || {};

    /*
    scoreCalculator is the authoritative
    scoring engine.
    */
    const result =
      await calc.recordBall(
        inningsId,
        body
      );

    /*
    Respond immediately.
    */
    res.json(result);

    /*
    Broadcast in background.
    */
    const matchId =
      result?.innings?.match_id;

    if (matchId) {
      void broadcast(
        req,
        matchId
      );
    } else {
      void (
        async () => {
          try {
            const innings =
              await getInnings(
                inningsId
              );

            if (
              innings?.match_id
            ) {
              await broadcast(
                req,
                innings.match_id
              );
            }
          } catch (err) {
            console.error(
              'Record-ball fallback broadcast failed:',
              err.message
            );
          }
        }
      )();
    }

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
UNDO LAST BALL
====================================================
*/

exports.undoLastBall = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const result =
      await calc.undoLastBall(
        inningsId
      );

    res.json(result);

    const returnedMatchId =
      result?.innings?.match_id;

    if (returnedMatchId) {
      void broadcast(
        req,
        returnedMatchId
      );

      return;
    }

    void (
      async () => {
        try {
          const innings =
            await db
              .prepare(`
                SELECT match_id
                FROM innings
                WHERE id = ?
              `)
              .get(inningsId);

          if (
            innings?.match_id
          ) {
            await broadcast(
              req,
              innings.match_id
            );
          }
        } catch (err) {
          console.error(
            'Undo fallback broadcast failed:',
            err.message
          );
        }
      }
    )();

  } catch (err) {
    return sendError(
      res,
      err
    );
  }
};

/*
====================================================
GET SCOREBOARD
====================================================
*/

exports.getScoreboard = async (
  req,
  res
) => {
  try {
    const inningsId =
      cleanId(req.params.id);

    if (!inningsId) {
      return res.status(400).json({
        error:
          'Innings id is required'
      });
    }

    const scoreboard =
      await calc.getScoreboard(
        inningsId
      );

    if (!scoreboard) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    res.json(scoreboard);

  } catch (err) {
    return sendError(
      res,
      err,
      500
    );
  }
};

/*
====================================================
EXPORT INTERNAL HELPERS
====================================================
*/

exports.broadcast = broadcast;
exports.getInnings = getInnings;

