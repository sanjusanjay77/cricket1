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
 * Convert named parameters such as:
 *
 *   WHERE id = @id
 *
 * into positional parameters:
 *
 *   WHERE id = ?
 *
 * This makes the adapter compatible with Turso/libSQL.
 */
function normalizeQuery(sql, args) {
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

  return {
    sql,
    args,
  };
}

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const query = normalizeQuery(sql, args);

        const result = await client.execute(query);

        if (!result.rows[0]) {
          return undefined;
        }

        return Object.fromEntries(
          Object.entries(result.rows[0]).map(([key, value]) => [
            key,
            value?.valueOf?.() ?? value,
          ])
        );
      },

      async all(...args) {
        const query = normalizeQuery(sql, args);

        const result = await client.execute(query);

        return result.rows.map(row =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              value?.valueOf?.() ?? value,
            ])
          )
        );
      },

      async run(...args) {
        const query = normalizeQuery(sql, args);

        return await client.execute(query);
      },
    };
  },

  execute: statement => client.execute(statement),

  initSchema: async schemaSql => {
    return client.executeMultiple(schemaSql);
  },
};

module.exports = db;
