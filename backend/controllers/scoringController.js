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
FAST BACKGROUND SOCKET BROADCAST
====================================================

IMPORTANT:

This function is intentionally NOT awaited
by the main HTTP response.

The scorer should receive the response immediately.

If Socket.IO/database broadcasting fails,
the scoring operation itself is NOT affected.
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

    /*
    Get all innings belonging to this match.
    */
    const inningsRows = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `)
      .all(matchId);

    /*
    Build scoreboard for every innings.

    Promise.all is safe here because these are
    independent reads.
    */
    const innings = await Promise.all(
      inningsRows.map(async (row) => {
        try {
          return await calc.getScoreboard(
            row.id
          );
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

    /*
    Match itself.
    */
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

    /*
    Send live update to everyone viewing
    this match.
    */
    io.to(`match-${matchId}`).emit(
      'score-update',
      {
        match,
        innings: validInnings
      }
    );

  } catch (err) {
    /*
    NEVER allow background broadcast failure
    to crash the scoring request.
    */
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
    Get innings.
    */
    const innings =
      await getInnings(inningsId);

    if (!innings) {
      return res.status(404).json({
        error:
          'Innings not found'
      });
    }

    /*
    Do not allow changing batsmen after
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
    If non-striker is provided, it must
    be different from striker.
    */
    if (
      nonStrikerId &&
      strikerId === nonStrikerId
    ) {
      return res.status(400).json({
        error:
          'Striker and non-striker must be different'
      });
    }

    /*
    Update batsmen.
    */
    await db
      .prepare(`
        UPDATE innings
        SET
          striker_id = ?,
          non_striker_id =
            COALESCE(?, non_striker_id)
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

    /*
    Respond immediately.
    */
    res.json(updated);

    /*
    Background only.
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
SWAP STRIKE
====================================================

This intentionally performs the same operation
as swapBatsmen.

Kept as a separate endpoint because your frontend
uses /swap-strike.
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

    /*
    Support:

    bowler_id
    bowlerId
    bowler
    */
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

    /*
    Set bowler.
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

    /*
    Respond immediately.
    */
    res.json(updated);

    /*
    Broadcast in background.
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
RECORD BALL
====================================================

FAST PATH:

1. Send ball to scoreCalculator
2. Save ball
3. Get result
4. Return immediately
5. Broadcast in background

IMPORTANT:

This controller does NOT perform another
scoreboard calculation after calc.recordBall().
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
    Let scoreCalculator perform the
    actual scoring/database operation.
    */
    const result =
      await calc.recordBall(
        inningsId,
        body
      );

    /*
    IMPORTANT:

    Respond immediately.

    Do not await broadcast().
    */
    res.json(result);

    /*
    Find match id from returned innings
    if available.
    */
    const matchId =
      result?.innings?.match_id;

    if (matchId) {
      void broadcast(
        req,
        matchId
      );
    } else {
      /*
      Fallback only if calculator does not
      return match_id.
      */
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

    /*
    Perform undo first.
    */
    const result =
      await calc.undoLastBall(
        inningsId
      );

    /*
    Respond immediately.
    */
    res.json(result);

    /*
    If calculator returned match_id,
    use it without another query.
    */
    const returnedMatchId =
      result?.innings?.match_id;

    if (returnedMatchId) {
      void broadcast(
        req,
        returnedMatchId
      );

      return;
    }

    /*
    Fallback:
    only query match_id when calculator
    did not return it.
    */
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

Useful if another controller needs to use them.
====================================================
*/

exports.broadcast = broadcast;
exports.getInnings = getInnings;
