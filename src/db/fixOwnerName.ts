/**
 * One-time, idempotent fix for the owner and every administrator: when someone logged in
 * while an older test account already held their name, the new account was stored with a
 * "_1" suffix (e.g. "AlexCho1688_1"). This gives each name back to the account that is
 * actually in use.
 *
 * Safe by design:
 *  - does nothing for a name unless a user named exactly "<name>_1" exists
 *  - the older account is only renamed (its data stays), never deleted
 *  - any error is logged and ignored, it never stops the server from starting
 */
import { getPool } from './connection';

const OWNER = 'AlexCho1688';

async function fixOne(name: string): Promise<void> {
  const pool = getPool();
  const [mineRows] = await pool.execute('SELECT id FROM users WHERE username = ?', [`${name}_1`]);
  const mine = (mineRows as any[])[0];
  if (!mine) return;

  const [others] = await pool.execute(
    'SELECT id, username, pi_username FROM users WHERE id <> ? AND (username = ? OR pi_username = ?)',
    [mine.id, name, name]
  );
  for (const o of others as any[]) {
    if (o.username === name) {
      await pool.execute('UPDATE users SET username = ? WHERE id = ?', [`${name}_old_${o.id}`, o.id]);
    }
    if (o.pi_username === name) {
      await pool.execute('UPDATE users SET pi_username = NULL WHERE id = ?', [o.id]);
    }
    console.log(`[fixOwnerName] older account id=${o.id} renamed to ${name}_old_${o.id}`);
  }
  await pool.execute('UPDATE users SET username = ?, pi_username = ? WHERE id = ?', [name, name, mine.id]);
  console.log(`[fixOwnerName] account id=${mine.id} is now named ${name}`);
}

export async function fixOwnerName(): Promise<void> {
  try {
    const pool = getPool();
    const names = new Set<string>([OWNER]);
    const envOwner = (process.env.OWNER_PI_USERNAME || '').trim();
    if (envOwner) names.add(envOwner);
    try {
      const [admins] = await pool.execute('SELECT pi_username FROM app_admins');
      for (const a of admins as any[]) if (a.pi_username) names.add(String(a.pi_username));
    } catch (e) {
      console.error('[fixOwnerName] could not read admins:', e);
    }
    for (const n of names) {
      try {
        await fixOne(n);
      } catch (e) {
        console.error(`[fixOwnerName] ${n} skipped:`, e);
      }
    }
  } catch (e) {
    console.error('[fixOwnerName] skipped:', e);
  }
}
