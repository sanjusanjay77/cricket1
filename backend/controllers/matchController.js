const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { getScoreboard } = require('../utils/scoreCalculator');

exports.listMatches = async (req, res) => {
  const matches = await db.prepare(`
    SELECT m.*, t1.name AS team1_name, t1.short_name AS team1_short,
           t2.name AS team2_name, t2.short_name AS team2_short
    FROM matches m
    JOIN teams t1 ON t1.id = m.team1_id
    JOIN teams t2 ON t2.id = m.team2_id
    ORDER BY m.created_at DESC
  `).all();
  res.json(matches);
};

exports.createMatch = async (req, res) => {
  const { team1_id, team2_id, match_type, overs_limit, venue, match_date } = req.body;
  if (!team1_id || !team2_id) return res.status(400).json({ error: 'team1_id and team2_id are required' });
  if (team1_id === team2_id) return res.status(400).json({ error: 'A team cannot play itself' });
  const id = uuidv4();
  await db.prepare(`INSERT INTO matches (id, team1_id, team2_id, match_type, overs_limit, venue, match_date, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming')`)
    .run(id, team1_id, team2_id, match_type || 'T20', overs_limit ?? 20, venue || null, match_date || null);
  res.status(201).json(await db.prepare('SELECT * FROM matches WHERE id = ?').get(id));
};

exports.setToss = async (req, res) => {
  const { toss_winner_id, toss_decision } = req.body;
  const match = await db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (![match.team1_id, match.team2_id].includes(toss_winner_id)) {
    return res.status(400).json({ error: 'toss_winner_id must be one of the two playing teams' });
  }
  if (!['bat', 'bowl'].includes(toss_decision)) return res.status(400).json({ error: 'toss_decision must be bat or bowl' });

  await db.prepare('UPDATE matches SET toss_winner_id=?, toss_decision=?, status=? WHERE id=?').run(toss_winner_id, toss_decision, 'live', req.params.id);

  const battingFirstId = toss_decision === 'bat' ? toss_winner_id : (toss_winner_id === match.team1_id ? match.team2_id : match.team1_id);
  const bowlingFirstId = battingFirstId === match.team1_id ? match.team2_id : match.team1_id;

  const inningsId = uuidv4();
  await db.prepare(`INSERT INTO innings (id, match_id, innings_number, batting_team_id, bowling_team_id)
              VALUES (?, ?, 1, ?, ?)`).run(inningsId, match.id, battingFirstId, bowlingFirstId);

  res.json({ match: await db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id), innings_id: inningsId });
};

/** Start the 2nd innings once the 1st has finished (innings-break status). */
exports.startSecondInnings = async (req, res) => {
  const match = await db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const inn1 = await db.prepare('SELECT * FROM innings WHERE match_id = ? AND innings_number = 1').get(match.id);
  if (!inn1 || !inn1.is_completed) return res.status(400).json({ error: 'First innings has not finished yet' });

  const inningsId = uuidv4();
  await db.prepare(`INSERT INTO innings (id, match_id, innings_number, batting_team_id, bowling_team_id, target)
              VALUES (?, ?, 2, ?, ?, ?)`)
    .run(inningsId, match.id, inn1.bowling_team_id, inn1.batting_team_id, inn1.total_runs + 1);
  await db.prepare('UPDATE matches SET status = ?, current_innings = 2 WHERE id = ?').run('live', match.id);

  res.json({ innings_id: inningsId, target: inn1.total_runs + 1 });
};

exports.getMatchDetail = async (req, res) => {
  const match = await db.prepare(`
    SELECT m.*, t1.name AS team1_name, t1.short_name AS team1_short, t1.logo_color AS team1_color,
           t2.name AS team2_name, t2.short_name AS team2_short, t2.logo_color AS team2_color
    FROM matches m
    JOIN teams t1 ON t1.id = m.team1_id
    JOIN teams t2 ON t2.id = m.team2_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const inningsRows = await db.prepare('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number ASC').all(match.id);
  const innings = await Promise.all(inningsRows.map(i => getScoreboard(i.id)));
  const players = await db.prepare(`
    SELECT * FROM players WHERE team_id IN (?, ?)
  `).all(match.team1_id, match.team2_id);

  res.json({ match, innings, players });
};

exports.deleteMatch = async (req, res) => {
  await db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
  res.status(204).send();
};
