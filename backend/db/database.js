
const { createClient } = require('@tursodatabase/serverless/compat');
require('dotenv').config();

/* =========================================================
   CONFIGURATION
========================================================= */

const DATABASE_URL = process.env.TURSO_DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!DATABASE_URL || !DATABASE_AUTH_TOKEN) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.');
}

const client = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN,
});

/* =========================================================
   PLAYER NAME NORMALIZATION
========================================================= */

function normalizePlayerName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/* =========================================================
   QUERY ARGUMENT NORMALIZATION
========================================================= */

function normalizeQuery(sql, args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return { sql, args: args[0] };
  }

  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object'
  ) {
    const named = args[0];
    const values = [];

    const normalizedSql = sql.replace(
      /@([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, name) => {
        if (!Object.prototype.hasOwnProperty.call(named, name)) {
          throw new Error(`Missing SQL parameter: @${name}`);
        }

        values.push(named[name]);
        return '?';
      }
    );

    if (values.length === 0) {
      throw new Error(
        'Database query received an object but SQL contains no named parameters.'
      );
    }

    return { sql: normalizedSql, args: values };
  }

  return { sql, args };
}

/* =========================================================
   RESULT CONVERSION
========================================================= */

function convertValue(value) {
  if (value === null || value === undefined) return value;

  if (
    typeof value === 'object' &&
    typeof value.valueOf === 'function'
  ) {
    const converted = value.valueOf();
    if (converted !== value) return converted;
  }

  return value;
}

function convertRow(row, columns = []) {
  if (Array.isArray(row)) {
    return Object.fromEntries(
      columns.map((column, index) => [
        column,
        convertValue(row[index]),
      ])
    );
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      convertValue(value),
    ])
  );
}

/* =========================================================
   SQL SCHEMA PARSING
========================================================= */

function removeSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

function splitSqlStatements(schemaSql) {
  return removeSqlComments(schemaSql)
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

/* =========================================================
   SAFE COLUMN CHECKS
========================================================= */

const ALLOWED_TABLES = new Set([
  'notification_users',
  'teams',
  'players',
]);

async function columnExists(tableName, columnName) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Unsupported table name: ${tableName}`);
  }

  const result = await client.execute({
    sql: `PRAGMA table_info(${tableName})`,
  });

  return (result.rows || []).some(
    column => String(column.name) === columnName
  );
}

/* =========================================================
   PLAYER NAME UNIQUENESS MIGRATION

   - Active names must be unique within a team.
   - Inactive/deleted players do not reserve names.
   - Existing player IDs and scorecard history are preserved.
   - Existing unrelated indexes are preserved.
========================================================= */

async function ensurePlayerNameUniqueness() {
  console.log('Checking player-name uniqueness...');

  if (!(await columnExists('players', 'active'))) {
    throw new Error(
      'The players table has no active column. Cannot safely apply player-name migration.'
    );
  }

  if (!(await columnExists('players', 'team_id'))) {
    throw new Error(
      'The players table has no team_id column.'
    );
  }

  if (!(await columnExists('players', 'name'))) {
    throw new Error(
      'The players table has no name column.'
    );
  }

  if (!(await columnExists('players', 'name_key'))) {
    await client.execute(`
      ALTER TABLE players ADD COLUMN name_key TEXT
    `);
  }

  /*
   * Drop only the known obsolete indexes created by previous
   * versions of this migration.
   */
  await client.execute(`
    DROP INDEX IF EXISTS idx_players_team_name_key_unique
  `);

  await client.execute(`
    DROP INDEX IF EXISTS idx_players_team_name_key_active_unique
  `);

  await client.execute(`
    DROP INDEX IF EXISTS idx_players_team_active_name_unique
  `);

  await client.execute(`
    DROP INDEX IF EXISTS idx_players_team_active_name_unique_v2
  `);

  const result = await client.execute(`
    SELECT id, team_id, name, name_key, active
    FROM players
  `);

  const players = (result.rows || []).map(row =>
    convertRow(row, result.columns)
  );

  const activeNames = new Map();

  for (const player of players) {
    const nameKey = normalizePlayerName(player.name);

    /*
     * Update normalized names for all records, including
     * historical inactive records.
     */
    if (player.name_key !== nameKey) {
      await client.execute({
        sql: `UPDATE players SET name_key = ? WHERE id = ?`,
        args: [nameKey, player.id],
      });
    }

    if (Number(player.active) !== 1) {
      continue;
    }

    if (!nameKey) {
      throw new Error(
        `Active player ${player.id} has an empty name. Correct this record before enabling uniqueness.`
      );
    }

    const key = JSON.stringify([
      String(player.team_id),
      nameKey,
    ]);

    if (activeNames.has(key)) {
      throw new Error(
        `Duplicate active player names found in team ${player.team_id}: "${player.name}". Resolve the active duplicate before restarting.`
      );
    }

    activeNames.set(key, player.id);
  }

  /*
   * Use a partial unique index so inactive players do not
   * block name reuse. The application controller should also
   * check names using normalizePlayerName().
   *
   * This index uses SQLite lower(trim(name)); it does not
   * implement full Unicode or internal-whitespace normalization.
   */
  await client.execute(`
    CREATE UNIQUE INDEX idx_players_team_active_name_unique_v2
    ON players(team_id, lower(trim(name)))
    WHERE active = 1
  `);

  console.log('Player-name uniqueness migration completed.');

  return { ready: true };
}

/* =========================================================
   DATABASE MIGRATIONS
========================================================= */

async function ensureDatabaseUpdates() {
  console.log('Checking database updates...');

  const hasFcmToken = await columnExists(
    'notification_users',
    'fcm_token'
  );

  if (!hasFcmToken) {
    await client.execute(`
      ALTER TABLE notification_users
      ADD COLUMN fcm_token TEXT
    `);
  }

  const hasTeamArchived = await columnExists(
    'teams',
    'archived'
  );

  if (!hasTeamArchived) {
    await client.execute(`
      ALTER TABLE teams
      ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
    `);
  }

  await ensurePlayerNameUniqueness();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS notification_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      fcm_token TEXT NOT NULL UNIQUE,
      device_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)
        REFERENCES notification_users(id)
        ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_notification_devices_user
    ON notification_devices(user_id)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_teams_archived
    ON teams(archived)
  `);

  console.log('Database updates completed.');
}

