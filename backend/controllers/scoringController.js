const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/*
====================================================
FAST BACKGROUND SOCKET BROADCAST
====================================================

Never block the scorer response with this.
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
      inningsRows.map((row) =>
        calc.getScoreboard(row.id)
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

    if (!striker_id) {
      return res.status(400).json({
        error: 'striker_id is required'
      });
    }

    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    await db
      .prepare(`
        UPDATE innings
        SET
          striker_id = ?,
          non_striker_id = COALESCE(?, non_striker_id)
        WHERE id = ?
      `)
      .run(
        striker_id,
        non_striker_id || null,
        innings.id
      );

    const updated = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    res.json(updated);

    /*
    Background only.
    */
    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'setBatsmen error:',
      err
    );

    res.status(400).json({
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
      return res.status(404).json({
        error: 'Innings not found'
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

    const updated = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'swapBatsmen error:',
      err
    );

    res.status(400).json({
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
      return res.status(404).json({
        error: 'Innings not found'
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
        innings.id
      );

    const updated = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'swapStrike error:',
      err
    );

    res.status(400).json({
      error: err.message
    });
  }
};


/*
====================================================
SET BOWLER
====================================================
*/

exports.setBowler = async (req, res) => {
  try {
    const {
      bowler_id,
      force
    } = req.body;

    if (!bowler_id) {
      return res.status(400).json({
        error: 'bowler_id is required'
      });
    }

    const innings = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (!innings) {
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    /*
    Same bowler cannot bowl consecutive overs.
    */
    if (!force) {
      const lastBall = await db
        .prepare(`
          SELECT bowler_id
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
        bowler_id,
        innings.id
      );

    const updated = await db
      .prepare(`
        SELECT *
        FROM innings
        WHERE id = ?
      `)
      .get(innings.id);

    /*
    IMPORTANT:
    Send immediately.
    */
    res.json(updated);

    void broadcast(
      req,
      innings.match_id
    );

  } catch (err) {
    console.error(
      'setBowler error:',
      err
    );

    res.status(400).json({
      error: err.message
    });
  }
};


/*
====================================================
RECORD BALL
====================================================

FAST PATH

1. Save ball
2. Return result
3. Do NOT calculate another full scoreboard
4. Broadcast in background
====================================================
*/

exports.recordBall = async (req, res) => {
  try {
    const result =
      await calc.recordBall(
        req.params.id,
        req.body
      );

    /*
    calc.recordBall already returns the updated
    scoreboard.

    Therefore DO NOT perform another SELECT innings
    here.
    */

    res.json(result);

    /*
    Background synchronization only.
    */
    if (result?.innings?.match_id) {
      void broadcast(
        req,
        result.innings.match_id
      );
    }

  } catch (err) {
    console.error(
      'recordBall error:',
      err
    );

    res.status(400).json({
      error: err.message
    });
  }
};


/*
====================================================
UNDO
====================================================
*/

exports.undoLastBall = async (req, res) => {
  try {
    const result =
      await calc.undoLastBall(
        req.params.id
      );

    /*
    Again, don't SELECT innings unnecessarily.
    */
    res.json(result);

    /*
    Get match id only for background broadcast.
    */
    const innings = await db
      .prepare(`
        SELECT match_id
        FROM innings
        WHERE id = ?
      `)
      .get(req.params.id);

    if (innings?.match_id) {
      void broadcast(
        req,
        innings.match_id
      );
    }

  } catch (err) {
    console.error(
      'undoLastBall error:',
      err
    );

    res.status(400).json({
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
      return res.status(404).json({
        error: 'Innings not found'
      });
    }

    res.json(scoreboard);

  } catch (err) {
    console.error(
      'getScoreboard error:',
      err
    );

    res.status(500).json({
      error: err.message
    });
  }
};
