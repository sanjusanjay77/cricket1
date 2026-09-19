-- ============================================================
-- GCC CRICKET SCOREBOARD
-- SQLite / Turso Production Schema
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
-- NOTIFICATION USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_users (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL,
    email                  TEXT,
    phone                  TEXT,
    notifications_enabled  INTEGER DEFAULT 1,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- NOTIFICATION USER INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
idx_notification_users_email
ON notification_users(email)
WHERE email IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
idx_notification_users_phone
ON notification_users(phone)
WHERE phone IS NOT NULL;


CREATE INDEX IF NOT EXISTS
idx_notification_users_notifications
ON notification_users(notifications_enabled);


-- ============================================================
-- PLAYER INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_players_team
ON players(team_id);

CREATE INDEX IF NOT EXISTS idx_players_team_active
ON players(team_id, active);

CREATE INDEX IF NOT EXISTS idx_players_name
ON players(name);


-- ============================================================
-- MATCH INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_matches_date
ON matches(match_date DESC);

CREATE INDEX IF NOT EXISTS idx_matches_created_at
ON matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status
ON matches(status);

CREATE INDEX IF NOT EXISTS idx_matches_status_date
ON matches(status, match_date DESC);

CREATE INDEX IF NOT EXISTS idx_matches_team1
ON matches(team1_id);

CREATE INDEX IF NOT EXISTS idx_matches_team2
ON matches(team2_id);

CREATE INDEX IF NOT EXISTS idx_matches_winner
ON matches(winner_id);


-- ============================================================
-- INNINGS INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_innings_match
ON innings(match_id);

CREATE INDEX IF NOT EXISTS idx_innings_match_number
ON innings(match_id, innings_number);

CREATE INDEX IF NOT EXISTS idx_innings_batting_team
ON innings(batting_team_id);

CREATE INDEX IF NOT EXISTS idx_innings_bowling_team
ON innings(bowling_team_id);

CREATE INDEX IF NOT EXISTS idx_innings_completed
ON innings(is_completed);


-- ============================================================
-- BALL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_balls_innings
ON balls(innings_id);

CREATE INDEX IF NOT EXISTS idx_balls_innings_sequence
ON balls(innings_id, ball_sequence);

CREATE INDEX IF NOT EXISTS idx_balls_innings_over
ON balls(innings_id, over_number);

CREATE INDEX IF NOT EXISTS idx_balls_innings_over_ball
ON balls(innings_id, over_number, ball_sequence);


-- ============================================================
-- BATTING STATISTICS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_balls_batsman
ON balls(batsman_id);

CREATE INDEX IF NOT EXISTS idx_balls_batsman_sequence
ON balls(batsman_id, ball_sequence);


-- ============================================================
-- BOWLING STATISTICS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_balls_bowler
ON balls(bowler_id);

CREATE INDEX IF NOT EXISTS idx_balls_bowler_sequence
ON balls(bowler_id, ball_sequence);

CREATE INDEX IF NOT EXISTS idx_balls_bowler_wicket
ON balls(bowler_id, is_wicket);


-- ============================================================
-- DISMISSALS / FIELDING
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_balls_dismissed
ON balls(dismissed_id);

CREATE INDEX IF NOT EXISTS idx_balls_fielder
ON balls(fielder_id);

CREATE INDEX IF NOT EXISTS idx_balls_wicket
ON balls(is_wicket);


-- ============================================================
-- EXTRAS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_balls_extra_type
ON balls(extra_type);


-- ============================================================
-- DATA INTEGRITY
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
idx_innings_match_number_unique
ON innings(match_id, innings_number);


-- ============================================================
-- IMPORTANT
-- ============================================================
--
-- DO NOT create:
--
-- CREATE UNIQUE INDEX
-- ON balls(innings_id, ball_sequence);
--
-- Existing production data may contain duplicate
-- ball_sequence values.
--
-- Therefore we intentionally use a normal index.
--
-- ============================================================
