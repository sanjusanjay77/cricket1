const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Convert better-sqlite3 style arguments
 * into @libsql/client format.
 */
function normalizeQuery(sql, args) {
  // .run([value1, value2, value3])
  if (args.length === 1 && Array.isArray(args[0])) {
    return {
      sql,
      args: args[0],
    };
  }

  // .run({ id: value, name: value })
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

  // .run(value1, value2, value3)
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
function convertRow(row) {
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
 *
 * Your schema contains normal CREATE TABLE / CREATE INDEX /
 * PRAGMA statements, so this is safe for the current schema.
 */
function splitSqlStatements(schemaSql) {
  const cleaned = removeSqlComments(schemaSql);

  return cleaned
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
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

        return convertRow(result.rows[0]);
      },

      async all(...args) {
        const query = normalizeQuery(sql, args);

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

        return (result.rows || []).map(convertRow);
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
   * Initialize database schema.
   *
   * IMPORTANT:
   * We intentionally execute each SQL statement separately
   * instead of sending the entire schema to executeMultiple().
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

    console.log('✅ Database schema initialized successfully');
  },
};

module.exports = db;
