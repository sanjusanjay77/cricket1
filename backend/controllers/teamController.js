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
   Only ACTIVE teams are shown.
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

        WHERE
          COALESCE(t.archived, 0) = 0

        ORDER BY
          t.created_at DESC
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
            WHEN jersey_no IS NULL THEN 1
            ELSE 0
          END,
          jersey_no ASC,
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

    if (
      !teamName ||
      !teamShortName
    ) {

      return res.status(400).json({
        error:
          'Team name and short name are required'
      });
    }

    if (
      teamShortName.length > 10
    ) {

      return res.status(400).json({
        error:
          'Short name must be 10 characters or less'
      });
    }

    /*
     * Check active teams only.
     *
     * An archived team can have the same
     * name/short name if required.
     */
    const existing =
      await db.prepare(`
        SELECT id
        FROM teams

        WHERE
          COALESCE(archived, 0) = 0

          AND

          (
            LOWER(TRIM(name)) =
            LOWER(TRIM(?))

            OR

            LOWER(TRIM(short_name)) =
            LOWER(TRIM(?))
          )

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
        is_own,
        archived
      )

      VALUES (
        ?, ?, ?, ?, ?, 0
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

    if (
      !newName ||
      !newShortName
    ) {

      return res.status(400).json({
        error:
          'Team name and short name cannot be empty'
      });
    }

    if (
      newShortName.length > 10
    ) {

      return res.status(400).json({
        error:
          'Short name must be 10 characters or less'
      });
    }

    const duplicate =
      await db.prepare(`
        SELECT id
        FROM teams

        WHERE
          COALESCE(archived, 0) = 0

          AND

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
          'Another active team already uses this name or short name'
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
   DELETE / ARCHIVE TEAM
========================================================= */

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

    /* -----------------------------------------------------
       FIND TEAM
    ----------------------------------------------------- */

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
       ALREADY ARCHIVED
    ----------------------------------------------------- */

    if (
      Number(team.archived || 0) === 1
    ) {

      return res.status(200).json({

        success:
          true,

        archived:
          true,

        message:
          'Team is already archived',

        team_id:
          teamId,

        team_name:
          team.name
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
       HISTORICAL TEAM
       
       DO NOT DELETE.
       
       ARCHIVE IT INSTEAD.
       
       This keeps:
       - matches
       - innings
       - balls
       - scores
       - player statistics
       - records
       
       completely untouched.
    ----------------------------------------------------- */

    if (
      matches > 0 ||
      innings > 0
    ) {

      await db.prepare(`
        UPDATE teams

        SET
          archived = 1

        WHERE id = ?
      `).run(teamId);

      return res.status(200).json({

        success:
          true,

        archived:
          true,

        protected:
          true,

        reason:
          'historical_data',

        message:
          'Team archived successfully. Historical match data has been preserved.',

        team_id:
          teamId,

        team_name:
          team.name,

        matches_count:
          matches,

        innings_count:
          innings
      });
    }

    /* -----------------------------------------------------
       NO MATCH HISTORY
       
       This team has never been used in a match.
       
       It can be permanently deleted.
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

    await db.prepare(`
      DELETE FROM players
      WHERE team_id = ?
    `).run(teamId);

    /* -----------------------------------------------------
       DELETE TEAM
    ----------------------------------------------------- */

    const deleteResult =
      await db.prepare(`
        DELETE FROM teams
        WHERE id = ?
      `).run(teamId);

    /* -----------------------------------------------------
       VERIFY DELETE
    ----------------------------------------------------- */

    const stillExists =
      await db.prepare(`
        SELECT id
        FROM teams
        WHERE id = ?
      `).get(teamId);

    if (stillExists) {

      return res.status(500).json({
        error:
          'Team could not be deleted'
      });
    }

    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    return res.status(200).json({

      success:
        true,

      archived:
        false,

      deleted:
        true,

      message:
        'Team deleted successfully',

      team_id:
        teamId,

      team_name:
        team.name,

      players_deleted:
        players,

      rows_deleted:
        Number(
          deleteResult?.changes || 1
        )
    });

  } catch (error) {

    console.error(
      '================================================='
    );

    console.error(
      'DELETE / ARCHIVE TEAM ERROR'
    );

    console.error(
      'Team ID:',
      req.params.id
    );

    console.error(
      error
    );

    console.error(
      '================================================='
    );

    const message =
      String(
        error?.message || ''
      );

    if (
      message
        .toLowerCase()
        .includes('foreign key')
    ) {

      return res.status(409).json({

        error:
          'The team is still connected to historical records.',

        protected:
          true,

        reason:
          'foreign_key_constraint'
      });
    }

    return sendError(
      res,
      error,
      'Failed to delete/archive team'
    );
  }
};