/* =========================================================
   DATABASE QUERY HELPERS
========================================================= */

function createQueryInterface(executor) {
  return {
    prepare(sql) {
      return {
        async get(...args) {
          const query = normalizeQuery(sql, args);

          const result = await executor.execute({
            sql: query.sql,
            args: query.args,
          });

          if (!result.rows || result.rows.length === 0) {
            return undefined;
          }

          return convertRow(result.rows[0], result.columns);
        },

        async all(...args) {
          const query = normalizeQuery(sql, args);

          const result = await executor.execute({
            sql: query.sql,
            args: query.args,
          });

          return (result.rows || []).map(row =>
            convertRow(row, result.columns)
          );
        },

        async run(...args) {
          const query = normalizeQuery(sql, args);

          return executor.execute({
            sql: query.sql,
            args: query.args,
          });
        },
      };
    },
  };
}

/* =========================================================
   DATABASE OBJECT
========================================================= */

const db = {
  ...createQueryInterface(client),

  execute(statement) {
    return client.execute(statement);
  },

  async healthCheck() {
    const result = await client.execute({
      sql: 'SELECT 1 AS ok',
    });

    return Number(result.rows?.[0]?.ok) === 1;
  },

  async initSchema(schemaSql) {
    const statements = splitSqlStatements(schemaSql);

    console.log(
      `Initializing schema: ${statements.length} statements.`
    );

    for (let i = 0; i < statements.length; i++) {
      try {
        await client.execute(statements[i]);
      } catch (error) {
        console.error(
          `Schema statement ${i + 1} failed:`,
          error.message
        );

        console.error(statements[i]);
        throw error;
      }
    }

    console.log('Main schema initialized.');

    await ensureDatabaseUpdates();
  },
};

/* =========================================================
   TRANSACTION SUPPORT
========================================================= */

db.transaction = async function(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError(
      'Transaction callback must be a function'
    );
  }

  const tx = await client.transaction('write');
  const transactionDb = createQueryInterface(tx);

  try {
    const result = await callback(transactionDb);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch (rollbackError) {
      console.error(
        'Transaction rollback failed:',
        rollbackError.message
      );
    }

    throw error;
  }
};

/* =========================================================
   EXPORT
========================================================= */

module.exports = db;
