
const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/*
 * Converts named parameters:
 *
 *   WHERE id = @id
 *
 * into positional parameters:
 *
 *   WHERE id = ?
 *
 * It also supports:
 *
 *   .run([value1, value2, ...])
 *
 * which is required for Turso/libSQL positional parameters.
 */
function normalizeQuery(sql, args) {
  // .run([value1, value2, ...])
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
    const values = [];

    const normalizedSql = sql.replace(
      /@([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, name) => {
        values.push(named[name]);
        return '?';
      }
    );

    return {
      sql: normalizedSql,
      args: values,
    };
  }

  // Normal positional parameters:
  // .run(value1, value2, value3)
  return {
    sql,
    args,
  };
}

function convertRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value?.valueOf?.() ?? value,
    ])
  );
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

        if (!result.rows || !result.rows[0]) {
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

  initSchema: async (schemaSql) => {
    return client.executeMultiple(schemaSql);
  },
};

module.exports = db;

