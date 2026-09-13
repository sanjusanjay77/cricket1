const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { getScoreboard } = require('../utils/scoreCalculator');

/* =========================================================
   HELPERS
========================================================= */

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

function sendError(
  res,
  error,
  fallback = 'Something went wrong'
) {
  console.error(error);

  return res.status(500).json({
    error:
      error?.message ||
      fallback
  });
}

async function getMatchById(id) {
  return db.prepare(`
    SELECT *
    FROM matches
    WHERE id = ?
  `).get(id);
}

async function teamExists(teamId) {
  if (!teamId) {
    return false;
  }

  const team = await db.prepare(`
    SELECT id
    FROM teams
    WHERE id = ?
  `).get(teamId);

  return !!team;
}

/* =========================================================
   LIVE MATCH NOTIFICATION
========================================================= */

async function sendLiveMatchNotification(
  req,
  matchId,
  notificationMessage
) {
  try {

    /*
     * Socket.IO instance is stored in server.js
     * using:
     *
     * app.set('io', io)
     */
    const io =
      req.app.get('io');

    if (!io) {

      console.warn(
        '⚠️ Socket.IO instance not available. Notification skipped.'
      );

      return;
    }

    /*
     * Get match + team names.
     */
    const match =
      await db.prepare(`
        SELECT
          m.id,
          m.team1_id,
          m.team2_id,
          t1.name AS team1_name,
          t2.name AS team2_name
        FROM matches m
        JOIN teams t1
          ON t1.id = m.team1_id
        JOIN teams t2
          ON t2.id = m.team2_id
        WHERE m.id = ?
      `).get(matchId);

    if (!match) {

      console.warn(
        `⚠️ Match ${matchId} not found while sending notification.`
      );

      return;
    }

    /*
     * Get all users who enabled notifications.
     */
    const users =
      await db.prepare(`
        SELECT
          id,
          name,
          email,
          phone
        FROM notification_users
        WHERE notifications_enabled = 1
      `).all();

    const registeredUsers =
      users || [];

    if (
      registeredUsers.length === 0
    ) {

      console.log(
        '🔔 No enabled notification users found.'
      );

      return;
    }

    const payload = {

      matchId:
        String(match.id),

      title:
        '🏏 GCC Cricket - Match Live',

      message:
        notificationMessage ||
        `${match.team1_name} vs ${match.team2_name} is now live!`,

      teams:
        `${match.team1_name} vs ${match.team2_name}`,

      url:
        `/match/${match.id}/live`
    };

    let sentCount = 0;

    /*
     * Send notification to each registered
     * user's Socket.IO room.
     *
     * Room format:
     *
     * user-USER_ID
     */
    for (
      const user
      of registeredUsers
    ) {

      if (!user?.id) {
        continue;
      }

      const room =
        `user-${String(user.id)}`;

      io
        .to(room)
        .emit(
          'match-started',
          payload
        );

      sentCount++;
    }

    console.log(
      `🔔 Live match notification emitted to ${sentCount} registered user room(s).`
    );

  } catch (notificationError) {

    /*
     * Notification failure must NEVER
     * prevent the match from starting.
     */
    console.error(
      '❌ Failed to send live match notification:',
      notificationError
    );
  }
}

/* =========================================================
   LIST MATCHES
========================================================= */

exports.listMatches = async (
  req,
  res
) => {

  try {

    const matches =
      await db.prepare(`
        SELECT
          m.*,

          t1.name AS team1_name,
          t1.short_name AS team1_short,

          t2.name AS team2_name,
          t2.short_name AS team2_short

        FROM matches m

        JOIN teams t1
          ON t1.id = m.team1_id

        JOIN teams t2
          ON t2.id = m.team2_id

        ORDER BY
          m.created_at DESC
      `).all();

    return res.json(
      matches || []
    );

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to load matches'
    );
  }
};

/* =========================================================
   CREATE MATCH
========================================================= */

