/**
 * Ancestor memorial-day reminders (忌日提醒) for the home altar (我的家中神桌).
 * Only a name, calendar type (lunar/solar) and month/day are stored; the app computes
 * the next occurrence and the countdown on the device.
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';

const router = Router();

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function idParam(req: Request): number | null {
  const id = parseInt(String(req.params.id), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.use(authMiddleware);

/**
 * GET /api/memorials
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT id, name, calendar_type, month, day, note FROM memorials WHERE user_id = ? ORDER BY id',
      [req.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[memorials] list failed:', err);
    fail(res, 500, '讀取忌日提醒失敗');
  }
});

/**
 * POST /api/memorials   { name, calendar_type, month, day, note? }
 */
router.post('/', async (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const calendarType = req.body?.calendar_type === 'solar' ? 'solar' : 'lunar';
  const month = parseInt(req.body?.month, 10);
  const day = parseInt(req.body?.day, 10);
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 200) : null;
  if (!name) return fail(res, 400, '請輸入姓名或稱呼');
  if (!Number.isFinite(month) || month < 1 || month > 12) return fail(res, 400, '月份不正確');
  if (!Number.isFinite(day) || day < 1 || day > 30) return fail(res, 400, '日期不正確');
  try {
    const [inserted] = await getPool().execute(
      `INSERT INTO memorials (user_id, name, calendar_type, month, day, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, name, calendarType, month, day, note]
    );
    const [rows] = await getPool().execute(
      'SELECT id, name, calendar_type, month, day, note FROM memorials WHERE id = ?',
      [(inserted as any).insertId]
    );
    res.status(201).json({ success: true, data: (rows as any[])[0] });
  } catch (err) {
    console.error('[memorials] create failed:', err);
    fail(res, 500, '新增失敗');
  }
});

/**
 * DELETE /api/memorials/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const id = idParam(req);
  if (!id) return fail(res, 400, 'Invalid id');
  try {
    const [result] = await getPool().execute('DELETE FROM memorials WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (((result as any)?.affectedRows || 0) === 0) return fail(res, 404, '找不到這筆資料');
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[memorials] delete failed:', err);
    fail(res, 500, '刪除失敗');
  }
});

export default router;
