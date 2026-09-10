
const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        let statement;

        if (args.length === 1 && Array.isArray(args[0])) {
          statement = {
            sql,
            args: args[0],
          };
        } else if (
          args.length === 1 &&
          args[0] !== null &&
          typeof args[0] === 'object'
        ) {
          statement = {
            sql,
            args: args[0],
          };
        } else {
          statement = {
            sql,
            args,
          };
        }

        const result = await client.execute(statement);

        if (!result.rows || result.rows.length === 0) {
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
        let statement;

        if (args.length === 1 && Array.isArray(args[0])) {
          statement = {
            sql,
            args: args[0],
          };
        } else if (
          args.length === 1 &&
          args[0] !== null &&
          typeof args[0] === 'object'
        ) {
          statement = {
            sql,
            args: args[0],
          };
        } else {
          statement = {
            sql,
            args,
          };
        }

        const result = await client.execute(statement);

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
        let statement;

        if (args.length === 1 && Array.isArray(args[0])) {
          statement = {
            sql,
            args: args[0],
          };
        } else if (
          args.length === 1 &&
          args[0] !== null &&
          typeof args[0] === 'object'
        ) {
          statement = {
            sql,
            args: args[0],
          };
        } else {
          statement = {
            sql,
            args,
          };
        }

        return await client.execute(statement);
      },
    };
  },

  execute(statement) {
    return client.execute(statement);
  },

  initSchema(schemaSql) {
    return client.executeMultiple(schemaSql);
  },
};

module.exports = db;

