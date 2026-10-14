/**
 * Startup step (name kept so server.ts needs no change).
 *
 * The same person has a different Pi id on Testnet and on Mainnet, so they have two accounts here.
 * Until now a name could only belong to one account, which produced names like "AlexCho1688_1"
 * or "AlexCho1688_old_17". Now the Pi username may be shared by those accounts:
 *  - drop the "one name only" rule on users.username and users.pi_username (safe to repeat)
 *  - nothing is renamed or deleted any more
 * Any error is logged and ignored: it never stops the server from starting.
 */
import { getPool } from './connection';

export async function fixOwnerName(): Promise<void> {
  const pool = getPool();
  for (const sql of [
    'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key',
    'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pi_username_key',
  ]) {
    try {
      await pool.execute(sql);
    } catch (e) {
      console.error('[names] skipped:', sql, e);
    }
  }
}
