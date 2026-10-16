
const { createClient } = require('@tursodatabase/serverless/compat');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Normalize player names consistently.
 *
 * - Unicode normalization
 * - Trim leading/trailing whitespace
 * - Collapse repeated whitespace
 * - Compare without case sensitivity
 */
function normalizePlayerName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Convert better-sqlite3 style arguments
 * into @libsql/client format.
 */
function normalizeQuery(sql, args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return {
      sql,
      args: args[0],
    };
  }

  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {
    const named = args[0];
    const names = [];
    const values = [];

    const normalizedSql = sql.replace(
      /@([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, name) => {
        names.push(name);
        values.push(named[name]);
        return '?';
      }
    );

    if (names.length > 0) {
      return {
        sql: normalizedSql,
        args: values,
      };
    }

    throw new Error(
      'Database query received an object but SQL contains no named parameters.'
    );
  }

  return {
    sql,
    args,
  };
}

/**
 * Convert special libSQL values into normal JS values.
 */
function convertValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === 'object' &&
    typeof value.valueOf === 'function'
  ) {
    const converted = value.valueOf();

    if (converted !== value) {
      return converted;
    }
  }

  return value;
}

/**
 * Convert a database row into a normal object.
 */
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

/**
 * Remove SQL comments.
 */
function removeSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

/**
 * Split a schema into individual SQL statements.
 */
function splitSqlStatements(schemaSql) {
  const cleaned = removeSqlComments(schemaSql);

  return cleaned
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Check whether a column exists in a table.
 */
async function columnExists(tableName, columnName) {
  const allowedTables = new Set([
    'notification_users',
    'teams',
    'players',
  ]);

  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported table name: ${tableName}`);
  }

  const result = await client.execute({
    sql: `PRAGMA table_info(${tableName})`,
  });

  return (result.rows || []).some(
    (column) => String(column.name) === columnName
  );
}

/**
 * Safely prepare the player-name uniqueness migration.
 *
 * This function NEVER merges, deletes, renames, or reassigns
 * player records or historical statistics.
 *
 * If conflicts exist, it reports them and does not create
 * the unique index.
 */
async function ensurePlayerNameUniqueness() {
  console.log('🔄 Checking player-name uniqueness...');

  const hasNameKey = await columnExists(
    'players',
    'name_key'
  );

  if (!hasNameKey) {
    console.log('➕ Adding players.name_key...');

    await client.execute(`
      ALTER TABLE players
      ADD COLUMN name_key TEXT
    `);
  }

  // Read all players, including inactive historical records.
  const result = await client.execute(`
    SELECT id, team_id, name, name_key, active
    FROM players
  `);

  const players = (result.rows || []).map((row) =>
    convertRow(row, result.columns)
  );

  // Calculate normalized keys for all records.
  const normalizedPlayers = players.map((player) => ({
    ...player,
    calculatedNameKey: normalizePlayerName(player.name),
  }));

  // Empty names need manual attention rather than silently
  // allowing records without a usable identity key.
  const invalidPlayers = normalizedPlayers.filter(
    (player) => !player.calculatedNameKey
  );

  if (invalidPlayers.length > 0) {
    console.error(
      '⚠️ Players with empty normalized names were found:'
    );

    for (const player of invalidPlayers) {
      console.error({
        id: player.id,
        team_id: player.team_id,
        name: player.name,
        active: player.active,
      });
    }

    console.error(
      'Resolve these invalid names before enabling uniqueness.'
    );

    return {
      ready: false,
      reason: 'INVALID_PLAYER_NAMES',
    };
  }

  // Detect duplicates using the calculated key, not the stored
  // key, so legacy records with missing or stale keys are caught.
  const groups = new Map();

  for (const player of normalizedPlayers) {
    const groupKey = JSON.stringify([
      String(player.team_id),
      player.calculatedNameKey,
    ]);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(player);
  }

  const duplicates = [...groups.values()].filter(
    (group) => group.length > 1
  );

  if (duplicates.length > 0) {
    console.error(
      `⚠️ Found ${duplicates.length} duplicate player-name group(s).`
    );

    for (const group of duplicates) {
      console.error(
        JSON.stringify(
          group.map((player) => ({
            id: player.id,
            team_id: player.team_id,
            name: player.name,
            name_key: player.calculatedNameKey,
            active: player.active,
          })),
          null,
          2
        )
      );
    }

    console.error(
      'The unique index was NOT created. ' +
      'Resolve conflicts without merging or deleting historical records, ' +
      'then restart the backend.'
    );

    return {
      ready: false,
      reason: 'DUPLICATE_PLAYER_NAMES',
      duplicateGroups: duplicates.length,
    };
  }

  // Backfill and repair missing or stale keys only after the
  // duplicate audit passes. This changes no player IDs or stats.
  for (const player of normalizedPlayers) {
    if (player.name_key !== player.calculatedNameKey) {
      await client.execute({
        sql: `
          UPDATE players
          SET name_key = ?
          WHERE id = ?
        `,
        args: [
          player.calculatedNameKey,
          player.id,
        ],
      });
    }
  }

  // This index enforces uniqueness for active and inactive
  // players. Different teams may use the same player name.
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_players_team_name_key_unique
    ON players(team_id, name_key)
  `);

  console.log(
    '✅ Unique player-name-per-team index is ready.'
  );

  return {
    ready: true,
  };
}

