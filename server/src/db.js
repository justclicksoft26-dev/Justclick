import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import oracledb from 'oracledb';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

let pool;

export async function getPool() {
  pool ??= await oracledb.createPool({
    user: process.env.Schema,
    password: process.env.Password,
    connectString: process.env.CONNECTION_STRING,
    poolMin: 1,
    poolMax: 5,
  });
  return pool;
}

export async function query(sql, binds = {}, opts = {}) {
  const conn = await (await getPool()).getConnection();
  try {
    return await conn.execute(sql, binds, opts);
  } finally {
    await conn.close();
  }
}

// Runs fn(conn) in one transaction (autoCommit off); rolls back on any error.
export async function withTransaction(fn) {
  const conn = await (await getPool()).getConnection();
  try {
    const exec = (sql, binds = {}, opts = {}) => conn.execute(sql, binds, { ...opts, autoCommit: false });
    const execMany = (sql, rows, opts = {}) => conn.executeMany(sql, rows, { ...opts, autoCommit: false });
    const result = await fn({ exec, execMany });
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.close();
  }
}
