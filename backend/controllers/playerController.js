
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/* =========================================================
   PLAYER NAME HELPERS
========================================================= */

function cleanPlayerName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePlayerName(name) {
  return cleanPlayerName(name).toLowerCase();
}

function getErrorMessage(error) {
  return error?.message || String(error || 'Unknown error');
}

/* =========================================================
   DATABASE COMPATIBILITY HELPERS
   Supports the existing db.prepare().get/all/run wrapper.
========================================================= */

function prepare(sql) {
  return db.prepare(sql);
}

async function findActiveDuplicateName(
  teamId,
  name,
  excludePlayerId = null
) {
  const normalizedName = normalizePlayerName(name);

  if (!normalizedName) {
    return null;
  }

  const rows = await prepare(`
    SELECT id, team_id, name, active
    FROM players
    WHERE team_id = ?
      AND active = 1
  `).all(teamId);

  return rows.find(player => {
    if (
      excludePlayerId !== null &&
      String(player.id) === String(excludePlayerId)
    ) {
      return false;
    }

    return (
      normalizePlayerName(player.name) === normalizedName
    );
  }) || null;
}

async function findActiveDuplicateJersey(
  teamId,
  jerseyNo,
  excludePlayerId = null
) {
  if (
    jerseyNo === null ||
    jerseyNo === undefined ||
    String(jerseyNo).trim() === ''
  ) {
    return null;
  }

  const rows = await prepare(`
    SELECT id, team_id, name, jersey_no, active
    FROM players
    WHERE team_id = ?
      AND active = 1
      AND jersey_no = ?
  `).all(teamId, jerseyNo);

  return rows.find(player => {
    if (
      excludePlayerId !== null &&
      String(player.id) === String(excludePlayerId)
    ) {
      return false;
    }

    return true;
  }) || null;
}

/* =========================================================
   LIST PLAYERS
========================================================= */

