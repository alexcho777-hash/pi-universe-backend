/**
 * Announcement board / message wall (公告欄與留言板), one board per religion.
 *
 *  GET    /api/board/:religionType         list posts (official pinned first, then messages)
 *  POST   /api/board/:religionType         post a visitor message (logged in, rate limited)
 *  POST   /api/board/:religionType/official  post an official announcement (needs the admin key)
 *  POST   /api/board/post/:id/report       report a message (auto-hidden after enough reports)
 *  DELETE /api/board/post/:id              delete your own message, or (with the admin key) any post
 *
 * Official posts are pinned and auto-expire (default 7 days, the poster can pick a
 * different number of days). Visitor messages are always kept for 7 days and then
 * deleted automatically. Both kinds of cleanup happen every time the board is read,
 * so there is no separate scheduled job to maintain.
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware, optionalAuth } from '../middleware/auth';

const router = Router();

const RELIGIONS = new Set(['buddhist', 'christian', 'catholic', 'islamic', 'shinto', 'hindu', 'taiwan_folk']);
const MESSAGE_MAX_LEN = 200;
const DAILY_MESSAGE_LIMIT = 5;
const REPORT_HIDE_THRESHOLD = 5;
const MESSAGE_LIFETIME_DAYS = 7;
const DEFAULT_OFFICIAL_DAYS = 7;

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function religionParam(req: Request): string | null {
  const r = String(req.params.religionType || '').trim();
  return RELIGIONS.has(r) ? r : null;
}

function idParam(req: Request): number | null {
  const id = parseInt(String(req.params.id), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Removes anything that has aged out: expired official posts, week-old messages, hidden posts. */
async function cleanup(religionType: string) {
  await getPool().execute(
    `DELETE FROM board_posts
     WHERE religion_type = ?
       AND (
         hidden = TRUE
         OR (is_official = TRUE AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP)
         OR (is_official = FALSE AND created_at < CURRENT_TIMESTAMP - INTERVAL '${MESSAGE_LIFETIME_DAYS} days')
       )`,
    [religionType]
  );
}

function adminKeyOk(req: Request): boolean {
  const key = process.env.BOARD_ADMIN_KEY;
  if (!key) return false;
  return String(req.get('x-admin-key') || '') === key;
}

/**
 * GET /api/board/:religionType
 */
router.get('/:religionType', optionalAuth, async (req: Request, res: Response) => {
  const religionType = religionParam(req);
  if (!religionType) return fail(res, 400, '不支援的宗教類型');
  try {
    await cleanup(religionType);
    const pool = getPool();
    const [official] = await pool.execute(
      `SELECT id, author_name, content, is_official, expires_at, created_at
       FROM board_posts WHERE religion_type = ? AND is_official = TRUE AND hidden = FALSE
       ORDER BY created_at DESC`,
      [religionType]
    );
    const [messages] = await pool.execute(
      `SELECT id, author_name, content, is_official, created_at, user_id
       FROM board_posts WHERE religion_type = ? AND is_official = FALSE AND hidden = FALSE
       ORDER BY created_at DESC LIMIT 100`,
      [religionType]
    );
    let postedToday = 0;
    if (req.userId) {
      const [rows] = await pool.execute(
        `SELECT COUNT(*)::int AS n FROM board_posts
         WHERE user_id = ? AND is_official = FALSE AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day'`,
        [req.userId]
      );
      postedToday = (rows as any[])[0]?.n || 0;
    }
    const meId = req.userId ? Number(req.userId) : null;
    res.json({
      success: true,
      data: {
        official,
        messages: (messages as any[]).map((m) => ({ ...m, is_mine: meId !== null && m.user_id === meId, user_id: undefined })),
        daily_limit: DAILY_MESSAGE_LIMIT,
        posted_today: postedToday,
        message_max_len: MESSAGE_MAX_LEN,
      },
    });
  } catch (err) {
    console.error('[board] list failed:', err);
    fail(res, 500, '讀取公告欄失敗');
  }
});

/**
 * POST /api/board/:religionType — a visitor message
 */
