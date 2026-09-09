const { v4: uuidv4 } = require('uuid');
const db = require('./database');

async function makeTeam(name, short_name, color, playerNames, isOwn = false) {
  const teamId = uuidv4();
  await db.prepare('INSERT INTO teams (id, name, short_name, logo_color, is_own) VALUES (?, ?, ?, ?, ?)').run(teamId, name, short_name, color, isOwn ? 1 : 0);
  for (const [idx, name] of playerNames.entries()) {
    await db.prepare(`INSERT INTO players (id, team_id, name, role, jersey_no) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), teamId, name, idx < 5 ? 'batsman' : (idx < 9 ? 'bowler' : 'all-rounder'), idx + 1);
  }
  return teamId;
}

(async () => {
  const existing = await db.prepare('SELECT COUNT(*) AS c FROM teams').get();
  if (Number(existing.c) > 0) {
    console.log('Database already has teams — skipping seed.');
    process.exit(0);
  }

  await makeTeam('GCC', 'GCC', '#0d7a3a', [], true);
  await makeTeam('Mumbai Titans', 'MUT', '#004ba0', [
    'Rohan Sharma', 'Shubham Gill', 'Vikram Kohli', 'Suraj Iyer', 'Hardik Pandya',
    'Ravi Jadeja', 'Jasprit Bumrah', 'Mohammed Shami', 'Kuldeep Yadav', 'Rishabh Pant', 'Yuzi Chahal',
  ]);
  await makeTeam('Chennai Kings', 'CHK', '#f9c200', [
    'Ruturaj Gaikwad', 'Devon Conway', 'Ajinkya Rahane', 'Moeen Ali', 'Shivam Dube',
    'Ravindra Ashwin', 'Deepak Chahar', 'Tushar Deshpande', 'Maheesh Theekshana', 'MS Dhoni', 'Matheesha Pathirana',
  ]);

  console.log('Seed complete: GCC + 2 sample opponent teams created.');
})().catch(err => { console.error(err); process.exit(1); });
