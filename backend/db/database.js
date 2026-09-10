
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
 * Supports BOTH:
 *
 * 1. Named parameters
 *
 *    SELECT * FROM users WHERE id = @id
 *
 *    .get({ id: 123 })
 *
 * 2. Positional parameters
 *
 *    SELECT * FROM users WHERE id = ?
 *
 *    .get(123)
 *
 * 3. Positional SQL with an object
 *
 *    UPDATE table SET a=?, b=?, c=?
 *
 *    .run({
 *      a: 1,
 *      b: 2,
 *      c: 3
 *    })
 *
 *    This is converted to:
 *
 *    args: [1, 2, 3]
 */

function normalizeQuery(sql, args) {

  /*
   * No arguments
   */
  if (args.length === 0) {
    return {
      sql,
      args: [],
    };
  }

  /*
   * One object argument
   */
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {

    const params = args[0];

    /*
     * CASE 1:
     * SQL uses named parameters such as @id
     */
    if (/@[A-Za-z_][A-Za-z0-9_]*/.test(sql)) {

      const values = [];

      const normalizedSql = sql.replace(
        /@([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, name) => {

          if (!(name in params)) {
            throw new Error(
              `Missing SQL parameter: ${name}`
            );
          }

          values.push(params[name]);

          return '?';
        }
      );

      return {
        sql: normalizedSql,
        args: values,
      };
    }

    /*
     * CASE 2:
     * SQL uses positional ? parameters.
     *
     * Example:
     *
     * UPDATE table
     * SET a=?, b=?, c=?
     *
     * .run({ a: 1, b: 2, c: 3 })
     *
     * becomes:
     *
     * args: [1, 2, 3]
     */

    const placeholderCount =
      (sql.match(/\?/g) || []).length;

    const values = Object.values(params);

    if (placeholderCount !== values.length) {
      throw new Error(
        `SQL parameter mismatch: SQL expects ${placeholderCount} parameters, but received ${values.length}.`
      );
    }

    return {
      sql,
      args: values,
    };
  }

  /*
   * Normal positional arguments.
   *
   * Example:
   *
   * .get(playerId)
   *
   * becomes:
   *
   * args: [playerId]
   *
   * And:
   *
   * .get(playerId, playerId)
   *
   * becomes:
   *
   * args: [playerId, playerId]
   */

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
          Object.entries(result.rows[0]).map(
            ([key, value]) => [
              key,
              value?.valueOf?.() ?? value,
            ]
          )
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
            Object.entries(row).map(
              ([key, value]) => [
                key,
                value?.valueOf?.() ?? value,
              ]
            )
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


  execute(statement) {
    return client.execute(statement);
  },


  initSchema(schemaSql) {
    return client.executeMultiple(schemaSql);
  },
};


module.exports = db;

