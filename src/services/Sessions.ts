/**
 * Login sessions
 *
 * After the server has verified who a user is with the Pi Platform API
 * (Pi SDK access token or Pi Sign-In token -> GET /v2/me), it issues a random
 * session token. The browser sends it as `Authorization: Bearer <token>`.
 * Only a SHA-256 hash is stored, so a database leak does not leak usable tokens.
 */

import crypto from 'crypto';
import { getPool } from '../db/connection';

const SESSION_DAYS = 30;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface SessionUser {
  id: number;
  pi_uid: string;
  username: string;
  current_sanctuary_id: number;
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const pool = getPool();
  // Housekeeping: drop expired sessions
  await pool.execute('DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP');
  await pool.execute(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, CURRENT_TIMESTAMP + make_interval(days => ?))`,
    [hash(token), userId, SESSION_DAYS]
  );
  return token;
}

export async function findSessionUser(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const [rows] = await getPool().execute(
    `SELECT u.id, u.pi_uid, u.username, u.current_sanctuary_id
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    [hash(token)]
  );
  const list = rows as SessionUser[];
  return list.length > 0 ? list[0] : null;
}

export async function deleteSession(token: string): Promise<void> {
  await getPool().execute('DELETE FROM user_sessions WHERE token_hash = ?', [hash(token)]);
}

export function bearerToken(header?: string): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
