
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/**
 * ============================================================
 * LIST ACTIVE PLAYERS
 * ============================================================
 */
exports.listPlayers = async (req, res) => {
  try {
    const { team_id } = req.query;

    let players;

    if (team_id) {
      players = await db
        .prepare(`
          SELECT *
          FROM players
          WHERE team_id = ?
            AND active = 1
          ORDER BY jersey_no ASC
        `)
        .all(team_id);
    } else {
      players = await db
        .prepare(`
          SELECT *
          FROM players
          WHERE active = 1
          ORDER BY created_at DESC
        `)
        .all();
    }

    return res.json(players);
  } catch (err) {
    console.error('❌ listPlayers error:', err);

    return res.status(500).json({
      error: 'Failed to load players',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * CREATE PLAYER
 * ============================================================
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

    if (!team_id || !name || !String(name).trim()) {
      return res.status(400).json({
        error: 'team_id and name are required'
      });
    }

    const team = await db
      .prepare(`
        SELECT id
        FROM teams
        WHERE id = ?
      `)
      .get(team_id);

    if (!team) {
      return res.status(404).json({
        error: 'Team not found'
      });
    }

    if (
      jersey_no !== undefined &&
      jersey_no !== null &&
      jersey_no !== ''
    ) {
      const duplicate = await db
        .prepare(`
          SELECT id
          FROM players
          WHERE team_id = ?
            AND jersey_no = ?
            AND active = 1
          LIMIT 1
        `)
        .get(
          team_id,
          jersey_no
        );

      if (duplicate) {
        return res.status(409).json({
          error:
            'Jersey number is already used by another active player'
        });
      }
    }

    const id = uuidv4();

    await db
      .prepare(`
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
      `)
      .run(
        id,
        team_id,
        String(name).trim(),
        role || 'batsman',
        batting_style || 'right-hand',
        bowling_style || 'none',
        jersey_no || null
      );

    const player = await db
      .prepare(`
        SELECT *
        FROM players
        WHERE id = ?
      `)
      .get(id);

    return res.status(201).json(player);

  } catch (err) {
    console.error('❌ createPlayer error:', err);

    return res.status(500).json({
      error: 'Failed to create player',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * UPDATE PLAYER
 * ============================================================
 */
exports.updatePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;

    const existing = await db
      .prepare(`
        SELECT *
        FROM players
        WHERE id = ?
      `)
      .get(playerId);

    if (!existing) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    const {
      name,
      role,
      batting_style,
      bowling_style,
      jersey_no
    } = req.body;

    if (
      jersey_no !== undefined &&
      jersey_no !== null &&
      jersey_no !== ''
    ) {
      const duplicate = await db
        .prepare(`
          SELECT id
          FROM players
          WHERE team_id = ?
            AND jersey_no = ?
            AND active = 1
            AND id != ?
          LIMIT 1
        `)
        .get(
          existing.team_id,
          jersey_no,
          playerId
        );

      if (duplicate) {
        return res.status(409).json({
          error:
            'Jersey number is already used by another active player'
        });
      }
    }

    await db
      .prepare(`
        UPDATE players
        SET
          name = ?,
          role = ?,
          batting_style = ?,
          bowling_style = ?,
          jersey_no = ?
        WHERE id = ?
      `)
      .run(
        name !== undefined
          ? String(name).trim()
          : existing.name,

        role !== undefined
          ? role
          : existing.role,

        batting_style !== undefined
          ? batting_style
          : existing.batting_style,

        bowling_style !== undefined
          ? bowling_style
          : existing.bowling_style,

        jersey_no !== undefined
          ? (
              jersey_no === ''
                ? null
                : jersey_no
            )
          : existing.jersey_no,

        playerId
      );

    const updated = await db
      .prepare(`
        SELECT *
        FROM players
        WHERE id = ?
      `)
      .get(playerId);

    return res.json(updated);

  } catch (err) {
    console.error('❌ updatePlayer error:', err);

    return res.status(500).json({
      error: 'Failed to update player',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * DELETE / REMOVE PLAYER
 * ============================================================
 *
 * IMPORTANT:
 *
 * This is a SOFT DELETE.
 *
 * Historical cricket records are preserved.
 * The player is only hidden from active selection.
 * ============================================================
 */
exports.deletePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await db
      .prepare(`
        SELECT *
        FROM players
        WHERE id = ?
      `)
      .get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    await db
      .prepare(`
        UPDATE players
        SET active = 0
        WHERE id = ?
      `)
      .run(playerId);

    console.log(
      `🗑️ Player soft removed: ${player.name} (${playerId})`
    );

    return res.json({
      success: true,
      softRemoved: true,
      message:
        `${player.name} was removed from the active roster. ` +
        `Historical records are preserved.`
    });

  } catch (err) {
    console.error('❌ deletePlayer error:', err);

    return res.status(500).json({
      error: 'Failed to remove player',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * LIST ALL ACTIVE PLAYERS WITH TEAM INFORMATION
 * ============================================================
 */
exports.listAllWithTeams = async (req, res) => {
  try {
    const players = await db
      .prepare(`
        SELECT
          p.*,
          t.name AS team_name,
          t.short_name AS team_short,
          t.logo_color AS team_color
        FROM players p
        JOIN teams t
          ON t.id = p.team_id
        WHERE p.active = 1
          AND t.is_own = 1
        ORDER BY
          t.name ASC,
          p.jersey_no ASC
      `)
      .all();

    return res.json(players);

  } catch (err) {
    console.error(
      '❌ listAllWithTeams error:',
      err
    );

    return res.status(500).json({
      error: 'Failed to load player statistics',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * GET PLAYER CAREER STATISTICS
 * ============================================================
 *
 * Existing endpoint.
 *
 * KEEP THIS because other parts of the application may still
 * use:
 *
 * GET /api/players/:id/stats
 * ============================================================
 */
exports.getPlayerStats = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await db
      .prepare(`
        SELECT
          p.*,
          t.name AS team_name,
          t.short_name AS team_short
        FROM players p
        JOIN teams t
          ON t.id = p.team_id
        WHERE p.id = ?
      `)
      .get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    const stats =
      await calc.getPlayerCareerStats(
        playerId
      );

    return res.json({
      player,
      ...stats
    });

  } catch (err) {
    console.error(
      '❌ getPlayerStats error:',
      err
    );

    return res.status(500).json({
      error: 'Failed to load player statistics',
      details: err.message
    });
  }
};


/**
 * ============================================================
 * GET ALL ACTIVE GCC PLAYERS WITH CAREER STATISTICS
 * ============================================================
 *
 * NEW OPTIMIZED ENDPOINT.
 *
 * Returns:
 *
 * - Player information
 * - Team information
 * - Batting career statistics
 * - Bowling career statistics
 *
 * for all active GCC players in one request.
 *
 * This is used to remove the extra request that currently
 * happens when a player is selected on the Player Stats page.
 * ============================================================
 */
exports.getAllPlayerCareerStats = async (
  req,
  res
) => {
  try {
    const players =
      await calc.getAllPlayerCareerStats();

    return res.json(players);

  } catch (err) {
    console.error(
      '❌ getAllPlayerCareerStats error:',
      err
    );

    return res.status(500).json({
      error:
        'Failed to load all player statistics',
      details:
        err.message
    });
  }
};


