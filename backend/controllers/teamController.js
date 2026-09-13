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
        SELECT *
        FROM teams
        ORDER BY created_at DESC
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

    /*
     * Only active players are shown for
     * normal team management.
     *
     * Historical players remain in DB.
     */
    const players =
      await db.prepare(`
        SELECT *
        FROM players
        WHERE team_id = ?
          AND active = 1
        ORDER BY
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
        ? short_name.trim()
        : '';

    if (
      !teamName ||
      !teamShortName
    ) {

      return res.status(400).json({
        error:
          'name and short_name are required'
      });
    }

    /*
     * Prevent accidental duplicate teams.
     */
    const existing =
      await db.prepare(`
        SELECT id
        FROM teams
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
           OR LOWER(TRIM(short_name)) = LOWER(TRIM(?))
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
        : String(short_name).trim();

    if (
      !newName ||
      !newShortName
    ) {

      return res.status(400).json({
        error:
          'name and short_name cannot be empty'
      });
    }

    /*
     * Prevent duplicate team names/short names.
     */
    const duplicate =
      await db.prepare(`
        SELECT id
        FROM teams
        WHERE (
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

exports.deleteTeam = async (
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

    /*
     * IMPORTANT:
     *
     * Never hard-delete a team that has
     * historical data.
     *
     * Relationships can be:
     *
     * teams
     *   ├── players
     *   ├── matches
     *   └── innings
     *
     * Deleting such a team can cause:
     *
     * SQLITE_CONSTRAINT:
     * FOREIGN KEY constraint failed
     */

    const playerCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM players
        WHERE team_id = ?
      `).get(teamId);

    const matchCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM matches
        WHERE team1_id = ?
           OR team2_id = ?
      `).get(
        teamId,
        teamId
      );

    const inningsCount =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM innings
        WHERE batting_team_id = ?
           OR bowling_team_id = ?
      `).get(
        teamId,
        teamId
      );

    const players =
      Number(
        playerCount?.count || 0
      );

    const matches =
      Number(
        matchCount?.count || 0
      );

    const innings =
      Number(
        inningsCount?.count || 0
      );

    /*
     * If historical/current data exists,
     * protect the team.
     */
    if (
      players > 0 ||
      matches > 0 ||
      innings > 0
    ) {

      return res.status(409).json({

        error:
          'This team contains historical data and cannot be deleted.',

        protected:
          true,

        players_count:
          players,

        matches_count:
          matches,

        innings_count:
          innings
      });
    }

    /*
     * Only a completely unused team can be
     * permanently deleted.
     */
    await db.prepare(`
      DELETE FROM teams
      WHERE id = ?
    `).run(teamId);

    return res.status(204).send();

  } catch (error) {

    console.error(
      'Delete team failed:',
      error
    );

    /*
     * Extra protection in case another
     * foreign-key relationship exists.
     */
    if (
      String(
        error?.message || ''
      ).toLowerCase().includes(
        'foreign key'
      )
    ) {

      return res.status(409).json({

        error:
          'This team is linked to historical data and cannot be deleted.',

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