exports.createMatch = async (
  req,
  res
) => {

  try {

    const {
      team1_id,
      team2_id,
      match_type,
      overs_limit,
      venue,
      match_date
    } = req.body || {};

    const team1 =
      cleanId(team1_id);

    const team2 =
      cleanId(team2_id);

    if (!team1 || !team2) {

      return res.status(400).json({
        error:
          'team1_id and team2_id are required'
      });
    }

    if (
      team1 === team2
    ) {

      return res.status(400).json({
        error:
          'A team cannot play itself'
      });
    }

    /*
     * Validate both teams before INSERT.
     */
    if (
      !(await teamExists(team1))
    ) {

      return res.status(400).json({
        error:
          'Team 1 does not exist'
      });
    }

    if (
      !(await teamExists(team2))
    ) {

      return res.status(400).json({
        error:
          'Team 2 does not exist'
      });
    }

    const overs =
      overs_limit === undefined ||
      overs_limit === null ||
      overs_limit === ''
        ? 20
        : Number(overs_limit);

    if (
      !Number.isFinite(overs) ||
      overs <= 0 ||
      overs > 1000
    ) {

      return res.status(400).json({
        error:
          'overs_limit must be between 1 and 1000'
      });
    }

    const id =
      uuidv4();

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
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, 'upcoming'
      )
    `).run(
      id,
      team1,
      team2,
      match_type ||
        'T20',
      overs,
      venue ||
        null,
      match_date ||
        null
    );

    const created =
      await getMatchById(id);

    return res
      .status(201)
      .json(created);

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to create match'
    );
  }
};

/* =========================================================
   SET TOSS
========================================================= */

exports.setToss = async (
  req,
  res
) => {

  try {

    const matchId =
      cleanId(
        req.params.id
      );

    const {
      toss_winner_id,
      toss_decision
    } = req.body || {};

    const tossWinner =
      cleanId(
        toss_winner_id
      );

    const match =
      await getMatchById(
        matchId
      );

    if (!match) {

      return res.status(404).json({
        error:
          'Match not found'
      });
    }

    /*
     * Do not allow changing toss after
     * match has already progressed.
     */
    if (
      match.status !== 'upcoming'
    ) {

      return res.status(400).json({
        error:
          'Toss can only be set before the match starts'
      });
    }

    if (!tossWinner) {

      return res.status(400).json({
        error:
          'toss_winner_id is required'
      });
    }

    if (
      ![
        String(match.team1_id),
        String(match.team2_id)
      ].includes(
        String(tossWinner)
      )
    ) {

      return res.status(400).json({
        error:
          'toss_winner_id must be one of the two playing teams'
      });
    }

    if (
      ![
        'bat',
        'bowl'
      ].includes(
        toss_decision
      )
    ) {

      return res.status(400).json({
        error:
          'toss_decision must be bat or bowl'
      });
    }

    /*
     * Make sure there is no existing innings.
     */
    const existingInnings =
      await db.prepare(`
        SELECT id
        FROM innings
        WHERE match_id = ?
        LIMIT 1
      `).get(matchId);

    if (existingInnings) {

      return res.status(400).json({
        error:
          'Match innings have already been created'
      });
    }

    const battingFirstId =
      toss_decision === 'bat'
        ? tossWinner
        : (
            String(tossWinner) ===
            String(match.team1_id)
              ? match.team2_id
              : match.team1_id
          );

    const bowlingFirstId =
      String(battingFirstId) ===
      String(match.team1_id)
        ? match.team2_id
        : match.team1_id;

    const inningsId =
      uuidv4();

    /*
     * Update match first.
     */
    await db.prepare(`
      UPDATE matches
      SET
        toss_winner_id = ?,
        toss_decision = ?,
        status = ?,
        current_innings = ?
      WHERE id = ?
    `).run(
      tossWinner,
      toss_decision,
      'live',
      1,
      matchId
    );

    try {

      /*
       * Create first innings.
       */
      await db.prepare(`
        INSERT INTO innings (
          id,
          match_id,
          innings_number,
          batting_team_id,
          bowling_team_id
        )
        VALUES (
          ?, ?, 1, ?, ?
        )
      `).run(
        inningsId,
        matchId,
        battingFirstId,
        bowlingFirstId
      );

    } catch (inningsError) {

      /*
       * Roll match back if innings creation fails.
       */
      try {

        await db.prepare(`
          UPDATE matches
          SET
            toss_winner_id = ?,
            toss_decision = ?,
            status = ?,
            current_innings = ?
          WHERE id = ?
        `).run(
          match.toss_winner_id,
          match.toss_decision,
          match.status,
          match.current_innings,
          matchId
        );

      } catch (rollbackError) {

        console.error(
          'CRITICAL: Failed to rollback toss:',
          rollbackError
        );
      }

      throw inningsError;
    }

    const updatedMatch =
      await getMatchById(
        matchId
      );

    /*
     * =====================================================
     * SEND LIVE MATCH NOTIFICATION
     * =====================================================
     *
     * The match is now officially live.
     *
     * Notification errors are internally handled and
     * will NOT break this API request.
     */
    await sendLiveMatchNotification(
      req,
      matchId,
      `${updatedMatch?.team1_name || 'Team 1'} vs ${updatedMatch?.team2_name || 'Team 2'} is now live!`
    );

    return res.json({

      match:
        updatedMatch,

      innings_id:
        inningsId,

      batting_first_id:
        battingFirstId,

      bowling_first_id:
        bowlingFirstId
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to set toss'
    );
  }
};

/* =========================================================
   START SECOND INNINGS
========================================================= */

exports.startSecondInnings = async (
  req,
  res
) => {

  try {

    const matchId =
      cleanId(
        req.params.id
      );

    const match =
      await getMatchById(
        matchId
      );

    if (!match) {

      return res.status(404).json({
        error:
          'Match not found'
      });
    }

    /*
     * Only innings-break should start
     * the second innings.
     */
    if (
      match.status !==
      'innings-break'
    ) {

      return res.status(400).json({
        error:
          'Match is not ready for the second innings'
      });
    }

    const inn1 =
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
          AND innings_number = 1
        LIMIT 1
      `).get(matchId);

    if (!inn1) {

      return res.status(400).json({
        error:
          'First innings not found'
      });
    }

    if (
      Number(
        inn1.is_completed
      ) !== 1
    ) {

      return res.status(400).json({
        error:
          'First innings has not finished yet'
      });
    }

    /*
     * Prevent duplicate second innings.
     */
    const existingSecond =
      await db.prepare(`
        SELECT id
        FROM innings
        WHERE match_id = ?
          AND innings_number = 2
        LIMIT 1
      `).get(matchId);

    if (existingSecond) {

      return res.status(400).json({
        error:
          'Second innings already exists'
      });
    }

    const target =
      Number(
        inn1.total_runs || 0
      ) + 1;

    const inningsId =
      uuidv4();

    /*
     * Team that batted first now bowls.
     * Team that bowled first now bats.
     */
    const battingTeam =
      inn1.bowling_team_id;

    const bowlingTeam =
      inn1.batting_team_id;

    if (
      !battingTeam ||
      !bowlingTeam
    ) {

      return res.status(400).json({
        error:
          'First innings team information is incomplete'
      });
    }

    /*
     * Validate teams before INSERT.
     */
    if (
      !(await teamExists(
        battingTeam
      ))
    ) {

      return res.status(400).json({
        error:
          'Second innings batting team does not exist'
      });
    }

    if (
      !(await teamExists(
        bowlingTeam
      ))
    ) {

      return res.status(400).json({
        error:
          'Second innings bowling team does not exist'
      });
    }

    await db.prepare(`
      INSERT INTO innings (
        id,
        match_id,
        innings_number,
        batting_team_id,
        bowling_team_id,
        target
      )
      VALUES (
        ?, ?, 2, ?, ?, ?
      )
    `).run(
      inningsId,
      matchId,
      battingTeam,
      bowlingTeam,
      target
    );

    try {

      await db.prepare(`
        UPDATE matches
        SET
          status = ?,
          current_innings = ?
        WHERE id = ?
      `).run(
        'live',
        2,
        matchId
      );

    } catch (matchUpdateError) {

      /*
       * Remove the second innings if the
       * match update fails.
       */
      try {

        await db.prepare(`
          DELETE FROM innings
          WHERE id = ?
        `).run(
          inningsId
        );

      } catch (rollbackError) {

        console.error(
          'CRITICAL: Failed to rollback second innings:',
          rollbackError
        );
      }

      throw matchUpdateError;
    }

    /*
     * =====================================================
     * SEND SECOND INNINGS NOTIFICATION
     * =====================================================
     */
    await sendLiveMatchNotification(
      req,
      matchId,
      `The second innings of the match is now live!`
    );

    return res.json({

      innings_id:
        inningsId,

      target,

      batting_team_id:
        battingTeam,

      bowling_team_id:
        bowlingTeam
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to start second innings'
    );
  }
};

