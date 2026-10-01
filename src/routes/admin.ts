/**
 * Administrators.
 *  - The owner(s) are named in the OWNER_PI_USERNAME env variable (comma separated Pi usernames).
 *  - The owner can add or remove other administrators; they are stored in app_admins.
 *  - Administrators get the preview tools in the app. Nothing here changes any user's data.
 *
 *   GET    /api/admin/me              { role: 'owner' | 'admin' | null }
 *   GET    /api/admin/list            administrators (owner or admin)
 *   POST   /api/admin/add             { username }  (owner only)
 *   DELETE /api/admin/:username       (owner only)
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const clean = (s: unknown) => String(s || '').trim().replace(/^@/, '').toLowerCase();
const owners = () => (process.env.OWNER_PI_USERNAME || '').split(',').map(clean).filter(Boolean);

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

type Role = 'owner' | 'admin' | null;

async function roleOf(userId: number): Promise<{ role: Role; name: string }> {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT username, pi_username FROM users WHERE id = ?', [userId]);
  const u = (rows as any[])[0];
  if (!u) return { role: null, name: '' };
  const names = [clean(u.pi_username), clean(u.username)].filter(Boolean);
  if (names.some((n) => owners().includes(n))) return { role: 'owner', name: names[0] };
  for (const n of names) {
    const [r] = await pool.execute('SELECT pi_username FROM app_admins WHERE pi_username = ?', [n]);
    if ((r as any[]).length) return { role: 'admin', name: n };
  }
  return { role: null, name: names[0] || '' };
}

router.use(authMiddleware);

router.get('/me', async (req: Request, res: Response) => {
  try {
    const { role, name } = await roleOf((req as any).userId);
    res.json({ success: true, data: { role, username: name } });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    const { role } = await roleOf((req as any).userId);
    if (!role) return fail(res, 403, 'Administrators only');
    const [rows] = await getPool().execute('SELECT pi_username, added_by, created_at FROM app_admins ORDER BY created_at');
    res.json({ success: true, data: { owners: owners(), admins: rows } });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

router.post('/add', async (req: Request, res: Response) => {
  try {
    const me = await roleOf((req as any).userId);
    if (me.role !== 'owner') return fail(res, 403, 'Only the owner can add administrators');
    const name = clean(req.body?.username);
    if (!name || !/^[a-z0-9_.\-]{2,60}$/.test(name)) return fail(res, 400, 'Invalid Pi username');
    if (owners().includes(name)) return fail(res, 400, 'Already the owner');
    const pool = getPool();
    const [exists] = await pool.execute('SELECT pi_username FROM app_admins WHERE pi_username = ?', [name]);
    if (!(exists as any[]).length) {
      await pool.execute('INSERT INTO app_admins (pi_username, added_by) VALUES (?, ?)', [name, me.name]);
    }
    res.json({ success: true, data: { username: name } });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

router.delete('/:username', async (req: Request, res: Response) => {
  try {
    const me = await roleOf((req as any).userId);
    if (me.role !== 'owner') return fail(res, 403, 'Only the owner can remove administrators');
    await getPool().execute('DELETE FROM app_admins WHERE pi_username = ?', [clean(req.params.username)]);
    res.json({ success: true, data: { removed: true } });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

export default router;