async function listPlayers(req, res) {
  try {
    const teamId =
      req.query.team_id ??
      req.query.teamId;

    let rows;

    if (teamId !== undefined && teamId !== null && teamId !== '') {
      rows = await prepare(`
        SELECT *
        FROM players
        WHERE team_id = ?
          AND active = 1
        ORDER BY name COLLATE NOCASE ASC
      `).all(teamId);
    } else {
      rows = await prepare(`
        SELECT *
        FROM players
        WHERE active = 1
        ORDER BY name COLLATE NOCASE ASC
      `).all();
    }

    return res.json(rows);
  } catch (error) {
    console.error('listPlayers error:', error);

    return res.status(500).json({
      error: 'Failed to load players.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   CREATE PLAYER

   Rules:
   - Same name can be reused after soft deletion.
   - Duplicate active names in the same team are rejected.
   - Active jersey numbers must be unique within the team.
========================================================= */

async function createPlayer(req, res) {
  try {
    const body = req.body || {};

    const teamId =
      body.team_id ??
      body.teamId;

    const name = cleanPlayerName(body.name);

    const role = body.role ?? null;
    const battingStyle = body.batting_style ?? null;
    const bowlingStyle = body.bowling_style ?? null;

    const jerseyNo =
      body.jersey_no === '' ||
      body.jersey_no === undefined
        ? null
        : body.jersey_no;

    if (
      teamId === undefined ||
      teamId === null ||
      String(teamId).trim() === ''
    ) {
      return res.status(400).json({
        error: 'Team ID is required.',
      });
    }

    if (!name) {
      return res.status(400).json({
        error: 'Player name is required.',
      });
    }

    /*
     * IMPORTANT:
     * findActiveDuplicateName checks only active=1 players.
     * Deleted players with active=0 do not block name reuse.
     */

    const duplicateName = await findActiveDuplicateName(
      teamId,
      name
    );

    if (duplicateName) {
      return res.status(409).json({
        error: 'A player with this name already exists in this team.',
        existing_player: duplicateName,
      });
    }

    const duplicateJersey = await findActiveDuplicateJersey(
      teamId,
      jerseyNo
    );

    if (duplicateJersey) {
      return res.status(409).json({
        error: 'This jersey number is already used by an active player in this team.',
        existing_player: duplicateJersey,
      });
    }

    const id = uuidv4();

    await prepare(`
      INSERT INTO players (
        id,
        team_id,
        name,
        role,
        batting_style,
        bowling_style,
        jersey_no,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      teamId,
      name,
      role,
      battingStyle,
      bowlingStyle,
      jerseyNo
    );

    const player = await prepare(`
      SELECT *
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(id);

    return res.status(201).json(player || {
      id,
      team_id: teamId,
      name,
      role,
      batting_style: battingStyle,
      bowling_style: bowlingStyle,
      jersey_no: jerseyNo,
      active: 1,
    });
  } catch (error) {
    console.error('createPlayer error:', error);

    if (
      /unique constraint|unique violation/i.test(
        getErrorMessage(error)
      )
    ) {
      return res.status(409).json({
        error: 'A player with this name or jersey number already exists in this team.',
      });
    }

    return res.status(500).json({
      error: 'Failed to create player.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   UPDATE PLAYER

   - Keeps the existing player ID.
   - Preserves historical records linked to that ID.
   - Prevents duplicate active names in the same team.
   - Allows a name belonging only to an inactive player.
========================================================= */

async function updatePlayer(req, res) {
  try {
    const playerId = req.params.id;
    const body = req.body || {};

    const existing = await prepare(`
      SELECT *
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(playerId);

    if (!existing) {
      return res.status(404).json({
        error: 'Player not found.',
      });
    }

    const teamId =
      body.team_id ??
      body.teamId ??
      existing.team_id;

    const name =
      body.name === undefined
        ? cleanPlayerName(existing.name)
        : cleanPlayerName(body.name);

    const role =
      body.role === undefined
        ? existing.role
        : body.role;

    const battingStyle =
      body.batting_style === undefined
        ? existing.batting_style
        : body.batting_style;

    const bowlingStyle =
      body.bowling_style === undefined
        ? existing.bowling_style
        : body.bowling_style;

    const jerseyNo =
      body.jersey_no === undefined
        ? existing.jersey_no
        : (
            body.jersey_no === ''
              ? null
              : body.jersey_no
          );

    if (
      teamId === undefined ||
      teamId === null ||
      String(teamId).trim() === ''
    ) {
      return res.status(400).json({
        error: 'Team ID is required.',
      });
    }

    if (!name) {
      return res.status(400).json({
        error: 'Player name is required.',
      });
    }

    if (Number(existing.active) === 1) {
      const duplicateName = await findActiveDuplicateName(
        teamId,
        name,
        playerId
      );

      if (duplicateName) {
        return res.status(409).json({
          error: 'A player with this name already exists in this team.',
          existing_player: duplicateName,
        });
      }

      const duplicateJersey = await findActiveDuplicateJersey(
        teamId,
        jerseyNo,
        playerId
      );

      if (duplicateJersey) {
        return res.status(409).json({
          error: 'This jersey number is already used by an active player in this team.',
          existing_player: duplicateJersey,
        });
      }
    }

    await prepare(`
      UPDATE players
      SET
        team_id = ?,
        name = ?,
        role = ?,
        batting_style = ?,
        bowling_style = ?,
        jersey_no = ?
      WHERE id = ?
    `).run(
      teamId,
      name,
      role,
      battingStyle,
      bowlingStyle,
      jerseyNo,
      playerId
    );

    const updatedPlayer = await prepare(`
      SELECT *
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(playerId);

    return res.json(updatedPlayer);
  } catch (error) {
    console.error('updatePlayer error:', error);

    if (
      /unique constraint|unique violation/i.test(
        getErrorMessage(error)
      )
    ) {
      return res.status(409).json({
        error: 'A player with this name or jersey number already exists in this team.',
      });
    }

    return res.status(500).json({
      error: 'Failed to update player.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   DELETE PLAYER

   Soft deletion preserves historical scorecard references.
   active=0 means the name can be reused.
========================================================= */

async function deletePlayer(req, res) {
  try {
    const playerId = req.params.id;

    const existing = await prepare(`
      SELECT *
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(playerId);

    if (!existing) {
      return res.status(404).json({
        error: 'Player not found.',
      });
    }

    await prepare(`
      UPDATE players
      SET active = 0
      WHERE id = ?
    `).run(playerId);

    return res.json({
      success: true,
      softRemoved: true,
      message: 'Player deleted successfully. The name can be reused.',
      id: playerId,
    });
  } catch (error) {
    console.error('deletePlayer error:', error);

    return res.status(500).json({
      error: 'Failed to delete player.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   LIST PLAYERS WITH TEAM DETAILS
========================================================= */

async function listAllWithTeams(req, res) {
  try {
    const rows = await prepare(`
      SELECT
        p.*,
        t.name AS team_name
      FROM players p
      LEFT JOIN teams t
        ON t.id = p.team_id
      WHERE p.active = 1
      ORDER BY t.name COLLATE NOCASE ASC,
               p.name COLLATE NOCASE ASC
    `).all();

    return res.json(rows);
  } catch (error) {
    console.error('listAllWithTeams error:', error);

    return res.status(500).json({
      error: 'Failed to load players with teams.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   GET ONE PLAYER'S CAREER STATS
========================================================= */

async function getPlayerStats(req, res) {
  try {
    const playerId = req.params.id;

    const player = await prepare(`
      SELECT *
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found.',
      });
    }

    if (
      !calc ||
      typeof calc.getPlayerCareerStats !== 'function'
    ) {
      return res.status(500).json({
        error: 'Player career statistics are not available in scoreCalculator.',
      });
    }

    const stats = await calc.getPlayerCareerStats(playerId);

    return res.json({
      player,
      ...(stats || {}),
    });
  } catch (error) {
    console.error('getPlayerStats error:', error);

    return res.status(500).json({
      error: 'Failed to load player statistics.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   GET ALL PLAYERS' CAREER STATS
========================================================= */

async function getAllPlayerCareerStats(req, res) {
  try {
    if (
      !calc ||
      typeof calc.getAllPlayerCareerStats !== 'function'
    ) {
      return res.status(500).json({
        error: 'All-player career statistics are not available in scoreCalculator.',
      });
    }

    const stats = await calc.getAllPlayerCareerStats();

    return res.json(stats);
  } catch (error) {
    console.error('getAllPlayerCareerStats error:', error);

    return res.status(500).json({
      error: 'Failed to load player career statistics.',
      details: getErrorMessage(error),
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  listAllWithTeams,
  getPlayerStats,
  getAllPlayerCareerStats,
};