/* =========================================================
   GET MATCH DETAIL
========================================================= */

exports.getMatchDetail = async (
  req,
  res
) => {

  try {

    const matchId =
      cleanId(
        req.params.id
      );

    const match =
      await db.prepare(`
        SELECT
          m.*,

          t1.name AS team1_name,
          t1.short_name AS team1_short,
          t1.logo_color AS team1_color,

          t2.name AS team2_name,
          t2.short_name AS team2_short,
          t2.logo_color AS team2_color

        FROM matches m

        JOIN teams t1
          ON t1.id = m.team1_id

        JOIN teams t2
          ON t2.id = m.team2_id

        WHERE m.id = ?
      `).get(matchId);

    if (!match) {

      return res.status(404).json({
        error:
          'Match not found'
      });
    }

    const inningsRows =
      await db.prepare(`
        SELECT *
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number ASC
      `).all(match.id);

    /*
     * Build scoreboards individually.
     *
     * One bad scoreboard should not crash
     * the whole match page.
     */
    const innings =
      [];

    for (
      const inningsRow
      of inningsRows
    ) {

      try {

        const scoreboard =
          await getScoreboard(
            inningsRow.id
          );

        innings.push(
          scoreboard
        );

      } catch (scoreError) {

        console.error(
          `Failed to build scoreboard for innings ${inningsRow.id}:`,
          scoreError
        );

        /*
         * Return basic innings information
         * instead of crashing the entire match page.
         */
        innings.push({

          innings:
            inningsRow,

          error:
            'Scoreboard temporarily unavailable'
        });
      }
    }

    const players =
      await db.prepare(`
        SELECT *
        FROM players
        WHERE team_id IN (?, ?)
        ORDER BY name ASC
      `).all(
        match.team1_id,
        match.team2_id
      );

    return res.json({

      match,

      innings:
        innings || [],

      players:
        players || []
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to load match details'
    );
  }
};

/* =========================================================
   DELETE MATCH
========================================================= */

exports.deleteMatch = async (
  req,
  res
) => {

  try {

    const matchId =
      cleanId(
        req.params.id
      );

    /*
     * Validate match ID.
     */
    if (!matchId) {

      return res.status(400).json({
        error:
          'Match ID is required'
      });
    }

    /*
     * Check whether match exists.
     */
    const match =
      await getMatchById(
        matchId
      );

    if (!match) {

      return res.status(404).json({
        error:
          'Match not found'
      });
    }

    /*
     * Get all innings for this match.
     *
     * We need their IDs because balls reference
     * innings through innings_id.
     */
    const inningsRows =
      await db.prepare(`
        SELECT id
        FROM innings
        WHERE match_id = ?
        ORDER BY innings_number DESC
      `).all(matchId);

    const inningsList =
      inningsRows || [];

    /*
     * =====================================================
     * STEP 1
     * Delete all balls belonging to each innings.
     * =====================================================
     *
     * This MUST happen before deleting innings because
     * balls reference innings.
     */
    for (
      const inningsRow
      of inningsList
    ) {

      if (!inningsRow?.id) {
        continue;
      }

      await db.prepare(`
        DELETE FROM balls
        WHERE innings_id = ?
      `).run(
        inningsRow.id
      );
    }

    /*
     * =====================================================
     * STEP 2
     * Delete all innings belonging to the match.
     * =====================================================
     */
    await db.prepare(`
      DELETE FROM innings
      WHERE match_id = ?
    `).run(
      matchId
    );

    /*
     * =====================================================
     * STEP 3
     * Delete the match itself.
     * =====================================================
     */
    await db.prepare(`
      DELETE FROM matches
      WHERE id = ?
    `).run(
      matchId
    );

    console.log(
      `🗑️ Match deleted successfully: ${matchId}`
    );

    return res.status(200).json({

      success:
        true,

      message:
        'Match and all scoring data were deleted successfully.',

      match_id:
        matchId,

      innings_deleted:
        inningsList.length
    });

  } catch (error) {

    console.error(
      '❌ Delete match failed:',
      error
    );

    const message =
      String(
        error?.message || ''
      ).toLowerCase();

    /*
     * Handle foreign-key / constraint errors
     * without crashing the server.
     */
    if (
      message.includes(
        'foreign key'
      ) ||
      message.includes(
        'constraint'
      )
    ) {

      return res.status(409).json({

        error:
          'This match is still linked to other data and could not be deleted.',

        protected:
          true
      });
    }

    return sendError(
      res,
      error,
      'Failed to delete match'
    );
  }
};
