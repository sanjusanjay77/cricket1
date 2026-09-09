const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

function broadcast(req, matchId) {
  const io = req.app.get('io');
  // Re-fetch a lightweight scoreboard payload and push to everyone watching this match
  const inningsRows = db.prepare('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number ASC').all(matchId);
  const innings = inningsRows.map(i => calc.getScoreboard(i.id));
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  io.to(`match-${matchId}`).emit('score-update', { match, innings });
}

exports.setBatsmen = (req, res) => {
  const { striker_id, non_striker_id } = req.body;
  const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
  if (!innings) return res.status(404).json({ error: 'Innings not found' });
  if (!striker_id) return res.status(400).json({ error: 'striker_id is required' });

  db.prepare('UPDATE innings SET striker_id = ?, non_striker_id = COALESCE(?, non_striker_id) WHERE id = ?')
    .run(striker_id, non_striker_id || null, innings.id);

  broadcast(req, innings.match_id);
  res.json(db.prepare('SELECT * FROM innings WHERE id = ?').get(innings.id));
};

/** Manually swap striker/non-striker without a delivery being bowled (e.g. correcting an error, or a mid-over manual swap). */
exports.swapBatsmen = (req, res) => {
  const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
  if (!innings) return res.status(404).json({ error: 'Innings not found' });
  if (!innings.striker_id || !innings.non_striker_id) return res.status(400).json({ error: 'Both batsmen must be set before swapping' });

  db.prepare('UPDATE innings SET striker_id = ?, non_striker_id = ? WHERE id = ?')
    .run(innings.non_striker_id, innings.striker_id, innings.id);

  broadcast(req, innings.match_id);
  res.json(db.prepare('SELECT * FROM innings WHERE id = ?').get(innings.id));
};

exports.swapStrike = (req, res) => {
  const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
  if (!innings) return res.status(404).json({ error: 'Innings not found' });
  if (!innings.striker_id || !innings.non_striker_id) return res.status(400).json({ error: 'Both batsmen must be set first' });

  db.prepare('UPDATE innings SET striker_id = ?, non_striker_id = ? WHERE id = ?')
    .run(innings.non_striker_id, innings.striker_id, innings.id);

  broadcast(req, innings.match_id);
  res.json(db.prepare('SELECT * FROM innings WHERE id = ?').get(innings.id));
};

exports.setBowler = (req, res) => {
  const { bowler_id, force } = req.body;
  const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
  if (!innings) return res.status(404).json({ error: 'Innings not found' });
  if (!bowler_id) return res.status(400).json({ error: 'bowler_id is required' });

  if (!force) {
    const lastBall = db.prepare('SELECT * FROM balls WHERE innings_id = ? ORDER BY ball_sequence DESC LIMIT 1').get(innings.id);
    if (lastBall && lastBall.bowler_id === bowler_id && innings.total_balls % 6 === 0 && innings.total_balls > 0) {
      return res.status(400).json({ error: 'Same bowler cannot bowl consecutive overs. Pass force:true to override.' });
    }
  }

  db.prepare('UPDATE innings SET current_bowler_id = ? WHERE id = ?').run(bowler_id, innings.id);
  broadcast(req, innings.match_id);
  res.json(db.prepare('SELECT * FROM innings WHERE id = ?').get(innings.id));
};

exports.recordBall = (req, res) => {
  try {
    const result = calc.recordBall(req.params.id, req.body);
    const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
    broadcast(req, innings.match_id);
    res.json({ ...result, innings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.undoLastBall = (req, res) => {
  try {
    const result = calc.undoLastBall(req.params.id);
    const innings = db.prepare('SELECT * FROM innings WHERE id = ?').get(req.params.id);
    broadcast(req, innings.match_id);
    res.json({ ...result, innings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getScoreboard = (req, res) => {
  const scoreboard = calc.getScoreboard(req.params.id);
  if (!scoreboard) return res.status(404).json({ error: 'Innings not found' });
  res.json(scoreboard);
};
