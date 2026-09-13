
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

  return String(value).trim();
}

function isTruthy(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true'
  );
}

/*
====================================================
ERROR HANDLER
====================================================
*/

function sendError(res, err, status = 400) {
  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  console.error(
    '❌ SCORING CONTROLLER ERROR'
  );

  console.error(
    'Message:',
    err?.message || err
  );

  console.error(
    'Stack:',
    err?.stack || 'No stack trace available'
  );

  console.error(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

  if (!res) {
    return;
  }

  if (
    typeof res.status !== 'function' ||
    typeof res.json !== 'function'
  ) {
    console.error(
      '❌ Invalid Express response object'
    );
    return;
  }

  if (res.headersSent) {
    return;
  }

  return res.status(status).json({
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

async function validatePlayer(
  playerId,
  label
) {
  if (!playerId) {
    throw new Error(
      `${label} is required`
    );
  }

  const player =
    await db
      .prepare(`
        SELECT
          id,
          name,
          active
        FROM players
        WHERE id = ?
      `)
      .get(playerId);

  if (!player) {
    throw new Error(
      `${label} does not exist`
    );
  }

  /*
   * Explicitly inactive players
   * are not allowed.
   *
   * NULL active values remain compatible
   * with older player records.
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
GET INNINGS
====================================================
*/

async function getInnings(inningsId) {
  if (!inningsId) {
    return null;
  }

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
BROADCAST SCORE UPDATE
====================================================
*/

async function broadcast(
  req,
  matchId
) {
  try {
    if (!req || !matchId) {
      return;
    }

    const io =
      req.app &&
      typeof req.app.get === 'function'
        ? req.app.get('io')
        : null;

    if (!io) {
      console.warn(
        '⚠️ Socket.IO instance not available'
      );
      return;
    }

    const inningsRows =
      await db
        .prepare(`
          SELECT *
          FROM innings
          WHERE match_id = ?
          ORDER BY innings_number ASC
        `)
        .all(matchId);

    const scoreboards = [];

    for (
      const row of inningsRows
    ) {
      if (!row || !row.id) {
        console.warn(
          '⚠️ Invalid innings row during broadcast:',
          row
        );
        continue;
      }

      try {
        const scoreboard =
          await calc.getScoreboard(
            row.id
          );

        if (scoreboard) {
          scoreboards.push(
            scoreboard
          );
        }
      } catch (err) {
        console.error(
          `❌ Scoreboard broadcast failed for innings ${row.id}:`,
          err?.message || err
        );
      }
    }

    const match =
      await db
        .prepare(`
          SELECT *
          FROM matches
          WHERE id = ?
        `)
        .get(matchId);

    if (!match) {
      console.warn(
        `⚠️ Match ${matchId} not found during broadcast`
      );
      return;
    }

    io
      .to(`match-${matchId}`)
      .emit(
        'score-update',
        {
          match,
          innings: scoreboards
        }
      );

  } catch (err) {
    console.error(
      '❌ Broadcast failed:',
      err?.message || err
    );

    console.error(
      err?.stack || ''
    );
  }
}

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

    return res.json(
      scoreboard
    );

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
SET BATSMEN
====================================================
*/

exports.setBatsmen = async (
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
    Same player cannot be both batsmen.
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
    Validate striker.
    */
    await validatePlayer(
      strikerId,
      'Striker'
    );

    /*
    Validate non-striker.
    */
    if (nonStrikerId) {
      await validatePlayer(
        nonStrikerId,
        'Non-striker'
      );
    }

    /*
    Save batsmen.
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

    const updated =
      await getInnings(
        inningsId
      );

    return res.json(
      updated
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

    return res.json(
      updated
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

    return res.json(
      updated
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

    await validatePlayer(
      bowlerId,
      'Bowler'
    );

    /*
    Save current bowler.
    */
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

    return res.json(
      updated
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
    Log the request when debugging.
    */
    console.log(
      '🏏 Recording ball:',
      {
        inningsId,
        body
      }
    );

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
    Log successful result.
    */
    console.log(
      '✅ Ball recorded successfully'
    );

    /*
    Send response first.
    */
    res.json(result);

    /*
    Broadcast after response.
    */
    let matchId =
      result?.innings?.match_id;

    if (!matchId) {
      const innings =
        await getInnings(
          inningsId
        );

      matchId =
        innings?.match_id;
    }

    if (matchId) {
      void broadcast(
        req,
        matchId
      );
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

    let matchId =
      result?.innings?.match_id;

    if (!matchId) {
      const innings =
        await getInnings(
          inningsId
        );

      matchId =
        innings?.match_id;
    }

    if (matchId) {
      void broadcast(
        req,
        matchId
      );
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
EXPORT HELPERS
====================================================
*/

exports.broadcast = broadcast;
exports.getInnings = getInnings;
