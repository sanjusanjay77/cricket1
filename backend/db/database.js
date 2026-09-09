const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Small better-sqlite3-like adapter. The returned methods are async because Turso is remote.
const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const r = await client.execute({ sql, args });
        return r.rows[0] ? Object.fromEntries(Object.entries(r.rows[0]).map(([k,v]) => [k, v?.valueOf?.() ?? v])) : undefined;
      },
      async all(...args) {
        const r = await client.execute({ sql, args });
        return r.rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, v?.valueOf?.() ?? v])));
      },
      async run(...args) {
        return client.execute({ sql, args });
      }
    };
  },
  execute: (stmt) => client.execute(stmt),
  initSchema: async (schemaSql) => client.executeMultiple(schemaSql),
};

module.exports = db;