/**
 * Add columns and tables required by newer
 * versions of the application.
 */
async function ensureDatabaseUpdates() {
  console.log('🔄 Checking database updates...');

  try {
    // =====================================================
    // FCM TOKEN - LEGACY COMPATIBILITY
    // =====================================================

    const hasFcmToken = await columnExists(
      'notification_users',
      'fcm_token'
    );

    if (!hasFcmToken) {
      console.log(
        '➕ Adding fcm_token column to notification_users...'
      );

      await client.execute(`
        ALTER TABLE notification_users
        ADD COLUMN fcm_token TEXT
      `);

      console.log(
        '✅ fcm_token column added successfully'
      );
    } else {
      console.log(
        '✅ fcm_token column already exists'
      );
    }

    // =====================================================
    // TEAM ARCHIVE
    // =====================================================

    const hasTeamArchived = await columnExists(
      'teams',
      'archived'
    );

    if (!hasTeamArchived) {
      console.log(
        '➕ Adding archived column to teams...'
      );

      await client.execute(`
        ALTER TABLE teams
        ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
      `);

      console.log(
        '✅ teams.archived column added successfully'
      );
    } else {
      console.log(
        '✅ teams.archived column already exists'
      );
    }

    // =====================================================
    // PLAYER NAME UNIQUENESS
    // =====================================================

    const playerNameMigration =
      await ensurePlayerNameUniqueness();

    if (!playerNameMigration.ready) {
      console.warn(
        '⚠️ Player-name uniqueness is NOT enabled yet:',
        playerNameMigration.reason
      );

      // Do not throw here. Keep the existing website available
      // while reporting conflicts for manual resolution.
    }

    // =====================================================
    // MULTI-DEVICE NOTIFICATION TABLE
    // =====================================================

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

    // =====================================================
    // INDEX FOR FAST USER DEVICE LOOKUPS
    // =====================================================

    await client.execute(`
      CREATE INDEX IF NOT EXISTS
      idx_notification_devices_user
      ON notification_devices(user_id)
    `);

    // =====================================================
    // INDEX FOR ACTIVE / ARCHIVED TEAMS
    // =====================================================

    await client.execute(`
      CREATE INDEX IF NOT EXISTS
      idx_teams_archived
      ON teams(archived)
    `);

    console.log(
      '✅ Multi-device notification table ready'
    );

    console.log(
      '✅ Team archive system ready'
    );
  } catch (error) {
    console.error('❌ Database update failed:');
    console.error(error);
    throw error;
  }

  console.log('✅ Database updates completed');
}

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const query = normalizeQuery(sql, args);

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

        if (!result.rows || result.rows.length === 0) {
          return undefined;
        }

        return convertRow(
          result.rows[0],
          result.columns
        );
      },

      async all(...args) {
        const query = normalizeQuery(sql, args);

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

        return (result.rows || []).map((row) =>
          convertRow(row, result.columns)
        );
      },

      async run(...args) {
        const query = normalizeQuery(sql, args);

        return await client.execute({
          sql: query.sql,
          args: query.args,
        });
      },
    };
  },

  execute(statement) {
    return client.execute(statement);
  },

  /**
   * Initialize the main schema and then apply updates.
   */
  async initSchema(schemaSql) {
    const statements = splitSqlStatements(schemaSql);

    console.log(
      `📦 Schema contains ${statements.length} SQL statements`
    );

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        await client.execute(statement);
      } catch (error) {
        console.error(
          `❌ Schema statement ${i + 1} failed`
        );

        console.error(statement);
        throw error;
      }
    }

    console.log(
      '✅ Database schema initialized successfully'
    );

    await ensureDatabaseUpdates();
  },
};

module.exports = db;
