/**
 * Pi Payments Routes (User-to-App donations)
 *
 * Flow (see Pi docs "Payments"):
 *  1. Frontend calls Pi.createPayment({ amount, memo, metadata: { sanctuary_id } })
 *  2. onReadyForServerApproval(paymentId)  -> POST /api/payments/approve
 *  3. User signs the transaction in the Pi Wallet
 *  4. onReadyForServerCompletion(paymentId, txid) -> POST /api/payments/complete
 *  5. Server completes the payment with Pi and records the donation
 *
 * The server never trusts amounts/users sent by the browser: it always re-reads the
 * payment from the Pi Platform API before approving, completing or recording it.
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { PiPlatform, PiPayment, PiApiError } from '../services/PiPlatform';
import { optionalAuth } from '../middleware/auth';

const router = Router();

function fail(res: Response, status: number, error: string, details?: any) {
  res.status(status).json({ success: false, error, details, timestamp: new Date().toISOString() });
}

async function findUserByPiUid(piUid: string): Promise<{ id: number; current_sanctuary_id: number } | null> {
  const [rows] = await getPool().execute('SELECT id, current_sanctuary_id FROM users WHERE pi_uid = ?', [piUid]);
  const list = rows as any[];
  return list.length > 0 ? list[0] : null;
}

/** The donor chose to appear as 隱名善信 in the merit book */
function isAnonymous(payment: PiPayment): boolean {
  const v = payment.metadata && payment.metadata.anonymous;
  return v === true || v === 'true' || v === 1;
}

const LAMP_PRICE = 3.14;
const LAMP_TYPES = new Set(['guangming', 'taisui', 'wenchang']);

function kindOf(payment: PiPayment): string {
  return String((payment.metadata && payment.metadata.kind) || 'donation');
}

