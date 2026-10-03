/**
 * One-time, idempotent fix: the site owner logged in once while an older test account
 * already held the name "AlexCho1688", so the new account was stored as "AlexCho1688_1".
 * This gives the name back to the account that is actually in use.
 *
 * Safe by design:
 *  - does nothing unless a user named exactly "AlexCho1688_1" exists
 *  - the older account is only renamed (data stays), never deleted
 *  - any error is logged and ignored, it never stops the server from starting
 */
import { getPool } from './connection';

const NAME = 'AlexCho1688';

export async function fixOwnerName(): Promise<void> {
  try {
    const pool = getPool();
    const [mineRows] = await pool.execute('SELECT id FROM users WHERE username = ?', [`${NAME}_1`]);
    const mine = (mineRows as any[])[0];
    if (!mine) return;

    const [others] = await pool.execute(
      'SELECT id, username, pi_username FROM users WHERE id <> ? AND (username = ? OR pi_username = ?)',
      [mine.id, NAME, NAME]
    );
    for (const o of others as any[]) {
      if (o.username === NAME) {
        await pool.execute('UPDATE users SET username = ? WHERE id = ?', [`${NAME}_old_${o.id}`, o.id]);
      }
      if (o.pi_username === NAME) {
        await pool.execute('UPDATE users SET pi_username = NULL WHERE id = ?', [o.id]);
      }
      console.log(`[fixOwnerName] older account id=${o.id} renamed to ${NAME}_old_${o.id}`);
    }
    await pool.execute('UPDATE users SET username = ?, pi_username = ? WHERE id = ?', [NAME, NAME, mine.id]);
    console.log(`[fixOwnerName] account id=${mine.id} is now named ${NAME}`);
  } catch (e) {
    console.error('[fixOwnerName] skipped:', e);
  }
}
