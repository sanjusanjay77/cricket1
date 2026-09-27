const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

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

/* =========================================================
   LIST TEAMS
========================================================= */

exports.listTeams = async (
  req,
  res
) => {

  try {

    const teams =
      await db.prepare(`
        SELECT
          t.*,
          (
            SELECT COUNT(*)
            FROM players p
            WHERE p.team_id = t.id
              AND p.active = 1
          ) AS player_count
        FROM teams t
        ORDER BY t.created_at DESC
      `).all();

    return res.json(
      teams || []
    );

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to load teams'
    );
  }
};

/* =========================================================
   GET TEAM
========================================================= */

exports.getTeam = async (
  req,
  res
) => {

  try {

    const teamId =
      cleanId(
        req.params.id
      );

    const team =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    if (!team) {

      return res.status(404).json({
        error:
          'Team not found'
      });
    }

    const players =
      await db.prepare(`
        SELECT *
        FROM players
        WHERE team_id = ?
          AND active = 1
        ORDER BY
          CASE
            WHEN jersey_no IS NULL THEN 9999
            ELSE jersey_no
          END ASC,
          name ASC
      `).all(team.id);

    return res.json({
      ...team,
      players:
        players || []
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to load team'
    );
  }
};

/* =========================================================
   CREATE TEAM
========================================================= */

exports.createTeam = async (
  req,
  res
) => {

  try {

    const {
      name,
      short_name,
      logo_color,
      is_own
    } = req.body || {};

    const teamName =
      typeof name === 'string'
        ? name.trim()
        : '';

    const teamShortName =
      typeof short_name === 'string'
        ? short_name.trim().toUpperCase()
        : '';

    if (!teamName) {

      return res.status(400).json({
        error:
          'Enter a team name'
      });
    }

    if (!teamShortName) {

      return res.status(400).json({
        error:
          'Enter a short team code'
      });
    }

    if (teamShortName.length > 5) {

      return res.status(400).json({
        error:
          'Short team code must be 5 characters or less'
      });
    }

    const existing =
      await db.prepare(`
        SELECT id
        FROM teams
        WHERE
          LOWER(TRIM(name)) =
          LOWER(TRIM(?))
          OR
          LOWER(TRIM(short_name)) =
          LOWER(TRIM(?))
        LIMIT 1
      `).get(
        teamName,
        teamShortName
      );

    if (existing) {

      return res.status(409).json({
        error:
          'A team with this name or short name already exists'
      });
    }

    const id =
      uuidv4();

    const color =
      typeof logo_color === 'string' &&
      logo_color.trim()
        ? logo_color.trim()
        : '#1e3a8a';

    const own =
      is_own
        ? 1
        : 0;

    await db.prepare(`
      INSERT INTO teams (
        id,
        name,
        short_name,
        logo_color,
        is_own
      )
      VALUES (
        ?, ?, ?, ?, ?
      )
    `).run(
      id,
      teamName,
      teamShortName,
      color,
      own
    );

    const created =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(id);

    return res
      .status(201)
      .json(created);

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to create team'
    );
  }
};

/* =========================================================
   UPDATE TEAM
========================================================= */

exports.updateTeam = async (
  req,
  res
) => {

  try {

    const teamId =
      cleanId(
        req.params.id
      );

    const {
      name,
      short_name,
      logo_color,
      is_own
    } = req.body || {};

    const existing =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    if (!existing) {

      return res.status(404).json({
        error:
          'Team not found'
      });
    }

    const newName =
      name === undefined
        ? existing.name
        : String(name).trim();

    const newShortName =
      short_name === undefined
        ? existing.short_name
        : String(short_name)
            .trim()
            .toUpperCase();

    if (!newName) {

      return res.status(400).json({
        error:
          'Team name cannot be empty'
      });
    }

    if (!newShortName) {

      return res.status(400).json({
        error:
          'Short team code cannot be empty'
      });
    }

    if (newShortName.length > 5) {

      return res.status(400).json({
        error:
          'Short team code must be 5 characters or less'
      });
    }

    const duplicate =
      await db.prepare(`
        SELECT id
        FROM teams
        WHERE
          (
            LOWER(TRIM(name)) =
            LOWER(TRIM(?))
            OR
            LOWER(TRIM(short_name)) =
            LOWER(TRIM(?))
          )
          AND id != ?
        LIMIT 1
      `).get(
        newName,
        newShortName,
        teamId
      );

    if (duplicate) {

      return res.status(409).json({
        error:
          'Another team already uses this name or short name'
      });
    }

    const newColor =
      logo_color === undefined
        ? existing.logo_color
        : (
            String(
              logo_color
            ).trim() ||
            existing.logo_color
          );

    const newIsOwn =
      is_own === undefined
        ? Number(
            existing.is_own || 0
          )
        : (
            is_own
              ? 1
              : 0
          );

    await db.prepare(`
      UPDATE teams
      SET
        name = ?,
        short_name = ?,
        logo_color = ?,
        is_own = ?
      WHERE id = ?
    `).run(
      newName,
      newShortName,
      newColor,
      newIsOwn,
      teamId
    );

    const updated =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    return res.json(
      updated
    );

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to update team'
    );
  }
};

