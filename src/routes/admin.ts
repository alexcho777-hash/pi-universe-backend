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
 *
 * App-to-User payments (the app wallet sends Pi to a user; needed for the Mainnet wallet application):
 *   GET    /api/admin/a2u/status      setup check, unique wallets paid so far, recent payments
 *   POST   /api/admin/a2u/send        { username, amount, memo? }
 *   POST   /api/admin/a2u/retry       { paymentId }   finish a payment that stopped half way
 *   POST   /api/admin/a2u/cancel      { paymentId }   cancel a payment that never sent anything
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';
import { PiPlatform, PiApiError } from '../services/PiPlatform';
import { a2uConfigured, createA2U, submitA2U, completeA2U } from '../services/PiA2U';

const router = Router();

const clean = (s: unknown) => String(s || '').trim().replace(/^@/, '').toLowerCase();
/** Owner + administrators together: at most three people */
const MAX_PEOPLE = 3;
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
    res.json({ success: true, data: { owners: owners(), admins: rows, max: MAX_PEOPLE } });
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
    const [all] = await pool.execute('SELECT pi_username FROM app_admins');
    if (owners().length + (all as any[]).length >= MAX_PEOPLE) return fail(res, 400, 'The limit of 3 administrators has been reached');
    const [exists] = await pool.execute('SELECT pi_username FROM app_admins WHERE pi_username = ?', [name]);
    if (!(exists as any[]).length) {
      await pool.execute('INSERT INTO app_admins (pi_username, added_by) VALUES (?, ?)', [name, me.name]);
    }
    res.json({ success: true, data: { username: name } });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

// ---------------------------------------------------------------------------
// App-to-User payments
// ---------------------------------------------------------------------------

/** Largest single A2U payment (safety net). Change with the A2U_MAX_AMOUNT env variable. */
const a2uMax = () => {
  const n = parseFloat(process.env.A2U_MAX_AMOUNT || '5');
  return Number.isFinite(n) && n > 0 ? n : 5;
};
/** Usernames with a payment in flight, so a double click cannot send twice */
const a2uBusy = new Set<string>();

async function requireStaff(req: Request, res: Response): Promise<{ role: Role; name: string } | null> {
  const me = await roleOf((req as any).userId);
  if (!me.role) {
    fail(res, 403, 'Administrators only');
    return null;
  }
  return me;
}

function piError(res: Response, err: any) {
  const status = err instanceof PiApiError && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[a2u]', err?.message, err?.body ? JSON.stringify(err.body).slice(0, 500) : '');
  res.status(status === 500 ? 500 : 502).json({ success: false, error: err?.message || 'A2U failed', details: err?.body || undefined });
}

router.get('/a2u/status', async (req: Request, res: Response) => {
  try {
    if (!(await requireStaff(req, res))) return;
    const pool = getPool();
    const cfg = a2uConfigured();
    const [uniq] = await pool.execute(`SELECT COUNT(DISTINCT to_pi_uid) AS n FROM a2u_payments WHERE status = 'completed'`);
    const [recent] = await pool.execute(
      `SELECT payment_id, to_username, amount, status, txid, error, created_at FROM a2u_payments ORDER BY id DESC LIMIT 30`
    );
    res.json({
      success: true,
      data: {
        configured: cfg.ok,
        missing: cfg.missing,
        network: String(process.env.PI_NETWORK || 'testnet').toLowerCase(),
        maxAmount: a2uMax(),
        uniqueWalletsPaid: Number((uniq as any[])[0]?.n || 0),
        target: 5,
        recent,
      },
    });
  } catch (e: any) {
    fail(res, 500, e.message);
  }
});

