const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

exports.listPlayers = async (req, res) => {
  const { team_id } = req.query;
  const players = team_id
    ? await db.prepare('SELECT * FROM players WHERE team_id = ? AND active = 1 ORDER BY jersey_no ASC').all(team_id)
    : await db.prepare('SELECT * FROM players WHERE active = 1 ORDER BY created_at DESC').all();
  res.json(players);
};

exports.createPlayer = async (req, res) => {
  const { team_id, name, role, batting_style, bowling_style, jersey_no } = req.body;
  if (!team_id || !name) return res.status(400).json({ error: 'team_id and name are required' });
  const team = await db.prepare('SELECT id FROM teams WHERE id = ?').get(team_id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const id = uuidv4();
  await db.prepare(`INSERT INTO players (id, team_id, name, role, batting_style, bowling_style, jersey_no)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, team_id, name, role || 'batsman', batting_style || 'right-hand', bowling_style || 'none', jersey_no || null);
  res.status(201).json(await db.prepare('SELECT * FROM players WHERE id = ?').get(id));
};

exports.updatePlayer = async (req, res) => {
  const existing = await db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  const { name, role, batting_style, bowling_style, jersey_no } = req.body;
  await db.prepare(`UPDATE players SET name=?, role=?, batting_style=?, bowling_style=?, jersey_no=? WHERE id=?`).run(name ?? existing.name, role ?? existing.role, batting_style ?? existing.batting_style,
      bowling_style ?? existing.bowling_style, jersey_no ?? existing.jersey_no, req.params.id);
  res.json(await db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id));
};

/**
 * Remove a player from the active roster. If they've never faced/bowled a ball, they're
 * hard-deleted outright. If they have match history, they're soft-removed (active = 0)
 * instead — this keeps every past scorecard and career stat intact and foreign-key-safe,
 * it just hides them from future team-selection lists.
 */
exports.deletePlayer = async (req, res) => {
  const referenced = await db.prepare(`
    SELECT COUNT(*) AS c FROM balls WHERE batsman_id = ? OR non_striker_id = ? OR bowler_id = ? OR dismissed_id = ? OR fielder_id = ?
  `).get(req.params.id, req.params.id, req.params.id, req.params.id, req.params.id).c;

  if (referenced > 0) {
    await db.prepare('UPDATE players SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ softRemoved: true });
  }

  await db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.status(204).send();
};

/** All active players across all teams, with their team name attached — for the Player Stats page. */
exports.listAllWithTeams = async (req, res) => {
  const players = await db.prepare(`
    SELECT p.*, t.name AS team_name, t.short_name AS team_short, t.logo_color AS team_color
    FROM players p
    JOIN teams t ON t.id = p.team_id
    WHERE p.active = 1 AND t.is_own = 1
    ORDER BY t.name ASC, p.jersey_no ASC
  `).all();
  res.json(players);
};

/** Career batting + bowling stats for one player, aggregated across every match ever scored. */
exports.getPlayerStats = async (req, res) => {
  const player = await db.prepare(`
    SELECT p.*, t.name AS team_name, t.short_name AS team_short
    FROM players p JOIN teams t ON t.id = p.team_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const stats = await calc.getPlayerCareerStats(req.params.id);
  res.json({ player, ...stats });
};