function sanctuaryIdOf(payment: PiPayment): number | null {
  const raw = payment.metadata && (payment.metadata.sanctuary_id ?? payment.metadata.sanctuaryId);
  const id = parseInt(String(raw), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Make sure the payment belongs to the logged-in caller (when there is a session). */
function assertOwner(req: Request, payment: PiPayment) {
  const sessionUid = req.user?.pi_uid;
  if (sessionUid && sessionUid !== payment.user_uid) {
    throw new PiApiError('This payment belongs to a different Pi user', 403, null);
  }
}

/** Record a completed payment as a donation. Safe to call more than once per payment. */
async function recordDonation(payment: PiPayment, txid: string | null): Promise<void> {
  const user = await findUserByPiUid(payment.user_uid);
  if (!user) {
    console.warn(`[payments] no local user for pi_uid ${payment.user_uid}, payment ${payment.identifier}`);
    return;
  }
  const sanctuaryId = sanctuaryIdOf(payment) || user.current_sanctuary_id || 1;
  const pool = getPool();

  await pool.execute(
    `INSERT INTO donations (user_id, sanctuary_id, amount, currency, message, is_anonymous, pi_payment_id, pi_txid)
     VALUES (?, ?, ?, 'pi', ?, ?, ?, ?)
     ON CONFLICT (pi_payment_id) DO NOTHING`,
    [user.id, sanctuaryId, payment.amount, payment.memo || null, isAnonymous(payment), payment.identifier, txid]
  );

  await pool.execute(
    `UPDATE pi_payments SET status = 'completed', txid = ?, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`,
    [txid, payment.identifier]
  );
}

/** Record a completed lamp-lighting payment. Safe to call more than once per payment. */
async function recordLamp(payment: PiPayment, txid: string | null): Promise<void> {
  const user = await findUserByPiUid(payment.user_uid);
  if (!user) {
    console.warn(`[payments] no local user for pi_uid ${payment.user_uid}, payment ${payment.identifier}`);
    return;
  }
  const sanctuaryId = sanctuaryIdOf(payment) || user.current_sanctuary_id || 1;
  const rawType = String(payment.metadata?.lamp_type || '');
  const lampType = LAMP_TYPES.has(rawType) ? rawType : 'guangming';
  const dedicateName = payment.metadata?.dedicate_name ? String(payment.metadata.dedicate_name).slice(0, 100) : null;
  const pool = getPool();

  await pool.execute(
    `INSERT INTO lamps (user_id, sanctuary_id, lamp_type, dedicate_name, amount, pi_payment_id, pi_txid, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 year')
     ON CONFLICT (pi_payment_id) DO NOTHING`,
    [user.id, sanctuaryId, lampType, dedicateName, payment.amount, payment.identifier, txid]
  );

  await pool.execute(
    `UPDATE pi_payments SET status = 'completed', txid = ?, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`,
    [txid, payment.identifier]
  );
}

/** Records a completed payment as whichever kind it is (a donation, unless metadata says otherwise). */
async function recordPayment(payment: PiPayment, txid: string | null): Promise<void> {
  if (kindOf(payment) === 'lamp') return recordLamp(payment, txid);
  return recordDonation(payment, txid);
}

function handleError(res: Response, where: string, err: any) {
  console.error(`[payments] ${where} failed:`, err?.message, err?.body || '');
  const status = err instanceof PiApiError && err.status >= 400 && err.status < 500 ? err.status : 500;
  fail(res, status, err?.message || `${where} failed`, err?.body);
}

/**
 * POST /api/payments/approve   { paymentId }
 */
router.post('/approve', optionalAuth, async (req: Request, res: Response) => {
  const paymentId = req.body?.paymentId;
  if (!paymentId) return fail(res, 400, 'paymentId is required');

  try {
    const payment = await PiPlatform.getPayment(paymentId);
    assertOwner(req, payment);

    if (!(payment.amount > 0)) return fail(res, 400, 'Invalid payment amount');
    if (kindOf(payment) === 'lamp' && payment.amount < LAMP_PRICE - 0.0001) {
      return fail(res, 400, `Lamp price is ${LAMP_PRICE} π`);
    }
    const sanctuaryId = sanctuaryIdOf(payment);
    if (!sanctuaryId) return fail(res, 400, 'Payment metadata is missing sanctuary_id');

    const [sanctuaries] = await getPool().execute(
      'SELECT id FROM sanctuaries WHERE id = ? AND is_active = TRUE',
      [sanctuaryId]
    );
    if ((sanctuaries as any[]).length === 0) return fail(res, 404, 'Sanctuary not found');

    const user = await findUserByPiUid(payment.user_uid);

    await getPool().execute(
      `INSERT INTO pi_payments (payment_id, pi_uid, user_id, sanctuary_id, amount, memo, status)
       VALUES (?, ?, ?, ?, ?, ?, 'approved')
       ON CONFLICT (payment_id) DO UPDATE SET status = 'approved', updated_at = CURRENT_TIMESTAMP`,
      [payment.identifier, payment.user_uid, user ? user.id : null, sanctuaryId, payment.amount, payment.memo || null]
    );

    if (!payment.status.developer_approved) {
      await PiPlatform.approvePayment(paymentId);
    }

    res.json({ success: true, data: { paymentId, approved: true } });
  } catch (err) {
    handleError(res, 'approve', err);
  }
});

/**
 * POST /api/payments/complete   { paymentId, txid }
 */
router.post('/complete', optionalAuth, async (req: Request, res: Response) => {
  const { paymentId, txid } = req.body || {};
  if (!paymentId || !txid) return fail(res, 400, 'paymentId and txid are required');

  try {
    let payment = await PiPlatform.getPayment(paymentId);
    assertOwner(req, payment);

    if (!payment.status.developer_completed) {
      payment = await PiPlatform.completePayment(paymentId, txid);
    }
    await recordPayment(payment, txid);

    res.json({ success: true, message: '感謝您的功德！', data: { paymentId, txid, amount: payment.amount } });
  } catch (err) {
    handleError(res, 'complete', err);
  }
});

/**
 * POST /api/payments/cancel   { paymentId }
 * Called when the user cancels in the Pi Wallet, or the SDK reports an error.
 */
router.post('/cancel', async (req: Request, res: Response) => {
  const paymentId = req.body?.paymentId;
  if (!paymentId) return fail(res, 400, 'paymentId is required');
  try {
    await getPool().execute(
      `UPDATE pi_payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ? AND status <> 'completed'`,
      [paymentId]
    );
    res.json({ success: true });
  } catch (err) {
    handleError(res, 'cancel', err);
  }
});

/**
 * POST /api/payments/incomplete   { paymentId }
 * The Pi SDK reports an unfinished payment during Pi.authenticate(). If the user
 * already paid on the blockchain (there is a txid) we finish it; otherwise we cancel
 * it on the Pi side so the user can make new payments.
 */
router.post('/incomplete', async (req: Request, res: Response) => {
  const paymentId = req.body?.paymentId;
  if (!paymentId) return fail(res, 400, 'paymentId is required');

  try {
    let payment = await PiPlatform.getPayment(paymentId);
    const txid = payment.transaction?.txid;

    if (txid) {
      if (!payment.status.developer_completed) {
        payment = await PiPlatform.completePayment(paymentId, txid);
      }
      await recordPayment(payment, txid);
      return res.json({ success: true, data: { paymentId, action: 'completed' } });
    }

    if (!payment.status.cancelled && !payment.status.user_cancelled) {
      await PiPlatform.cancelPayment(paymentId);
    }
    await getPool().execute(
      `UPDATE pi_payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`,
      [paymentId]
    );
    res.json({ success: true, data: { paymentId, action: 'cancelled' } });
  } catch (err) {
    handleError(res, 'incomplete', err);
  }
});

export default router;
