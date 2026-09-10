const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Turso/libSQL adapter.
// Supports both:
//   .run(value1, value2, ...)
// and:
//   .run({ named_parameter: value, ... })
const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const query = {
          sql,
          args: args.length === 1 && isPlainObject(args[0]) ? args[0] : args,
        };

        const r = await client.execute(query);

        return r.rows[0]
          ? Object.fromEntries(
              Object.entries(r.rows[0]).map(([k, v]) => [
                k,
                v?.valueOf?.() ?? v,
              ])
            )
          : undefined;
      },

      async all(...args) {
        const query = {
          sql,
          args: args.length === 1 && isPlainObject(args[0]) ? args[0] : args,
        };

        const r = await client.execute(query);

        return r.rows.map(row =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              v?.valueOf?.() ?? v,
            ])
          )
        );
      },

      async run(...args) {
        const query = {
          sql,
          args: args.length === 1 && isPlainObject(args[0]) ? args[0] : args,
        };

        return client.execute(query);
      },
    };
  },

  execute: stmt => client.execute(stmt),

  initSchema: async schemaSql => client.executeMultiple(schemaSql),
};

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

module.exports = db;