/* =========================================================
   DELETE TEAM
========================================================= */

/*
 * IMPORTANT BEHAVIOUR
 *
 * A team with NO match/innings history:
 *
 *     Team
 *       ↓
 *     Players
 *
 * can be permanently deleted.
 *
 * A team with historical matches/innings:
 *
 *     Team
 *       ↓
 *     Match
 *       ↓
 *     Innings
 *
 * is protected because deleting it can destroy
 * historical scoreboard relationships.
 */

exports.deleteTeam = async (
  req,
  res
) => {

  try {

    const teamId =
      cleanId(
        req.params.id
      );

    if (!teamId) {

      return res.status(400).json({
        error:
          'Invalid team ID'
      });
    }

    const team =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    if (!team) {

      return res.status(404).json({
        error:
          'Team not found'
      });
    }

    /* -----------------------------------------------------
       CHECK MATCH HISTORY
    ----------------------------------------------------- */

    const matchCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM matches
        WHERE
          team1_id = ?
          OR
          team2_id = ?
      `).get(
        teamId,
        teamId
      );

    /* -----------------------------------------------------
       CHECK INNINGS HISTORY
    ----------------------------------------------------- */

    const inningsCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM innings
        WHERE
          batting_team_id = ?
          OR
          bowling_team_id = ?
      `).get(
        teamId,
        teamId
      );

    const matches =
      Number(
        matchCount?.count || 0
      );

    const innings =
      Number(
        inningsCount?.count || 0
      );

    /* -----------------------------------------------------
       PROTECT HISTORICAL TEAM
    ----------------------------------------------------- */

    if (
      matches > 0 ||
      innings > 0
    ) {

      const playerCount =
        await db.prepare(`
          SELECT COUNT(*) AS count
          FROM players
          WHERE team_id = ?
            AND active = 1
        `).get(teamId);

      return res.status(409).json({

        error:
          'This team is linked to match history and cannot be permanently deleted.',

        protected:
          true,

        team_name:
          team.name,

        players_count:
          Number(
            playerCount?.count || 0
          ),

        matches_count:
          matches,

        innings_count:
          innings,

        message:
          'Historical teams are protected so existing scorecards and statistics remain safe.'
      });
    }

    /* -----------------------------------------------------
       COUNT PLAYERS
    ----------------------------------------------------- */

    const playerCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM players
        WHERE team_id = ?
      `).get(teamId);

    const players =
      Number(
        playerCount?.count || 0
      );

    /* -----------------------------------------------------
       DELETE PLAYERS FIRST
    ----------------------------------------------------- */

    /*
     * Since the team has no match/innings history,
     * its players are safe to remove together with
     * the unused team.
     */

    if (players > 0) {

      await db.prepare(`
        DELETE FROM players
        WHERE team_id = ?
      `).run(teamId);

    }

    /* -----------------------------------------------------
       DELETE TEAM
    ----------------------------------------------------- */

    const result =
      await db.prepare(`
        DELETE FROM teams
        WHERE id = ?
      `).run(teamId);

    if (
      !result ||
      Number(result.changes || 0) === 0
    ) {

      return res.status(404).json({
        error:
          'Team could not be deleted'
      });
    }

    return res.json({

      success:
        true,

      message:
        'Team deleted successfully',

      team_id:
        teamId,

      team_name:
        team.name,

      players_deleted:
        players

    });

  } catch (error) {

    console.error(
      'Delete team failed:',
      error
    );

    const message =
      String(
        error?.message || ''
      ).toLowerCase();

    if (
      message.includes('foreign key') ||
      message.includes('constraint')
    ) {

      return res.status(409).json({

        error:
          'This team is connected to existing data and cannot be permanently deleted.',

        protected:
          true
      });
    }

    return sendError(
      res,
      error,
      'Failed to delete team'
    );
  }
};
