
-- ============================================================
-- GCC CRICKET SCOREBOARD
-- SQLite / Turso Production Schema
--
-- Designed for:
--   10,000+ matches
--   100,000+ player/stat records
--   1,000,000+ balls
--   50+ simultaneous users
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- TEAMS
-- ============================================================

CREATE TABLE IF NOT EXISTS teams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL,
    logo_color  TEXT DEFAULT '#1e3a8a',
    is_own      INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PLAYERS
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
    id            TEXT PRIMARY KEY,
    team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    role          TEXT DEFAULT 'batsman',
    batting_style TEXT DEFAULT 'right-hand',
    bowling_style TEXT DEFAULT 'none',
    jersey_no     INTEGER,
    active        INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- MATCHES
-- ============================================================

CREATE TABLE IF NOT EXISTS matches (
    id              TEXT PRIMARY KEY,
    team1_id        TEXT NOT NULL REFERENCES teams(id),
    team2_id        TEXT NOT NULL REFERENCES teams(id),
    match_type      TEXT DEFAULT 'T20',
    overs_limit     INTEGER DEFAULT 20,
    venue           TEXT,
    match_date      TEXT,
    toss_winner_id  TEXT REFERENCES teams(id),
    toss_decision   TEXT,
    status          TEXT DEFAULT 'upcoming',
    current_innings INTEGER DEFAULT 1,
    result_text     TEXT,
    winner_id       TEXT REFERENCES teams(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INNINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS innings (
    id                TEXT PRIMARY KEY,
    match_id          TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    innings_number    INTEGER NOT NULL,
    batting_team_id   TEXT NOT NULL REFERENCES teams(id),
    bowling_team_id   TEXT NOT NULL REFERENCES teams(id),
    total_runs        INTEGER DEFAULT 0,
    total_wickets     INTEGER DEFAULT 0,
    total_balls       INTEGER DEFAULT 0,
    extras_wide       INTEGER DEFAULT 0,
    extras_noball     INTEGER DEFAULT 0,
    extras_bye        INTEGER DEFAULT 0,
    extras_legbye     INTEGER DEFAULT 0,
    extras_penalty    INTEGER DEFAULT 0,
    target            INTEGER,
    striker_id        TEXT REFERENCES players(id),
    non_striker_id    TEXT REFERENCES players(id),
    current_bowler_id TEXT REFERENCES players(id),
    is_completed      INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BALLS
--
-- SOURCE OF TRUTH FOR SCORING.
--
-- 1,000,000+ rows are expected.
-- ============================================================

CREATE TABLE IF NOT EXISTS balls (
    id                TEXT PRIMARY KEY,
    innings_id        TEXT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    over_number       INTEGER NOT NULL,
    ball_in_over      INTEGER NOT NULL,
    ball_sequence     INTEGER NOT NULL,
    batsman_id        TEXT NOT NULL REFERENCES players(id),
    non_striker_id    TEXT NOT NULL REFERENCES players(id),
    bowler_id         TEXT NOT NULL REFERENCES players(id),
    runs_batsman      INTEGER DEFAULT 0,
    extra_type        TEXT,
    extra_runs        INTEGER DEFAULT 0,
    is_wicket         INTEGER DEFAULT 0,
    wicket_type       TEXT,
    dismissed_id      TEXT REFERENCES players(id),
    fielder_id        TEXT REFERENCES players(id),
    is_legal          INTEGER DEFAULT 1,
    commentary        TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- ------------------------------------------------------------
-- PLAYERS
-- ------------------------------------------------------------

/*
 * Existing:
 * players → team
 */
CREATE INDEX IF NOT EXISTS idx_players_team
ON players(team_id);

/*
 * Very common query:
 *
 * WHERE team_id = ? AND active = 1
 */
CREATE INDEX IF NOT EXISTS idx_players_team_active
ON players(team_id, active);

/*
 * Useful when searching players by name.
 */
CREATE INDEX IF NOT EXISTS idx_players_name
ON players(name);

-- ------------------------------------------------------------
-- MATCHES
-- ------------------------------------------------------------

/*
 * Match list ordered by newest date.
 */
CREATE INDEX IF NOT EXISTS idx_matches_date
ON matches(match_date DESC);

/*
 * Quickly find live matches.
 */
CREATE INDEX IF NOT EXISTS idx_matches_status
ON matches(status);

/*
 * Very useful for:
 *
 * WHERE status = 'live'
 * ORDER BY match_date DESC
 */
CREATE INDEX IF NOT EXISTS idx_matches_status_date
ON matches(status, match_date DESC);

/*
 * Find matches involving a team.
 */
CREATE INDEX IF NOT EXISTS idx_matches_team1
ON matches(team1_id);

CREATE INDEX IF NOT EXISTS idx_matches_team2
ON matches(team2_id);

/*
 * Useful for winner statistics.
 */
CREATE INDEX IF NOT EXISTS idx_matches_winner
ON matches(winner_id);

-- ------------------------------------------------------------
-- INNINGS
-- ------------------------------------------------------------

/*
 * Existing:
 * innings → match
 */
CREATE INDEX IF NOT EXISTS idx_innings_match
ON innings(match_id);

/*
 * Quickly retrieve innings in correct order.
 *
 * Example:
 * Match → innings 1 → innings 2
 */
CREATE INDEX IF NOT EXISTS idx_innings_match_number
ON innings(match_id, innings_number);

/*
 * Useful for team-based statistics.
 */
CREATE INDEX IF NOT EXISTS idx_innings_batting_team
ON innings(batting_team_id);

CREATE INDEX IF NOT EXISTS idx_innings_bowling_team
ON innings(bowling_team_id);

/*
 * Quickly find unfinished innings.
 */
CREATE INDEX IF NOT EXISTS idx_innings_completed
ON innings(is_completed);

-- ------------------------------------------------------------
-- BALLS
-- ------------------------------------------------------------

/*
 * Existing basic index.
 */
CREATE INDEX IF NOT EXISTS idx_balls_innings
ON balls(innings_id);

/*
 * CRITICAL INDEX.
 *
 * Used when reconstructing a scorecard or
 * reading balls in chronological order.
 *
 * This is one of the most important indexes
 * for 1,000,000+ balls.
 */
CREATE INDEX IF NOT EXISTS idx_balls_innings_sequence
ON balls(innings_id, ball_sequence);

/*
 * Useful for current-over queries.
 */
CREATE INDEX IF NOT EXISTS idx_balls_innings_over
ON balls(innings_id, over_number);

/*
 * Used when displaying the current over
 * in ball order.
 */
CREATE INDEX IF NOT EXISTS idx_balls_innings_over_ball
ON balls(innings_id, over_number, ball_sequence);

/*
 * Batting statistics.
 *
 * Example:
 * WHERE batsman_id = ?
 */
CREATE INDEX IF NOT EXISTS idx_balls_batsman
ON balls(batsman_id);

/*
 * Bowling statistics.
 *
 * Example:
 * WHERE bowler_id = ?
 */
CREATE INDEX IF NOT EXISTS idx_balls_bowler
ON balls(bowler_id);

/*
 * Dismissal statistics.
 */
CREATE INDEX IF NOT EXISTS idx_balls_dismissed
ON balls(dismissed_id);

/*
 * Fielder statistics.
 */
CREATE INDEX IF NOT EXISTS idx_balls_fielder
ON balls(fielder_id);

/*
 * Useful for wicket-related queries.
 */
CREATE INDEX IF NOT EXISTS idx_balls_wicket
ON balls(is_wicket);

/*
 * Useful for extras/statistics.
 */
CREATE INDEX IF NOT EXISTS idx_balls_extra_type
ON balls(extra_type);

-- ============================================================
-- COMPOSITE STATISTICS INDEXES
-- ============================================================

/*
 * Quickly retrieve all balls for a batsman
 * in chronological order.
 */
CREATE INDEX IF NOT EXISTS idx_balls_batsman_sequence
ON balls(batsman_id, ball_sequence);

/*
 * Quickly retrieve all balls for a bowler
 * in chronological order.
 */
CREATE INDEX IF NOT EXISTS idx_balls_bowler_sequence
ON balls(bowler_id, ball_sequence);

/*
 * Quickly find wickets taken by a bowler.
 */
CREATE INDEX IF NOT EXISTS idx_balls_bowler_wicket
ON balls(bowler_id, is_wicket);

-- ============================================================
-- DATA-INTEGRITY INDEXES
-- ============================================================

/*
 * A match should normally contain one innings 1,
 * one innings 2, etc.
 *
 * This prevents accidental duplicate innings numbers
 * for the same match.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_innings_match_number_unique
ON innings(match_id, innings_number);

/*
 * Every ball sequence number should be unique
 * within one innings.
 *
 * This is extremely important for preventing
 * duplicate ball records.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_balls_innings_sequence_unique
ON balls(innings_id, ball_sequence);

-- ============================================================
-- END OF SCHEMA
-- ============================================================