router.post('/:religionType', authMiddleware, async (req: Request, res: Response) => {
  const religionType = religionParam(req);
  if (!religionType) return fail(res, 400, '不支援的宗教類型');
  const content = String(req.body?.content || '').trim();
  if (!content) return fail(res, 400, '請輸入留言內容');
  if (content.length > MESSAGE_MAX_LEN) return fail(res, 400, `留言最多 ${MESSAGE_MAX_LEN} 個字`);
  try {
    const pool = getPool();
    const [countRows] = await pool.execute(
      `SELECT COUNT(*)::int AS n FROM board_posts
       WHERE user_id = ? AND is_official = FALSE AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day'`,
      [req.userId]
    );
    if (((countRows as any[])[0]?.n || 0) >= DAILY_MESSAGE_LIMIT) {
      return fail(res, 429, `今天留言已達上限（${DAILY_MESSAGE_LIMIT} 則），請明天再來`);
    }
    const [userRows] = await pool.execute('SELECT username FROM users WHERE id = ?', [req.userId]);
    const authorName = (userRows as any[])[0]?.username || '訪客';

    const [inserted] = await pool.execute(
      `INSERT INTO board_posts (religion_type, user_id, author_name, content, is_official)
       VALUES (?, ?, ?, ?, FALSE)`,
      [religionType, req.userId, authorName, content]
    );
    const [rows] = await pool.execute(
      'SELECT id, author_name, content, is_official, created_at FROM board_posts WHERE id = ?',
      [(inserted as any).insertId]
    );
    res.status(201).json({ success: true, data: { ...(rows as any[])[0], is_mine: true } });
  } catch (err) {
    console.error('[board] post message failed:', err);
    fail(res, 500, '留言發布失敗');
  }
});

/**
 * POST /api/board/:religionType/official — needs the X-Admin-Key header
 */
router.post('/:religionType/official', async (req: Request, res: Response) => {
  const religionType = religionParam(req);
  if (!religionType) return fail(res, 400, '不支援的宗教類型');
  if (!adminKeyOk(req)) return fail(res, 401, '管理員金鑰錯誤');
  const content = String(req.body?.content || '').trim();
  if (!content) return fail(res, 400, '請輸入公告內容');
  if (content.length > MESSAGE_MAX_LEN) return fail(res, 400, `公告最多 ${MESSAGE_MAX_LEN} 個字`);
  const days = Number.isFinite(Number(req.body?.days)) && Number(req.body?.days) > 0 ? Number(req.body.days) : DEFAULT_OFFICIAL_DAYS;
  try {
    const pool = getPool();
    const [inserted] = await pool.execute(
      `INSERT INTO board_posts (religion_type, author_name, content, is_official, expires_at)
       VALUES (?, '公告', ?, TRUE, CURRENT_TIMESTAMP + INTERVAL '${Math.min(days, 365)} days')`,
      [religionType, content]
    );
    const [rows] = await pool.execute(
      'SELECT id, author_name, content, is_official, expires_at, created_at FROM board_posts WHERE id = ?',
      [(inserted as any).insertId]
    );
    res.status(201).json({ success: true, data: (rows as any[])[0] });
  } catch (err) {
    console.error('[board] post official failed:', err);
    fail(res, 500, '公告發布失敗');
  }
});

/**
 * POST /api/board/post/:id/report
 */
router.post('/post/:id/report', optionalAuth, async (req: Request, res: Response) => {
  const id = idParam(req);
  if (!id) return fail(res, 400, 'Invalid post id');
  try {
    const pool = getPool();
    const [updated] = await pool.execute(
      `UPDATE board_posts SET report_count = report_count + 1,
              hidden = (report_count + 1 >= ${REPORT_HIDE_THRESHOLD})
       WHERE id = ?`,
      [id]
    );
    if (((updated as any)?.affectedRows || 0) === 0) return fail(res, 404, '找不到這則留言');
    res.json({ success: true, data: { reported: true } });
  } catch (err) {
    console.error('[board] report failed:', err);
    fail(res, 500, '檢舉失敗');
  }
});

/**
 * DELETE /api/board/post/:id — the author can delete their own message;
 * with the admin key, any post (official or not) can be removed.
 */
router.delete('/post/:id', optionalAuth, async (req: Request, res: Response) => {
  const id = idParam(req);
  if (!id) return fail(res, 400, 'Invalid post id');
  try {
    const pool = getPool();
    if (adminKeyOk(req)) {
      await pool.execute('DELETE FROM board_posts WHERE id = ?', [id]);
      return res.json({ success: true, data: { deleted: true } });
    }
    if (!req.userId) return fail(res, 401, '請先登入');
    const [result] = await pool.execute(
      'DELETE FROM board_posts WHERE id = ? AND user_id = ? AND is_official = FALSE',
      [id, req.userId]
    );
    if (((result as any)?.affectedRows || 0) === 0) return fail(res, 404, '找不到這則留言，或您無法刪除');
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[board] delete failed:', err);
    fail(res, 500, '刪除失敗');
  }
});

export default router;
