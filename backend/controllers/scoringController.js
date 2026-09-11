const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/*
====================================================
BACKGROUND SOCKET BROADCAST
====================================================

Important:
This function is intentionally NOT awaited by the
scoring endpoints.

The scorer should receive the saved result immediately.
The full scoreboard can be calculated in the background
for spectators / other connected devices.
*/

async function broadcast(req, matchId) {
  try {
    const io = req.app.get('io');

    if (!io) return;

    const inningsRows = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `)
      .all(matchId);

    const innings = await Promise.all(
      inningsRows.map((innings) =>
        calc.getScoreboard(innings.id)
      )
    );

    const match = await db
      .prepare(`
        SELECT *
        FROM matches
        WHERE id = ?
      `)
      .get(matchId);

    io.to(`match-${matchId}`).emit(
      'score-update',
      {
        match,
        innings
      }
    );
  } catch (err) {
    console.error(
      'Background broadcast failed:',
      err.message
    );
  }
}


/*
====================================================
SET BATSMEN
====================================================
*/

exports.setBatsmen = async (req, res) => {
  try {
    const {
      striker_id,
      non_striker_id
    } = req.body;

    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (!striker_id) {
      return res
        .status(400)
        .json({
          error: 'striker_id is required'
        });
    }

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
        striker_id,
        non_striker_id || null,
        innings.id
      );

    const updatedInnings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    /*
    Do not wait for Socket.IO.
    */
    broadcast(req, innings.match_id);

    return res.json(updatedInnings);
  } catch (err) {
    console.error(
      'setBatsmen error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
SWAP BATSMEN
====================================================
*/

exports.swapBatsmen = async (req, res) => {
  try {
    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res
        .status(400)
        .json({
          error:
            'Both batsmen must be set before swapping'
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
        innings.id
      );

    const updatedInnings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    broadcast(req, innings.match_id);

    return res.json(updatedInnings);
  } catch (err) {
    console.error(
      'swapBatsmen error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
SWAP STRIKE
====================================================
*/

exports.swapStrike = async (req, res) => {
  try {
    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res
        .status(400)
        .json({
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
        innings.id
      );

    const updatedInnings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    broadcast(req, innings.match_id);

    return res.json(updatedInnings);
  } catch (err) {
    console.error(
      'swapStrike error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
SET BOWLER
====================================================

The important part here is that the response is sent
without waiting for the full scoreboard broadcast.
*/

exports.setBowler = async (req, res) => {
  try {
    const {
      bowler_id,
      force
    } = req.body;

    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (!bowler_id) {
      return res
        .status(400)
        .json({
          error: 'bowler_id is required'
        });
    }

    /*
    Prevent same bowler from bowling consecutive
    overs.
    */
    if (!force) {
      const lastBall = await db
        .prepare(`
          SELECT
            bowler_id,
            ball_sequence,
            is_legal
          FROM balls
          WHERE innings_id = ?
          ORDER BY ball_sequence DESC
          LIMIT 1
        `)
        .get(innings.id);

      const totalBalls =
        Number(innings.total_balls || 0);

      if (
        lastBall &&
        lastBall.bowler_id === bowler_id &&
        totalBalls > 0 &&
        totalBalls % 6 === 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Same bowler cannot bowl consecutive overs. Pass force:true to override.'
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
        bowler_id,
        innings.id
      );

    /*
    Read only the updated innings.
    Do NOT calculate the entire scoreboard here.
    */
    const updatedInnings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    /*
    Respond immediately.
    */
    res.json(updatedInnings);

    /*
    Full scoreboard broadcast happens in background.
    */
    broadcast(
      req,
      innings.match_id
    );
  } catch (err) {
    console.error(
      'setBowler error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
RECORD BALL
====================================================

The most important endpoint.

The ball is saved first.
The scorer receives the updated innings immediately.

The expensive full scoreboard calculation happens
after the response.
*/

exports.recordBall = async (req, res) => {
  try {
    const result =
      await calc.recordBall(
        req.params.id,
        req.body
      );

    /*
    Get the updated innings only.
    This is much cheaper than calculating the complete
    batting + bowling scoreboard.
    */
    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    /*
    Send response immediately.
    */
    res.json({
      ...result,
      innings
    });

    /*
    IMPORTANT:
    Do not await this.

    Other devices will still receive the full
    scoreboard through Socket.IO.
    */
    broadcast(
      req,
      innings.match_id
    );
  } catch (err) {
    console.error(
      'recordBall error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
UNDO LAST BALL
====================================================
*/

exports.undoLastBall = async (req, res) => {
  try {
    const result =
      await calc.undoLastBall(
        req.params.id
      );

    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    res.json({
      ...result,
      innings
    });

    broadcast(
      req,
      innings.match_id
    );
  } catch (err) {
    console.error(
      'undoLastBall error:',
      err
    );

    return res
      .status(400)
      .json({
        error: err.message
      });
  }
};


/*
====================================================
GET SCOREBOARD
====================================================
*/

exports.getScoreboard = async (req, res) => {
  try {
    const scoreboard =
      await calc.getScoreboard(
        req.params.id
      );

    if (!scoreboard) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    return res.json(scoreboard);
  } catch (err) {
    console.error(
      'getScoreboard error:',
      err
    );

    return res
      .status(500)
      .json({
        error: err.message
      });
  }
};const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

async function broadcast(req, matchId) {
  try {
    const io = req.app.get('io');

    if (!io) return;

    const inningsRows = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `)
      .all(matchId);

    const innings = await Promise.all(
      inningsRows.map(i =>
        calc.getScoreboard(i.id)
      )
    );

    const match = await db
      .prepare(`
        SELECT *
        FROM matches
        WHERE id = ?
      `)
      .get(matchId);

    io.to(`match-${matchId}`).emit(
      'score-update',
      {
        match,
        innings
      }
    );
  } catch (err) {
    console.error(
      'Background broadcast failed:',
      err.message
    );
  }
}

