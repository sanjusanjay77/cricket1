
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

const DUPLICATE_NAME_ERROR =
  'A player with this name already exists in this team.';

/**
 * Normalize names consistently:
 * - Trim leading/trailing spaces
 * - Collapse repeated whitespace
 * - Compare without case sensitivity
 */
function normalizePlayerName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Return a clean display name without changing its letter case.
 */
function cleanPlayerName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Find another player with the same normalized name.
 *
 * Includes inactive players so soft-deleting a player does not
 * allow a duplicate to be created later.
 *
 * The current player's ID can be excluded during a rename.
 */
async function findDuplicatePlayerName(
  teamId,
  playerName,
  excludePlayerId = null
) {
  const normalizedName = normalizePlayerName(playerName);

  const players = await db.prepare(`
    SELECT id, name
    FROM players
    WHERE team_id = ?
  `).all(teamId);

  return players.find(player =>
    String(player.id) !== String(excludePlayerId ?? '') &&
    normalizePlayerName(player.name) === normalizedName
  ) || null;
}

/**
 * LIST ACTIVE PLAYERS
 */
exports.listPlayers = async (req, res) => {
  try {
    const { team_id } = req.query;

    const players = team_id
      ? await db.prepare(`
          SELECT *
          FROM players
          WHERE team_id = ?
            AND active = 1
          ORDER BY jersey_no ASC
        `).all(team_id)
      : await db.prepare(`
          SELECT *
          FROM players
          WHERE active = 1
          ORDER BY created_at DESC
        `).all();

    return res.json(players);
  } catch (err) {
    console.error('listPlayers error:', err);

    return res.status(500).json({
      error: 'Failed to load players',
      details: err.message
    });
  }
};

/**
 * CREATE PLAYER
 */
exports.createPlayer = async (req, res) => {
  try {
    const {
      team_id,
      name,
      role,
      batting_style,
      bowling_style,
      jersey_no
    } = req.body;

    if (
      typeof team_id !== 'string' ||
      !team_id.trim() ||
      typeof name !== 'string' ||
      !normalizePlayerName(name)
    ) {
      return res.status(400).json({
        error: 'team_id and a valid player name are required'
      });
    }

    const playerName = cleanPlayerName(name);

    const team = await db.prepare(`
      SELECT id
      FROM teams
      WHERE id = ?
    `).get(team_id);

    if (!team) {
      return res.status(404).json({
        error: 'Team not found'
      });
    }

    const duplicateName = await findDuplicatePlayerName(
      team_id,
      playerName
    );

    if (duplicateName) {
      return res.status(409).json({
        error: DUPLICATE_NAME_ERROR,
        code: 'DUPLICATE_PLAYER_NAME'
      });
    }

    if (
      jersey_no !== undefined &&
      jersey_no !== null &&
      jersey_no !== ''
    ) {
      const duplicateJersey = await db.prepare(`
        SELECT id
        FROM players
        WHERE team_id = ?
          AND jersey_no = ?
          AND active = 1
        LIMIT 1
      `).get(team_id, jersey_no);

      if (duplicateJersey) {
        return res.status(409).json({
          error:
            'Jersey number is already used by another active player'
        });
      }
    }

    const id = uuidv4();

    await db.prepare(`
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
      team_id,
      playerName,
      role || 'batsman',
      batting_style || 'right-hand',
      bowling_style || 'none',
      jersey_no || null
    );

    const player = await db.prepare(`
      SELECT *
      FROM players
      WHERE id = ?
    `).get(id);

    return res.status(201).json(player);
  } catch (err) {
    console.error('createPlayer error:', err);

    // A database uniqueness constraint, if installed, should
    // also be translated to HTTP 409 by the final implementation.
    return res.status(500).json({
      error: 'Failed to create player',
      details: err.message
    });
  }
};

/**
 * RENAME EXISTING PLAYER
 *
 * Preserve the player ID and all historical statistics.
 * Reject duplicate normalized names within the same team.
 */
exports.updatePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;
    const { name } = req.body;

    if (
      typeof name !== 'string' ||
      !normalizePlayerName(name)
    ) {
      return res.status(400).json({
        error: 'Player name cannot be empty'
      });
    }

    const playerName = cleanPlayerName(name);

    const existingPlayer = await db.prepare(`
      SELECT id, team_id, name
      FROM players
      WHERE id = ?
    `).get(playerId);

    if (!existingPlayer) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    const duplicateName = await findDuplicatePlayerName(
      existingPlayer.team_id,
      playerName,
      existingPlayer.id
    );

    if (duplicateName) {
      return res.status(409).json({
        error: DUPLICATE_NAME_ERROR,
        code: 'DUPLICATE_PLAYER_NAME'
      });
    }

    await db.prepare(`
      UPDATE players
      SET name = ?
      WHERE id = ?
    `).run(playerName, playerId);

    const updated = await db.prepare(`
      SELECT *
      FROM players
      WHERE id = ?
    `).get(playerId);

    return res.json(updated);
  } catch (err) {
    console.error('updatePlayer error:', err);

    return res.status(500).json({
      error: 'Failed to update player',
      details: err.message
    });
  }
};

/**
 * SOFT DELETE PLAYER
 *
 * Preserve historical records.
 */
exports.deletePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await db.prepare(`
      SELECT *
      FROM players
      WHERE id = ?
    `).get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    await db.prepare(`
      UPDATE players
      SET active = 0
      WHERE id = ?
    `).run(playerId);

    return res.json({
      success: true,
      softRemoved: true,
      message:
        `${player.name} was removed from the active roster. ` +
        'Historical records are preserved.'
    });
  } catch (err) {
    console.error('deletePlayer error:', err);

    return res.status(500).json({
      error: 'Failed to remove player',
      details: err.message
    });
  }
};

/**
 * LIST ACTIVE PLAYERS WITH TEAM INFORMATION
 */
exports.listAllWithTeams = async (req, res) => {
  try {
    const players = await db.prepare(`
      SELECT
        p.*,
        t.name AS team_name,
        t.short_name AS team_short,
        t.logo_color AS team_color
      FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE p.active = 1
        AND t.is_own = 1
      ORDER BY t.name ASC, p.jersey_no ASC
    `).all();

    return res.json(players);
  } catch (err) {
    console.error('listAllWithTeams error:', err);

    return res.status(500).json({
      error: 'Failed to load player statistics',
      details: err.message
    });
  }
};

/**
 * GET ONE PLAYER'S CAREER STATISTICS
 */
exports.getPlayerStats = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await db.prepare(`
      SELECT
        p.*,
        t.name AS team_name,
        t.short_name AS team_short
      FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE p.id = ?
    `).get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    const stats = await calc.getPlayerCareerStats(playerId);

    return res.json({
      player,
      ...stats
    });
  } catch (err) {
    console.error('getPlayerStats error:', err);

    return res.status(500).json({
      error: 'Failed to load player statistics',
      details: err.message
    });
  }
};

/**
 * GET ALL PLAYER CAREER STATISTICS
 */
exports.getAllPlayerCareerStats = async (req, res) => {
  try {
    const players = await calc.getAllPlayerCareerStats();
    return res.json(players);
  } catch (err) {
    console.error('getAllPlayerCareerStats error:', err);

    return res.status(500).json({
      error: 'Failed to load all player statistics',
      details: err.message
    });
  }
};
