/**
 * Practice Routes — daily check-in and meditation log
 * Stored in the simple `activities` table (see schema.sql).
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getPool } from '../db/connection';

const router = Router();

async function sanctuaryFor(req: Request): Promise<number> {
  const fromBody = parseInt(String(req.body?.sanctuary_id ?? ''), 10);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const [rows] = await getPool().execute('SELECT current_sanctuary_id FROM users WHERE id = ?', [req.userId]);
  const list = rows as any[];
  return (list[0] && list[0].current_sanctuary_id) || 1;
}

/**
 * POST /api/practice/checkin — one check-in per user per day
 */
router.post('/checkin', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      `SELECT id FROM activities
       WHERE user_id = ? AND activity_type = 'check_in' AND created_at::date = CURRENT_DATE`,
      [req.userId]
    );
    if ((existing as any[]).length > 0) {
      return res.json({ success: true, data: { already: true }, message: '今天已經簽到過了' });
    }

    const sanctuaryId = await sanctuaryFor(req);
    await pool.execute(
      `INSERT INTO activities (sanctuary_id, user_id, activity_type, started_at)
       VALUES (?, ?, 'check_in', CURRENT_TIMESTAMP)`,
      [sanctuaryId, req.userId]
    );

    const [count] = await pool.execute(
      `SELECT COUNT(*)::int AS total FROM activities WHERE user_id = ? AND activity_type = 'check_in'`,
      [req.userId]
    );
    res.json({
      success: true,
      data: { already: false, total_checkins: (count as any[])[0].total },
      message: '簽到成功，願你今天平安喜樂',
    });
  } catch (err: any) {
    console.error('[practice] checkin failed:', err);
    res.status(500).json({ success: false, error: '簽到失敗' });
  }
});

/**
 * POST /api/practice/meditation  { duration_minutes }
 */
router.post('/meditation', authMiddleware, async (req: Request, res: Response) => {
  try {
    const minutes = Math.max(0, Math.min(600, parseInt(String(req.body?.duration_minutes ?? 0), 10) || 0));
    const sanctuaryId = await sanctuaryFor(req);
    await getPool().execute(
      `INSERT INTO activities (sanctuary_id, user_id, activity_type, duration_minutes, started_at, ended_at)
       VALUES (?, ?, 'meditation', ?, CURRENT_TIMESTAMP - make_interval(mins => ?), CURRENT_TIMESTAMP)`,
      [sanctuaryId, req.userId, minutes, minutes]
    );
    res.json({ success: true, data: { duration_minutes: minutes }, message: '已記錄本次靜坐' });
  } catch (err: any) {
    console.error('[practice] meditation failed:', err);
    res.status(500).json({ success: false, error: '記錄靜坐失敗' });
  }
});

/**
 * GET /api/practice/summary — the current user's totals
 */
router.get('/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT
         COUNT(*) FILTER (WHERE activity_type = 'check_in')::int AS checkins,
         COUNT(*) FILTER (WHERE activity_type = 'meditation')::int AS meditations,
         COALESCE(SUM(duration_minutes) FILTER (WHERE activity_type = 'meditation'), 0)::int AS meditation_minutes,
         BOOL_OR(activity_type = 'check_in' AND created_at::date = CURRENT_DATE) AS checked_in_today
       FROM activities WHERE user_id = ?`,
      [req.userId]
    );
    const [don] = await getPool().execute(
      `SELECT COUNT(*)::int AS donations, COALESCE(SUM(amount), 0)::float AS donated
       FROM donations WHERE user_id = ?`,
      [req.userId]
    );
    const r = (rows as any[])[0];
    const d = (don as any[])[0];
    res.json({
      success: true,
      data: {
        checkins: r.checkins,
        meditations: r.meditations,
        meditation_minutes: r.meditation_minutes,
        checked_in_today: !!r.checked_in_today,
        donations: d.donations,
        donated: d.donated,
      },
    });
  } catch (err: any) {
    console.error('[practice] summary failed:', err);
    res.status(500).json({ success: false, error: '讀取修行紀錄失敗' });
  }
});

export default router;
