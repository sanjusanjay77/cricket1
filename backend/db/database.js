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
 * Convert named parameters:
 *
 *   WHERE id = @id
 *
 * with:
 *
 *   .run({ id: 123 })
 *
 * into:
 *
 *   WHERE id = ?
 *
 * with:
 *
 *   args: [123]
 *
 * Positional parameters are passed through unchanged.
 */
function normalizeQuery(sql, args) {
  // Named parameter object
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
        if (!(name in named)) {
          throw new Error(`Missing SQL parameter: ${name}`);
        }

        values.push(named[name]);
        return '?';
      }
    );

    return {
      sql: normalizedSql,
      args: values,
    };
  }

  // Positional parameters:
  //
  // .run(1, 2, 3)
  //
  // becomes:
  //
  // args: [1, 2, 3]
  //
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

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

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

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

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

        const result = await client.execute({
          sql: query.sql,
          args: query.args,
        });

        return result;
      },
    };
  },

  execute: statement => client.execute(statement),

  initSchema: async schemaSql => {
    return client.executeMultiple(schemaSql);
  },
};

module.exports = db;

