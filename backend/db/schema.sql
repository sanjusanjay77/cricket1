-- ============================================================
-- Cricket Scoreboard - Database Schema (SQLite)
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL,
    logo_color  TEXT DEFAULT '#1e3a8a',
    is_own      INTEGER DEFAULT 0,   -- 1 = one of "our" teams; Player Stats only shows players from these
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id            TEXT PRIMARY KEY,
    team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    role          TEXT DEFAULT 'batsman',   -- batsman | bowler | all-rounder | wicketkeeper
    batting_style TEXT DEFAULT 'right-hand', -- right-hand | left-hand
    bowling_style TEXT DEFAULT 'none',       -- none | right-arm-fast | right-arm-spin | left-arm-fast | left-arm-spin
    jersey_no     INTEGER,
    active        INTEGER DEFAULT 1,        -- 0 = removed from the active roster (history/stats are preserved either way)
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
    id              TEXT PRIMARY KEY,
    team1_id        TEXT NOT NULL REFERENCES teams(id),
    team2_id        TEXT NOT NULL REFERENCES teams(id),
    match_type      TEXT DEFAULT 'T20',   -- T20 | ODI | TEST | CUSTOM
    overs_limit     INTEGER DEFAULT 20,
    venue           TEXT,
    match_date      TEXT,
    toss_winner_id  TEXT REFERENCES teams(id),
    toss_decision   TEXT,                 -- bat | bowl
    status          TEXT DEFAULT 'upcoming', -- upcoming | live | completed
    current_innings INTEGER DEFAULT 1,
    result_text     TEXT,
    winner_id       TEXT REFERENCES teams(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS innings (
    id                TEXT PRIMARY KEY,
    match_id          TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    innings_number    INTEGER NOT NULL,
    batting_team_id   TEXT NOT NULL REFERENCES teams(id),
    bowling_team_id   TEXT NOT NULL REFERENCES teams(id),
    total_runs        INTEGER DEFAULT 0,
    total_wickets     INTEGER DEFAULT 0,
    total_balls       INTEGER DEFAULT 0,   -- legal balls bowled (6 = 1 over)
    extras_wide       INTEGER DEFAULT 0,
    extras_noball     INTEGER DEFAULT 0,
    extras_bye        INTEGER DEFAULT 0,
    extras_legbye     INTEGER DEFAULT 0,
    extras_penalty    INTEGER DEFAULT 0,
    target            INTEGER,             -- set when this is the chasing innings
    striker_id        TEXT REFERENCES players(id),
    non_striker_id    TEXT REFERENCES players(id),
    current_bowler_id TEXT REFERENCES players(id),
    is_completed      INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per legal/illegal delivery bowled. This is the source of truth;
-- every scorecard/statistic is derived from this table.
CREATE TABLE IF NOT EXISTS balls (
    id                TEXT PRIMARY KEY,
    innings_id        TEXT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    over_number       INTEGER NOT NULL,     -- 0-indexed
    ball_in_over      INTEGER NOT NULL,     -- 1-6 (legal balls only)
    ball_sequence     INTEGER NOT NULL,     -- global ordering incl. extras, used for undo
    batsman_id        TEXT NOT NULL REFERENCES players(id),
    non_striker_id    TEXT NOT NULL REFERENCES players(id),
    bowler_id         TEXT NOT NULL REFERENCES players(id),
    runs_batsman      INTEGER DEFAULT 0,    -- runs credited to batsman (0,1,2,3,4,6)
    extra_type        TEXT,                 -- NULL | wide | noball | bye | legbye | penalty
    extra_runs        INTEGER DEFAULT 0,
    is_wicket         INTEGER DEFAULT 0,
    wicket_type       TEXT,                 -- bowled | caught | lbw | run-out | stumped | hit-wicket | retired
    dismissed_id      TEXT REFERENCES players(id),
    fielder_id        TEXT REFERENCES players(id),
    is_legal          INTEGER DEFAULT 1,    -- 0 for wide/noball (doesn't count toward the over)
    commentary        TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_balls_innings ON balls(innings_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_innings_match ON innings(match_id);
