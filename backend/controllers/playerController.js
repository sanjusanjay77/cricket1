
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

const DUPLICATE_NAME_ERROR =
  'A player with this name already exists in this team.';

function cleanPlayerName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePlayerName(name) {
  return cleanPlayerName(name).toLowerCase();
}

function isUniqueConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    message.includes('unique constraint failed') ||
    message.includes('constraint failed') ||
    message.includes('idx_players_team_name_key_unique')
  );
}

function sendPlayerError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (isUniqueConstraintError(error)) {
    return res.status(409).json({
      error: DUPLICATE_NAME_ERROR,
      code: 'DUPLICATE_PLAYER_NAME',
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
    details: error.message,
  });
}

async function findDuplicatePlayerName(
  teamId,
  nameKey,
  excludePlayerId = null
) {
  const players = await db.prepare(`
    SELECT id, name, name_key
    FROM players
    WHERE team_id = ?
  `).all(teamId);

  return players.find((player) =>
    String(player.id) !== String(excludePlayerId ?? '') &&
    (
      player.name_key
        ? String(player.name_key)
        : normalizePlayerName(player.name)
    ) === nameKey
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
    return sendPlayerError(
      res,
      err,
      'Failed to load players'
    );
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
      jersey_no,
    } = req.body;

    if (
      typeof team_id !== 'string' ||
      !team_id.trim() ||
      typeof name !== 'string'
    ) {
      return res.status(400).json({
        error: 'team_id and a valid player name are required',
      });
    }

    const playerName = cleanPlayerName(name);
    const nameKey = normalizePlayerName(name);

    if (!nameKey) {
      return res.status(400).json({
        error: 'Player name cannot be empty',
      });
    }

    const team = await db.prepare(`
      SELECT id
      FROM teams
      WHERE id = ?
    `).get(team_id);

    if (!team) {
      return res.status(404).json({
        error: 'Team not found',
      });
    }

    const duplicate = await findDuplicatePlayerName(
      team_id,
      nameKey
    );

    if (duplicate) {
      return res.status(409).json({
        error: DUPLICATE_NAME_ERROR,
        code: 'DUPLICATE_PLAYER_NAME',
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
          error: 'Jersey number is already used by another active player',
          code: 'DUPLICATE_JERSEY_NUMBER',
        });
      }
    }

    const id = uuidv4();

    await db.prepare(`
      INSERT INTO players (
        id,
        team_id,
        name,
        name_key,
        role,
        batting_style,
        bowling_style,
        jersey_no,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      team_id,
      playerName,
      nameKey,
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
    return sendPlayerError(
      res,
      err,
      'Failed to create player'
    );
  }
};

/**
 * RENAME PLAYER
 *
 * Keep the same ID so historical statistics remain associated
 * with the existing player.
 */
exports.updatePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;
    const { name } = req.body;

    if (typeof name !== 'string') {
      return res.status(400).json({
        error: 'Player name cannot be empty',
      });
    }

    const playerName = cleanPlayerName(name);
    const nameKey = normalizePlayerName(name);

    if (!nameKey) {
      return res.status(400).json({
        error: 'Player name cannot be empty',
      });
    }

    const existingPlayer = await db.prepare(`
      SELECT id, team_id, name
      FROM players
      WHERE id = ?
    `).get(playerId);

    if (!existingPlayer) {
      return res.status(404).json({
        error: 'Player not found',
      });
    }

    const duplicate = await findDuplicatePlayerName(
      existingPlayer.team_id,
      nameKey,
      existingPlayer.id
    );

    if (duplicate) {
      return res.status(409).json({
        error: DUPLICATE_NAME_ERROR,
        code: 'DUPLICATE_PLAYER_NAME',
      });
    }

    await db.prepare(`
      UPDATE players
      SET name = ?, name_key = ?
      WHERE id = ?
    `).run(
      playerName,
      nameKey,
      playerId
    );

    const updated = await db.prepare(`
      SELECT *
      FROM players
      WHERE id = ?
    `).get(playerId);

    return res.json(updated);
  } catch (err) {
    return sendPlayerError(
      res,
      err,
      'Failed to update player'
    );
  }
};

/**
 * SOFT DELETE PLAYER
 *
 * Historical statistics remain untouched.
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
        error: 'Player not found',
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
        'Historical records are preserved.',
    });
  } catch (err) {
    return sendPlayerError(
      res,
      err,
      'Failed to remove player'
    );
  }
};

/**
 * LIST ACTIVE OWN-TEAM PLAYERS WITH TEAM INFORMATION
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
    return sendPlayerError(
      res,
      err,
      'Failed to load player statistics'
    );
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
        error: 'Player not found',
      });
    }

    const stats = await calc.getPlayerCareerStats(playerId);

    return res.json({
      player,
      ...stats,
    });
  } catch (err) {
    return sendPlayerError(
      res,
      err,
      'Failed to load player statistics'
    );
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
    return sendPlayerError(
      res,
      err,
      'Failed to load all player statistics'
    );
  }
};
