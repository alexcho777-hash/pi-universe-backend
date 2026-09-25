/**
 * Merit Book (功德簿) & Visitor Statistics (參訪統計)
 *
 *  POST /api/merit/visit/:id        record today's visit (once per person per day) -> "you are visitor #N today"
 *  GET  /api/merit/overview         every sanctuary: donation totals + visitors today / this month / all time
 *  GET  /api/merit/sanctuary/:id    one sanctuary: totals, monthly top 10, all-time top 50, latest 20
 *  GET  /api/merit/me               the caller's own donations and rank (private)
 *
 * "Today" and "this month" follow each visitor's own time zone (sent by the browser in the
 * X-Timezone header, e.g. "America/New_York"); Taiwan time is used when it is missing.
 * Anonymous donations are listed as 隱名善信 (the name is never sent to the browser).
 * Christian and Islamic sanctuaries show totals only, with no individual ranking.
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware, optionalAuth } from '../middleware/auth';

const router = Router();

const DEFAULT_TZ = 'Asia/Taipei';

/** The caller's IANA time zone, validated (it is inserted into SQL, so only known zone names pass). */
function tzOf(req: Request): string {
  const raw = String(req.get('x-timezone') || req.query.tz || '').trim();
  if (!raw || raw.length > 64 || !/^[A-Za-z0-9_+\-\/]+$/.test(raw)) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_TZ;
  }
}

const TODAY = (tz: string) => `(CURRENT_TIMESTAMP AT TIME ZONE '${tz}')::date`;
const MONTH_START = (tz: string) => `date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE '${tz}')::date`;
/** A TIMESTAMP column (stored in the server's time zone) converted to the caller's local date */
const localDate = (col: string, tz: string) => `(${col} AT TIME ZONE current_setting('TimeZone') AT TIME ZONE '${tz}')::date`;

