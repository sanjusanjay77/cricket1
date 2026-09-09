const { v4: uuidv4 } = require('uuid');
const db = require('./database');

function makeTeam(name, short_name, color, playerNames, isOwn = false) {
  const teamId = uuidv4();
  db.prepare('INSERT INTO teams (id, name, short_name, logo_color, is_own) VALUES (?, ?, ?, ?, ?)')
    .run(teamId, name, short_name, color, isOwn ? 1 : 0);
  playerNames.forEach((name, idx) => {
    db.prepare(`INSERT INTO players (id, team_id, name, role, jersey_no) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), teamId, name, idx < 5 ? 'batsman' : (idx < 9 ? 'bowler' : 'all-rounder'), idx + 1);
  });
  return teamId;
}

const existing = db.prepare('SELECT COUNT(*) AS c FROM teams').get();
if (existing.c > 0) {
  console.log('Database already has teams — skipping seed. Delete db/cricket.db to reseed.');
  process.exit(0);
}

// Your own team — marked is_own so it (and only it) shows up on the Player Stats page.
// Rename/add players freely from the Teams page, or add players on the spot while scoring.
makeTeam('GCC', 'GCC', '#0d7a3a', [], true);

// A couple of sample opponent teams so there's something to play against right away.
makeTeam('Mumbai Titans', 'MUT', '#004ba0', [
  'Rohan Sharma', 'Shubham Gill', 'Vikram Kohli', 'Suraj Iyer', 'Hardik Pandya',
  'Ravi Jadeja', 'Jasprit Bumrah', 'Mohammed Shami', 'Kuldeep Yadav', 'Rishabh Pant', 'Yuzi Chahal',
]);
makeTeam('Chennai Kings', 'CHK', '#f9c200', [
  'Ruturaj Gaikwad', 'Devon Conway', 'Ajinkya Rahane', 'Moeen Ali', 'Shivam Dube',
  'Ravindra Ashwin', 'Deepak Chahar', 'Tushar Deshpande', 'Maheesh Theekshana', 'MS Dhoni', 'Matheesha Pathirana',
]);

console.log('Seed complete: GCC (your team, empty squad) + 2 sample opponent teams created.');
