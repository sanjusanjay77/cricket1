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

function toBooleanNumber(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true'
  )
    ? 1
    : 0;
}

/* =========================================================
   LIST TEAMS
========================================================= */

exports.listTeams = async (
  req,
  res
) => {

  try {

    /*
     * By default return only active teams.
     *
     * Use:
     * GET /teams?include_archived=true
     *
     * to include archived teams.
     */

    const includeArchived =
      req.query.include_archived === 'true' ||
      req.query.include_archived === '1';

    let sql = `
      SELECT
        t.*,

        (
          SELECT COUNT(*)
          FROM players p
          WHERE p.team_id = t.id
            AND p.active = 1
        ) AS player_count

      FROM teams t
    `;

    if (!includeArchived) {
      sql += `
        WHERE
          COALESCE(t.archived, 0) = 0
      `;
    }

    sql += `
      ORDER BY
        COALESCE(t.archived, 0) ASC,
        t.created_at DESC
    `;

    const teams =
      await db.prepare(sql).all();

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

      archived:
        Number(
          team.archived || 0
        ),

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
      toBooleanNumber(
        is_own
      );

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

    if (!teamId) {

      return res.status(400).json({
        error:
          'Invalid team ID'
      });
    }

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
        : toBooleanNumber(
            is_own
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
   GET TEAM HISTORY COUNTS
========================================================= */

async function getTeamHistoryCounts(
  teamId
) {

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

  return {
    matches:
      Number(
        matchCount?.count || 0
      ),

    innings:
      Number(
        inningsCount?.count || 0
      )
  };
}

/* =========================================================
   DELETE TEAM
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
       CHECK HISTORY
    ----------------------------------------------------- */

    const history =
      await getTeamHistoryCounts(
        teamId
      );

    /* -----------------------------------------------------
       HISTORICAL TEAM
       
       IMPORTANT:
       We do NOT delete it.
       We automatically archive it.
    ----------------------------------------------------- */

    if (
      history.matches > 0 ||
      history.innings > 0
    ) {

      await db.prepare(`
        UPDATE teams

        SET
          archived = 1

        WHERE id = ?
      `).run(teamId);

      const archivedTeam =
        await db.prepare(`
          SELECT *
          FROM teams
          WHERE id = ?
        `).get(teamId);

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
          `${team.name} was archived because it has historical match data.`,

        team:
          archivedTeam,

        team_id:
          teamId,

        team_name:
          team.name,

        matches_count:
          history.matches,

        innings_count:
          history.innings
      });
    }

    /* -----------------------------------------------------
       NO HISTORY
       
       Safe permanent deletion.
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

      deleted:
        true,

      archived:
        false,

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
      'DELETE TEAM ERROR'
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
          'The team is still connected to other records and cannot be deleted.',

        protected:
          true,

        reason:
          'foreign_key_constraint'
      });
    }

    return sendError(
      res,
      error,
      'Failed to delete team'
    );
  }
};

/* =========================================================
   ARCHIVE TEAM
========================================================= */

exports.archiveTeam = async (
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

    await db.prepare(`
      UPDATE teams

      SET
        archived = 1

      WHERE id = ?
    `).run(teamId);

    const updated =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    return res.json({

      success:
        true,

      archived:
        true,

      message:
        `${team.name} archived successfully`,

      team:
        updated
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to archive team'
    );
  }
};

/* =========================================================
   RESTORE TEAM
========================================================= */

exports.restoreTeam = async (
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

    await db.prepare(`
      UPDATE teams

      SET
        archived = 0

      WHERE id = ?
    `).run(teamId);

    const restored =
      await db.prepare(`
        SELECT *
        FROM teams
        WHERE id = ?
      `).get(teamId);

    return res.json({

      success:
        true,

      archived:
        false,

      message:
        `${team.name} restored successfully`,

      team:
        restored
    });

  } catch (error) {

    return sendError(
      res,
      error,
      'Failed to restore team'
    );
  }
};