const NO_RANKING = new Set(['christian', 'islamic']);
export const ANONYMOUS_NAME = '隱名善信';

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function idParam(req: Request): number | null {
  const id = parseInt(String(req.params.id), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function findSanctuary(id: number): Promise<any | null> {
  const [rows] = await getPool().execute(
    'SELECT id, name, icon, color, religion_type, description FROM sanctuaries WHERE id = ? AND is_active = TRUE',
    [id]
  );
  return (rows as any[])[0] || null;
}

async function visitCounts(sanctuaryId: number, tz: string) {
  const [rows] = await getPool().execute(
    `SELECT
       COUNT(*) FILTER (WHERE ${localDate('created_at', tz)} = ${TODAY(tz)})::int AS today,
       COUNT(*) FILTER (WHERE ${localDate('created_at', tz)} >= ${MONTH_START(tz)})::int AS month,
       COUNT(*)::int AS total
     FROM sanctuary_daily_visits WHERE sanctuary_id = ?`,
    [sanctuaryId]
  );
  return (rows as any[])[0] || { today: 0, month: 0, total: 0 };
}

async function donationTotals(sanctuaryId: number, tz: string) {
  const [rows] = await getPool().execute(
    `SELECT
       COALESCE(SUM(amount), 0)::float AS total_amount,
       COUNT(*)::int AS donation_count,
       COUNT(DISTINCT user_id)::int AS donor_count,
       COALESCE(SUM(amount) FILTER (WHERE ${localDate('created_at', tz)} >= ${MONTH_START(tz)}), 0)::float AS month_amount
     FROM donations WHERE sanctuary_id = ?`,
    [sanctuaryId]
  );
  return (rows as any[])[0];
}

/** Ranking rows: named gifts grouped per person; anonymous gifts shown as 隱名善信. */
async function ranking(sanctuaryId: number, monthOnly: boolean, limit: number, meId: number | null, tz: string) {
  const [rows] = await getPool().execute(
    `SELECT d.user_id, d.is_anonymous, u.username,
            SUM(d.amount)::float AS total, COUNT(*)::int AS times, MAX(d.created_at) AS last_at
     FROM donations d JOIN users u ON u.id = d.user_id
     WHERE d.sanctuary_id = ? ${monthOnly ? `AND ${localDate('d.created_at', tz)} >= ${MONTH_START(tz)}` : ''}
     GROUP BY d.user_id, d.is_anonymous, u.username
     ORDER BY total DESC, last_at ASC
     LIMIT ${limit}`,
    [sanctuaryId]
  );
  return (rows as any[]).map((r, i) => ({
    rank: i + 1,
    name: r.is_anonymous ? ANONYMOUS_NAME : r.username,
    anonymous: !!r.is_anonymous,
    total: r.total,
    times: r.times,
    is_me: meId !== null && r.user_id === meId,
  }));
}

async function recent(sanctuaryId: number, meId: number | null) {
  const [rows] = await getPool().execute(
    `SELECT d.user_id, d.is_anonymous, u.username, d.amount::float AS amount, d.created_at
     FROM donations d JOIN users u ON u.id = d.user_id
     WHERE d.sanctuary_id = ?
     ORDER BY d.created_at DESC LIMIT 20`,
    [sanctuaryId]
  );
  return (rows as any[]).map((r) => ({
    name: r.is_anonymous ? ANONYMOUS_NAME : r.username,
    anonymous: !!r.is_anonymous,
    amount: r.amount,
    at: r.created_at,
    is_me: meId !== null && r.user_id === meId,
  }));
}

/**
 * POST /api/merit/visit/:id
 */
router.post('/visit/:id', authMiddleware, async (req: Request, res: Response) => {
  const sanctuaryId = idParam(req);
  if (!sanctuaryId) return fail(res, 400, 'Invalid sanctuary id');
  try {
    const sanctuary = await findSanctuary(sanctuaryId);
    if (!sanctuary) return fail(res, 404, '聖地不存在');
    const pool = getPool();
    const tz = tzOf(req);

    const [inserted] = await pool.execute(
      `INSERT INTO sanctuary_daily_visits (sanctuary_id, user_id, visit_date)
       VALUES (?, ?, ${TODAY(tz)})
       ON CONFLICT (sanctuary_id, user_id, visit_date) DO NOTHING`,
      [sanctuaryId, req.userId]
    );
    const firstToday = ((inserted as any)?.affectedRows || 0) > 0;

    // My place in today's order of arrival
    const [order] = await pool.execute(
      `SELECT COUNT(*)::int AS n FROM sanctuary_daily_visits
       WHERE sanctuary_id = ? AND ${localDate('created_at', tz)} = ${TODAY(tz)}
         AND id <= (SELECT id FROM sanctuary_daily_visits
                    WHERE sanctuary_id = ? AND user_id = ? AND visit_date = ${TODAY(tz)})`,
      [sanctuaryId, sanctuaryId, req.userId]
    );

    res.json({
      success: true,
      data: {
        sanctuary,
        visitor_number: (order as any[])[0].n,
        first_visit_today: firstToday,
        visits: await visitCounts(sanctuaryId, tz),
      },
    });
  } catch (err) {
    console.error('[merit] visit failed:', err);
    fail(res, 500, '參訪記錄失敗');
  }
});

/**
 * GET /api/merit/overview
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const tz = tzOf(req);
    const [rows] = await getPool().execute(
      `SELECT s.id, s.name, s.icon, s.color, s.religion_type,
         COALESCE(d.total_amount, 0)::float AS total_amount,
         COALESCE(d.donor_count, 0)::int AS donor_count,
         COALESCE(d.month_amount, 0)::float AS month_amount,
         COALESCE(v.today, 0)::int AS visits_today,
         COALESCE(v.month, 0)::int AS visits_month,
         COALESCE(v.total, 0)::int AS visits_total
       FROM sanctuaries s
       LEFT JOIN (
         SELECT sanctuary_id, SUM(amount) AS total_amount, COUNT(DISTINCT user_id) AS donor_count,
                SUM(amount) FILTER (WHERE ${localDate('created_at', tz)} >= ${MONTH_START(tz)}) AS month_amount
         FROM donations GROUP BY sanctuary_id
       ) d ON d.sanctuary_id = s.id
       LEFT JOIN (
         SELECT sanctuary_id,
                COUNT(*) FILTER (WHERE ${localDate('created_at', tz)} = ${TODAY(tz)}) AS today,
                COUNT(*) FILTER (WHERE ${localDate('created_at', tz)} >= ${MONTH_START(tz)}) AS month,
                COUNT(*) AS total
         FROM sanctuary_daily_visits GROUP BY sanctuary_id
       ) v ON v.sanctuary_id = s.id
       WHERE s.is_active = TRUE
       ORDER BY s.id`
    );
    res.json({
      success: true,
      data: (rows as any[]).map((r) => ({ ...r, ranking_enabled: !NO_RANKING.has(r.religion_type) })),
    });
  } catch (err) {
    console.error('[merit] overview failed:', err);
    fail(res, 500, '讀取功德簿失敗');
  }
});

/**
 * GET /api/merit/sanctuary/:id
 */
router.get('/sanctuary/:id', optionalAuth, async (req: Request, res: Response) => {
  const sanctuaryId = idParam(req);
  if (!sanctuaryId) return fail(res, 400, 'Invalid sanctuary id');
  try {
    const sanctuary = await findSanctuary(sanctuaryId);
    if (!sanctuary) return fail(res, 404, '聖地不存在');
    const meId = req.userId ? Number(req.userId) : null;
    const rankingEnabled = !NO_RANKING.has(sanctuary.religion_type);
    const tz = tzOf(req);

    res.json({
      success: true,
      data: {
        sanctuary,
        ranking_enabled: rankingEnabled,
        totals: await donationTotals(sanctuaryId, tz),
        visits: await visitCounts(sanctuaryId, tz),
        monthly_top: rankingEnabled ? await ranking(sanctuaryId, true, 10, meId, tz) : [],
        all_time_top: rankingEnabled ? await ranking(sanctuaryId, false, 50, meId, tz) : [],
        recent: rankingEnabled ? await recent(sanctuaryId, meId) : [],
      },
    });
  } catch (err) {
    console.error('[merit] sanctuary failed:', err);
    fail(res, 500, '讀取功德簿失敗');
  }
});

/**
 * GET /api/merit/me — only the caller can see this (includes their anonymous gifts)
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [perSanctuary] = await pool.execute(
      `WITH totals AS (
         SELECT sanctuary_id, user_id, SUM(amount) AS total, COUNT(*) AS times
         FROM donations GROUP BY sanctuary_id, user_id
       )
       SELECT s.id AS sanctuary_id, s.name, s.icon, s.religion_type,
              t.total::float AS total, t.times::int AS times,
              (SELECT COUNT(*) FROM totals o WHERE o.sanctuary_id = t.sanctuary_id AND o.total > t.total)::int + 1 AS rank
       FROM totals t JOIN sanctuaries s ON s.id = t.sanctuary_id
       WHERE t.user_id = ?
       ORDER BY t.total DESC`,
      [req.userId]
    );
    const [history] = await pool.execute(
      `SELECT d.id, d.sanctuary_id, s.name, s.icon, d.amount::float AS amount, d.is_anonymous, d.created_at
       FROM donations d JOIN sanctuaries s ON s.id = d.sanctuary_id
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC LIMIT 100`,
      [req.userId]
    );
    const [visits] = await pool.execute(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT sanctuary_id)::int AS sanctuaries
       FROM sanctuary_daily_visits WHERE user_id = ?`,
      [req.userId]
    );

    res.json({
      success: true,
      data: {
        sanctuaries: (perSanctuary as any[]).map((r) => ({
          ...r,
          rank: NO_RANKING.has(r.religion_type) ? null : r.rank,
        })),
        history,
        visits: (visits as any[])[0],
      },
    });
  } catch (err) {
    console.error('[merit] me failed:', err);
    fail(res, 500, '讀取個人功德失敗');
  }
});

export default router;
