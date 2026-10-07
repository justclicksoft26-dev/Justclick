import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import oracledb from 'oracledb';
import { query } from './db.js';

// Set JWT_SECRET in .env to keep sessions valid across server restarts.
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

// Same check the ERP's APEX login uses (custom authentication function AUTH_F).
async function passwordMatches(username, password) {
  const r = await query(
    'begin :ok := case when AUTH_F(:u, :p) then 1 else 0 end; end;',
    { ok: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, u: username, p: password },
  );
  return r.outBinds.ok === 1;
}

export async function login(username, password) {
  if (!(await passwordMatches(username, password))) return null;
  const r = await query(
    'select user_name, real_name, role_id from acc_users where upper(user_name) = upper(:u)',
    { u: username },
  );
  const row = r.rows[0];
  if (!row) return null;
  const user = { username: row.USER_NAME, name: row.REAL_NAME, roleId: row.ROLE_ID };
  return { token: jwt.sign(user, SECRET, { expiresIn: EXPIRES_IN }), user };
}

export function requireAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  try {
    req.user = jwt.verify(m?.[1] ?? '', SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'انتهت الجلسة، سجّل الدخول من جديد' });
  }
}

export const currentUser = (req, res) => res.json(req.user);