router.post('/a2u/send', async (req: Request, res: Response) => {
  const me = await requireStaff(req, res);
  if (!me) return;

  const name = clean(req.body?.username);
  const amount = Math.round(Number(req.body?.amount) * 1e7) / 1e7;
  const memo = String(req.body?.memo || 'Pi Universe test reward').slice(0, 28);
  if (!name) return fail(res, 400, 'username is required');
  if (!(amount > 0)) return fail(res, 400, 'amount must be greater than 0');
  if (amount > a2uMax()) return fail(res, 400, `amount is above the safety limit of ${a2uMax()} π`);
  const cfg = a2uConfigured();
  if (!cfg.ok) return fail(res, 500, `Server is missing: ${cfg.missing.join(', ')}`);
  if (a2uBusy.has(name)) return fail(res, 409, 'A payment to this user is already in progress');

  a2uBusy.add(name);
  let paymentId = '';
  try {
    const pool = getPool();
    const [urows] = await pool.execute('SELECT pi_uid, pi_username FROM users WHERE LOWER(pi_username) = ?', [name]);
    const user = (urows as any[])[0];
    if (!user || !user.pi_uid) return fail(res, 404, 'No user with that Pi username. They must open π Universe in the Pi Browser and log in once.');

    // 1. create
    const created = await createA2U(user.pi_uid, amount, memo, { kind: 'a2u', by: me.name });
    paymentId = created.identifier;
    await pool.execute(
      `INSERT INTO a2u_payments (payment_id, to_pi_uid, to_username, amount, memo, status, sent_by)
       VALUES (?, ?, ?, ?, ?, 'created', ?)
       ON CONFLICT (payment_id) DO NOTHING`,
      [paymentId, user.pi_uid, user.pi_username, amount, memo, me.name]
    );

    // 2-3. send on the blockchain
    const { txid, payment } = await submitA2U(paymentId);
    await pool.execute(
      `UPDATE a2u_payments SET status = 'submitted', txid = ?, to_address = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`,
      [txid, payment.to_address || null, paymentId]
    );

    // 4. complete
    await completeA2U(paymentId, txid);
    await pool.execute(`UPDATE a2u_payments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`, [paymentId]);

    res.json({ success: true, data: { paymentId, txid, username: user.pi_username, amount } });
  } catch (err: any) {
    if (paymentId) {
      try {
        await getPool().execute(`UPDATE a2u_payments SET error = ?, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`, [String(err?.message || err).slice(0, 500), paymentId]);
      } catch { /* ignore */ }
    }
    piError(res, err);
  } finally {
    a2uBusy.delete(name);
  }
});

router.post('/a2u/retry', async (req: Request, res: Response) => {
  if (!(await requireStaff(req, res))) return;
  const paymentId = String(req.body?.paymentId || '');
  if (!paymentId) return fail(res, 400, 'paymentId is required');
  if (a2uBusy.has(paymentId)) return fail(res, 409, 'This payment is already being processed');
  a2uBusy.add(paymentId);
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT status, txid FROM a2u_payments WHERE payment_id = ?', [paymentId]);
    const row = (rows as any[])[0];
    if (!row) return fail(res, 404, 'Unknown payment');
    if (row.status === 'completed') return res.json({ success: true, data: { paymentId, already: true } });

    // Ask Pi first: a transaction may already exist even if we did not record it.
    const remote = await PiPlatform.getPayment(paymentId);
    let txid: string | null = remote.transaction?.txid || row.txid || null;
    if (!txid) {
      const sent = await submitA2U(paymentId);
      txid = sent.txid;
    }
    await pool.execute(`UPDATE a2u_payments SET status = 'submitted', txid = ?, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`, [txid, paymentId]);
    if (!remote.status.developer_completed) await completeA2U(paymentId, txid);
    await pool.execute(`UPDATE a2u_payments SET status = 'completed', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`, [paymentId]);
    res.json({ success: true, data: { paymentId, txid } });
  } catch (err: any) {
    piError(res, err);
  } finally {
    a2uBusy.delete(paymentId);
  }
});

router.post('/a2u/cancel', async (req: Request, res: Response) => {
  if (!(await requireStaff(req, res))) return;
  const paymentId = String(req.body?.paymentId || '');
  if (!paymentId) return fail(res, 400, 'paymentId is required');
  try {
    const remote = await PiPlatform.getPayment(paymentId);
    if (remote.transaction?.txid) return fail(res, 400, 'This payment already has a blockchain transaction. Use retry instead of cancel.');
    await PiPlatform.cancelPayment(paymentId);
    await getPool().execute(`UPDATE a2u_payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`, [paymentId]);
    res.json({ success: true, data: { paymentId, cancelled: true } });
  } catch (err: any) {
    piError(res, err);
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
