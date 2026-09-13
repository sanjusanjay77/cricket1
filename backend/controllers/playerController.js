const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

/**
 * List active players.
 */
exports.listPlayers = async (req, res) => {
  try {
    const { team_id } = req.query;

    const players = team_id
      ? await db
          .prepare(`
            SELECT *
            FROM players
            WHERE team_id = ? AND active = 1
            ORDER BY jersey_no ASC
          `)
          .all(team_id)
      : await db
          .prepare(`
            SELECT *
            FROM players
            WHERE active = 1
            ORDER BY created_at DESC
          `)
          .all();

    res.json(players);
  } catch (err) {
    console.error('listPlayers error:', err);
    res.status(500).json({
      error: 'Failed to load players'
    });
  }
};

/**
 * Create a new player.
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

    if (!team_id || !name) {
      return res.status(400).json({
        error: 'team_id and name are required'
      });
    }

    const team = await db
      .prepare('SELECT id FROM teams WHERE id = ?')
      .get(team_id);

    if (!team) {
      return res.status(404).json({
        error: 'Team not found'
      });
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
        name,
        role || 'batsman',
        batting_style || 'right-hand',
        bowling_style || 'none',
        jersey_no || null
      );

    const player = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .get(id);

    res.status(201).json(player);
  } catch (err) {
    console.error('createPlayer error:', err);

    res.status(500).json({
      error: 'Failed to create player',
      details: err.message
    });
  }
};

/**
 * Update player information.
 */
exports.updatePlayer = async (req, res) => {
  try {
    const existing = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .get(req.params.id);

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
        name ?? existing.name,
        role ?? existing.role,
        batting_style ?? existing.batting_style,
        bowling_style ?? existing.bowling_style,
        jersey_no ?? existing.jersey_no,
        req.params.id
      );

    const updated = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('updatePlayer error:', err);

    res.status(500).json({
      error: 'Failed to update player',
      details: err.message
    });
  }
};

/**
 * Soft-delete a player.
 *
 * IMPORTANT:
 * Players are NEVER physically deleted.
 *
 * This protects historical:
 * - matches
 * - innings
 * - balls
 * - batting records
 * - bowling records
 * - wickets
 * - partnerships
 * - player statistics
 *
 * active = 0 hides the player from future selection,
 * while keeping all historical data intact.
 */
exports.deletePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .get(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    /*
     * Never use:
     *
     * DELETE FROM players WHERE id = ?
     *
     * because the player may be referenced by foreign keys
     * in historical cricket data.
     */

    await db
      .prepare(`
        UPDATE players
        SET active = 0
        WHERE id = ?
      `)
      .run(playerId);

    res.json({
      success: true,
      softRemoved: true,
      message: `${player.name} was removed from the active roster. Historical records are preserved.`
    });
  } catch (err) {
    console.error('deletePlayer error:', err);

    /*
     * Most importantly, don't allow a player-delete error
     * to crash the entire Render server.
     */
    res.status(500).json({
      error: 'Failed to remove player',
      details: err.message
    });
  }
};

/**
 * All active players belonging to the user's own teams.
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
        JOIN teams t ON t.id = p.team_id
        WHERE p.active = 1
          AND t.is_own = 1
        ORDER BY
          t.name ASC,
          p.jersey_no ASC
      `)
      .all();

    res.json(players);
  } catch (err) {
    console.error('listAllWithTeams error:', err);

    res.status(500).json({
      error: 'Failed to load player statistics'
    });
  }
};

/**
 * Career batting + bowling statistics for one player.
 */
exports.getPlayerStats = async (req, res) => {
  try {
    const player = await db
      .prepare(`
        SELECT
          p.*,
          t.name AS team_name,
          t.short_name AS team_short
        FROM players p
        JOIN teams t ON t.id = p.team_id
        WHERE p.id = ?
      `)
      .get(req.params.id);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found'
      });
    }

    const stats = await calc.getPlayerCareerStats(req.params.id);

    res.json({
      player,
      ...stats
    });
  } catch (err) {
    console.error('getPlayerStats error:', err);

    res.status(500).json({
      error: 'Failed to load player statistics',
      details: err.message
    });
  }
};
