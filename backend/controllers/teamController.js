const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

exports.listTeams = (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all();
  res.json(teams);
};

exports.getTeam = (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const players = db.prepare('SELECT * FROM players WHERE team_id = ? AND active = 1 ORDER BY jersey_no ASC').all(team.id);
  res.json({ ...team, players });
};

exports.createTeam = (req, res) => {
  const { name, short_name, logo_color, is_own } = req.body;
  if (!name || !short_name) return res.status(400).json({ error: 'name and short_name are required' });
  const id = uuidv4();
  db.prepare('INSERT INTO teams (id, name, short_name, logo_color, is_own) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, short_name, logo_color || '#1e3a8a', is_own ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM teams WHERE id = ?').get(id));
};

exports.updateTeam = (req, res) => {
  const { name, short_name, logo_color, is_own } = req.body;
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  db.prepare('UPDATE teams SET name = ?, short_name = ?, logo_color = ?, is_own = ? WHERE id = ?')
    .run(name ?? existing.name, short_name ?? existing.short_name, logo_color ?? existing.logo_color,
      is_own === undefined ? existing.is_own : (is_own ? 1 : 0), req.params.id);
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
};

exports.deleteTeam = (req, res) => {
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.status(204).send();
};
