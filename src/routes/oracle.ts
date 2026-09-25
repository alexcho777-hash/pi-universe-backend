/**
 * Online oracle (線上求籤) — 六十甲子籤
 *
 * The ritual runs in the browser; the server only does what must be trusted:
 *  - draws the lot number (crypto random) and throws the confirming 筊 (驗筊)
 *  - enforces the free limit of 3 confirmed lots per person per day (their own time zone)
 *  - records the adult (20+) confirmation
 * The poem text lives in the frontend (src/oracle/liushiJiazi.ts); only the number is stored.
 *
 *  GET  /api/oracle/status
 *  POST /api/oracle/confirm-age
 *  POST /api/oracle/draw     { sanctuary_id? }         -> { draw_id, lot_no }
 *  POST /api/oracle/verify   { draw_id }               -> { throw: 'sheng'|'xiao'|'yin', confirmed }
 *  GET  /api/oracle/history
 */

import { Router, Request, Response } from 'express';
import { randomInt } from 'crypto';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';
import { tzOf, TODAY } from './merit';

const router = Router();

export const DAILY_LOTS = 3; // confirmed lots per day (free)
const DAILY_DRAWS = 30; // shakes per day, including lots not confirmed by the 筊
const LOT_COUNT = 60; // 六十甲子籤 1..60 (the 籤首 is not drawn)

type Throw = 'sheng' | 'xiao' | 'yin';

/** One throw of the moon blocks: 聖筊 1/2 (one up, one down), 笑筊 1/4, 陰筊 1/4 */
function throwBlocks(): Throw {
  const r = randomInt(4);
  return r < 2 ? 'sheng' : r === 2 ? 'xiao' : 'yin';
}

function fail(res: Response, status: number, error: string, code?: string) {
  res.status(status).json({ success: false, error, code });
}

async function todayCounts(userId: number, tz: string) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) FILTER (WHERE status = 'confirmed')::int AS lots,
            COUNT(*)::int AS draws
     FROM oracle_draws WHERE user_id = ? AND draw_date = ${TODAY(tz)}`,
    [userId]
  );
  return (rows as any[])[0] as { lots: number; draws: number };
}

async function isAdultConfirmed(userId: number): Promise<boolean> {
  const [rows] = await getPool().execute('SELECT adult_confirmed_at FROM users WHERE id = ?', [userId]);
  return !!(rows as any[])[0]?.adult_confirmed_at;
}

router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.userId);
    const tz = tzOf(req);
    const c = await todayCounts(userId, tz);
    const [today] = await getPool().execute(
      `SELECT lot_no, confirmed_at FROM oracle_draws
       WHERE user_id = ? AND draw_date = ${TODAY(tz)} AND status = 'confirmed' ORDER BY confirmed_at`,
      [userId]
    );
    res.json({
      success: true,
      data: {
        limit: DAILY_LOTS,
        used_today: c.lots,
        remaining: Math.max(0, DAILY_LOTS - c.lots),
        adult_confirmed: await isAdultConfirmed(userId),
        today: today,
      },
    });
  } catch (err) {
    console.error('[oracle] status failed:', err);
    fail(res, 500, '讀取求籤狀態失敗');
  }
});

router.post('/confirm-age', authMiddleware, async (req: Request, res: Response) => {
  try {
    await getPool().execute(
      'UPDATE users SET adult_confirmed_at = COALESCE(adult_confirmed_at, CURRENT_TIMESTAMP) WHERE id = ?',
      [req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[oracle] confirm-age failed:', err);
    fail(res, 500, '確認失敗');
  }
});

router.post('/draw', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.userId);
    const tz = tzOf(req);
    if (!(await isAdultConfirmed(userId))) return fail(res, 403, '請先確認已年滿 20 歲', 'AGE_REQUIRED');

    const c = await todayCounts(userId, tz);
    if (c.lots >= DAILY_LOTS) return fail(res, 429, `今天已求 ${DAILY_LOTS} 支籤，請明天再來`, 'DAILY_LIMIT');
    if (c.draws >= DAILY_DRAWS) return fail(res, 429, '今天搖籤次數已達上限，請明天再來', 'DRAW_LIMIT');

    const pool = getPool();
    let sanctuaryId: number | null = parseInt(String(req.body?.sanctuary_id ?? ''), 10);
    if (!Number.isFinite(sanctuaryId) || sanctuaryId <= 0) sanctuaryId = null;
    else {
      const [found] = await pool.execute('SELECT id FROM sanctuaries WHERE id = ?', [sanctuaryId]);
      if ((found as any[]).length === 0) sanctuaryId = null;
    }
    // Only one lot is in hand at a time
    await pool.execute(`UPDATE oracle_draws SET status = 'void' WHERE user_id = ? AND status = 'pending'`, [userId]);

    const lotNo = randomInt(1, LOT_COUNT + 1);
    const [ins] = await pool.execute(
      `INSERT INTO oracle_draws (user_id, sanctuary_id, lot_no, draw_date)
       VALUES (?, ?, ?, ${TODAY(tz)})`,
      [userId, sanctuaryId, lotNo]
    );
    res.json({ success: true, data: { draw_id: (ins as any).insertId, lot_no: lotNo } });
  } catch (err) {
    console.error('[oracle] draw failed:', err);
    fail(res, 500, '搖籤失敗');
  }
});

router.post('/verify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.userId);
    const drawId = parseInt(String(req.body?.draw_id ?? ''), 10);
    if (!Number.isFinite(drawId)) return fail(res, 400, 'draw_id is required');

    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT id, lot_no, status FROM oracle_draws WHERE id = ? AND user_id = ?`,
      [drawId, userId]
    );
    const draw = (rows as any[])[0];
    if (!draw) return fail(res, 404, '找不到這支籤');
    if (draw.status !== 'pending') return fail(res, 409, '這支籤已經驗過了，請重新搖籤', 'NOT_PENDING');

    const t = throwBlocks();
    const confirmed = t === 'sheng';
    await pool.execute(
      confirmed
        ? `UPDATE oracle_draws SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE oracle_draws SET status = 'void' WHERE id = ?`,
      [drawId]
    );
    const c = await todayCounts(userId, tzOf(req));
    res.json({
      success: true,
      data: { throw: t, confirmed, lot_no: draw.lot_no, remaining: Math.max(0, DAILY_LOTS - c.lots) },
    });
  } catch (err) {
    console.error('[oracle] verify failed:', err);
    fail(res, 500, '擲筊失敗');
  }
});

router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT d.lot_no, d.oracle, d.confirmed_at, s.name AS sanctuary_name
       FROM oracle_draws d LEFT JOIN sanctuaries s ON s.id = d.sanctuary_id
       WHERE d.user_id = ? AND d.status = 'confirmed'
       ORDER BY d.confirmed_at DESC LIMIT 30`,
      [req.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[oracle] history failed:', err);
    fail(res, 500, '讀取求籤紀錄失敗');
  }
});

export default router;
