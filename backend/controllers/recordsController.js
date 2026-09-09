const db = require('../db/database');
const calc = require('../utils/scoreCalculator');

async function playerMap() {
  const rows = await db.prepare(`
    SELECT p.id, p.name, t.name AS team_name, t.short_name AS team_short
    FROM players p JOIN teams t ON t.id = p.team_id
  `).all();
  const map = {};
  rows.forEach(r => { map[r.id] = r; });
  return map;
}

async function matchMap() {
  const rows = await db.prepare(`
    SELECT m.id, t1.short_name AS team1_short, t2.short_name AS team2_short
    FROM matches m JOIN teams t1 ON t1.id = m.team1_id JOIN teams t2 ON t2.id = m.team2_id
  `).all();
  const map = {};
  rows.forEach(r => { map[r.id] = r; });
  return map;
}

function attach(entry, players, matches) {
  if (!entry) return null;
  const p = players[entry.player_id] || {};
  const m = matches[entry.match_id] || {};
  return { ...entry, player_name: p.name, team_short: p.team_short, match_label: m.team1_short && m.team2_short ? `${m.team1_short} vs ${m.team2_short}` : undefined };
}

exports.getRecords = async (req, res) => {
  const players = await playerMap();
  const matches = await matchMap();
  const r = await calc.getAllTimeRecords();

  const attachList = (list) => list.map(e => attach(e, players, matches));

  res.json({
    highestScore: attach(r.highestScore, players, matches),
    bestBowling: attach(r.bestBowling, players, matches),
    mostRuns: attachList(r.mostRuns),
    mostFours: attachList(r.mostFours),
    mostSixes: attachList(r.mostSixes),
    mostBallsFaced: attachList(r.mostBallsFaced),
    bestStrikeRate: attachList(r.bestStrikeRate),
    mostWickets: attachList(r.mostWickets),
    mostBallsBowled: attachList(r.mostBallsBowled),
    bestEconomy: attachList(r.bestEconomy),
  });
};
