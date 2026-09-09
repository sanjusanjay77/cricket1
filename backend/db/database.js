const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'cricket.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema on boot (idempotent - uses IF NOT EXISTS everywhere)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Lightweight migration: add columns introduced after the initial release to any
// pre-existing database file, so older downloads of this project keep working.
const playerColumns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
if (!playerColumns.includes('active')) {
  db.exec('ALTER TABLE players ADD COLUMN active INTEGER DEFAULT 1');
}
const teamColumns = db.prepare("PRAGMA table_info(teams)").all().map(c => c.name);
if (!teamColumns.includes('is_own')) {
  db.exec('ALTER TABLE teams ADD COLUMN is_own INTEGER DEFAULT 0');
}

module.exports = db;
