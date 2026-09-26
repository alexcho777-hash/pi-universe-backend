/**
 * Online lamp lighting (線上點燈): 光明燈 / 太歲燈 / 文昌燈.
 * Lighting a lamp is a Pi payment handled by routes/payments.ts (metadata.kind = 'lamp');
 * this file only lists lamps. A lamp lights for 1 year, then it is no longer "active"
 * (rows are kept for history, never deleted).
 *
 *   GET /api/lamps/sanctuary/:id   how many lamps of each kind are currently lit (public)
 *   GET /api/lamps/mine            the caller's own lamps, with days remaining
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';

const router = Router();

export const LAMP_PRICE = 3.14;
export const LAMP_TYPES = ['guangming', 'taisui', 'wenchang'] as const;

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function idParam(req: Request): number | null {
  const id = parseInt(String(req.params.id), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * GET /api/lamps/sanctuary/:id
 */
router.get('/sanctuary/:id', async (req: Request, res: Response) => {
  const sanctuaryId = idParam(req);
  if (!sanctuaryId) return fail(res, 400, 'Invalid sanctuary id');
  try {
    const [rows] = await getPool().execute(
      `SELECT lamp_type, COUNT(*)::int AS n
       FROM lamps WHERE sanctuary_id = ? AND expires_at > CURRENT_TIMESTAMP
       GROUP BY lamp_type`,
      [sanctuaryId]
    );
    const counts: Record<string, number> = { guangming: 0, taisui: 0, wenchang: 0 };
    for (const r of rows as any[]) counts[r.lamp_type] = r.n;
    res.json({ success: true, data: { counts, price: LAMP_PRICE } });
  } catch (err) {
    console.error('[lamps] sanctuary list failed:', err);
    fail(res, 500, '讀取點燈資料失敗');
  }
});

/**
 * GET /api/lamps/mine
 */
router.get('/mine', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT l.id, l.lamp_type, l.dedicate_name, l.amount::float AS amount, l.lit_at, l.expires_at,
              s.id AS sanctuary_id, s.name AS sanctuary_name, s.icon AS sanctuary_icon
       FROM lamps l JOIN sanctuaries s ON s.id = l.sanctuary_id
       WHERE l.user_id = ?
       ORDER BY l.expires_at DESC`,
      [req.userId]
    );
    const now = Date.now();
    const data = (rows as any[]).map((r) => ({
      ...r,
      active: new Date(r.expires_at).getTime() > now,
      days_left: Math.max(0, Math.ceil((new Date(r.expires_at).getTime() - now) / 86400000)),
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[lamps] mine failed:', err);
    fail(res, 500, '讀取我的點燈失敗');
  }
});

export default router;