// ----------------------------------------------------
// SET BATSMEN
// ----------------------------------------------------

exports.setBatsmen = async (req, res) => {
  try {
    const {
      striker_id,
      non_striker_id
    } = req.body;

    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (!striker_id) {
      return res
        .status(400)
        .json({
          error: 'striker_id is required'
        });
    }

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
        striker_id,
        non_striker_id || null,
        innings.id
      );

    const updatedInnings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(innings.id);

    // Broadcast in background
    broadcast(
      req,
      innings.match_id
    );

    // Respond immediately
    res.json(updatedInnings);

  } catch (err) {
    console.error(
      'setBatsmen error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// SWAP BATSMEN
// ----------------------------------------------------

exports.swapBatsmen = async (req, res) => {
  try {
    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res
        .status(400)
        .json({
          error:
            'Both batsmen must be set before swapping'
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
        innings.id
      );

    const updatedInnings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(innings.id);

    broadcast(
      req,
      innings.match_id
    );

    res.json(updatedInnings);

  } catch (err) {
    console.error(
      'swapBatsmen error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// SWAP STRIKE
// ----------------------------------------------------

exports.swapStrike = async (req, res) => {
  try {
    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (
      !innings.striker_id ||
      !innings.non_striker_id
    ) {
      return res
        .status(400)
        .json({
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
        innings.id
      );

    const updatedInnings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(innings.id);

    broadcast(
      req,
      innings.match_id
    );

    res.json(updatedInnings);

  } catch (err) {
    console.error(
      'swapStrike error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// SET BOWLER
// ----------------------------------------------------

exports.setBowler = async (req, res) => {
  try {
    const {
      bowler_id,
      force
    } = req.body;

    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    if (!innings) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    if (!bowler_id) {
      return res
        .status(400)
        .json({
          error: 'bowler_id is required'
        });
    }

    // Check consecutive-over rule
    if (!force) {
      const lastBall = await db
        .prepare(`
          SELECT *
          FROM balls
          WHERE innings_id = ?
          ORDER BY ball_sequence DESC
          LIMIT 1
        `)
        .get(innings.id);

      if (
        lastBall &&
        lastBall.bowler_id === bowler_id &&
        Number(innings.total_balls || 0) % 6 === 0 &&
        Number(innings.total_balls || 0) > 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Same bowler cannot bowl consecutive overs. Pass force:true to override.'
          });
      }
    }

    // IMPORTANT:
    // Update database immediately.
    await db
      .prepare(`
        UPDATE innings
        SET current_bowler_id = ?
        WHERE id = ?
      `)
      .run(
        bowler_id,
        innings.id
      );

    // Get updated innings immediately
    const updatedInnings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(innings.id);

    // Do NOT wait for scoreboard broadcast.
    broadcast(
      req,
      innings.match_id
    );

    // Respond immediately
    res.json(updatedInnings);

  } catch (err) {
    console.error(
      'setBowler error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// RECORD BALL
// ----------------------------------------------------

exports.recordBall = async (req, res) => {
  try {
    // Record the ball first
    const result = await calc.recordBall(
      req.params.id,
      req.body
    );

    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    // IMPORTANT:
    // Send scorer response immediately.
    res.json({
      ...result,
      innings
    });

    // Broadcast AFTER response.
    // This prevents the scorer from waiting
    // for scoreboard calculation.
    broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'recordBall error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// UNDO LAST BALL
// ----------------------------------------------------

exports.undoLastBall = async (req, res) => {
  try {
    const result =
      await calc.undoLastBall(
        req.params.id
      );

    const innings = await db
      .prepare(
        'SELECT * FROM innings WHERE id = ?'
      )
      .get(req.params.id);

    // Respond immediately
    res.json({
      ...result,
      innings
    });

    // Broadcast in background
    broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'undoLastBall error:',
      err
    );

    res
      .status(400)
      .json({
        error: err.message
      });
  }
};

// ----------------------------------------------------
// GET SCOREBOARD
// ----------------------------------------------------

exports.getScoreboard = async (req, res) => {
  try {
    const scoreboard =
      await calc.getScoreboard(
        req.params.id
      );

    if (!scoreboard) {
      return res
        .status(404)
        .json({
          error: 'Innings not found'
        });
    }

    res.json(scoreboard);

  } catch (err) {
    console.error(
      'getScoreboard error:',
      err
    );

    res
      .status(500)
      .json({
        error: err.message
      });
  }
};
