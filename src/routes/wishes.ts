/**
 * Four-Faced Buddha wishes (許願還願／Bon khấn nguyện).
 * Making a wish is free; fulfilling it ("還願") can optionally be paired with a paid
 * offering (花環／大象), which is a Pi payment handled by routes/payments.ts
 * (metadata.kind = 'vow') — this file only lists/creates wishes and lets a wish be
 * marked fulfilled directly (with no offering) when the caller prefers that.
 *
 *   GET    /api/wishes            the caller's own wishes
 *   POST   /api/wishes            create a wish { sanctuary_id, category, wish_text? }
 *   PATCH  /api/wishes/:id/fulfil mark a wish fulfilled without a paid offering { note? }
 *   DELETE /api/wishes/:id
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';

const router = Router();

export const WISH_CATEGORIES = ['career', 'love', 'wealth', 'health', 'study', 'other'] as const;
export const VOW_OFFERING_PRICES: Record<string, number> = { garland: 1, elephant: 3.14 };

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function idParam(req: Request): number | null {
  const id = parseInt(String(req.params.id), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.use(authMiddleware);

/**
 * GET /api/wishes
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT id, sanctuary_id, category, wish_text, status, fulfillment_note, fulfilled_at, created_at
       FROM wishes WHERE user_id = ? ORDER BY id DESC`,
      [req.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[wishes] list failed:', err);
    fail(res, 500, '讀取許願紀錄失敗');
  }
});

/**
 * POST /api/wishes   { sanctuary_id, category, wish_text? }
 */
router.post('/', async (req: Request, res: Response) => {
  const sanctuaryId = parseInt(req.body?.sanctuary_id, 10);
  const category = String(req.body?.category || '');
  const wishText = req.body?.wish_text ? String(req.body.wish_text).trim().slice(0, 200) : null;
  if (!Number.isFinite(sanctuaryId) || sanctuaryId <= 0) return fail(res, 400, 'Invalid sanctuary_id');
  if (!(WISH_CATEGORIES as readonly string[]).includes(category)) return fail(res, 400, '請選擇心願類別');
  try {
    const [inserted] = await getPool().execute(
      `INSERT INTO wishes (user_id, sanctuary_id, category, wish_text) VALUES (?, ?, ?, ?)`,
      [req.userId, sanctuaryId, category, wishText]
    );
    const [rows] = await getPool().execute(
      `SELECT id, sanctuary_id, category, wish_text, status, fulfillment_note, fulfilled_at, created_at
       FROM wishes WHERE id = ?`,
      [(inserted as any).insertId]
    );
    res.status(201).json({ success: true, data: (rows as any[])[0] });
  } catch (err) {
    console.error('[wishes] create failed:', err);
    fail(res, 500, '許願失敗');
  }
});

/**
 * PATCH /api/wishes/:id/fulfil   { note? }
 * Marks a wish fulfilled directly, with no paid offering attached.
 */
router.patch('/:id/fulfil', async (req: Request, res: Response) => {
  const id = idParam(req);
  if (!id) return fail(res, 400, 'Invalid id');
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 200) : null;
  try {
    const [result] = await getPool().execute(
      `UPDATE wishes SET status = 'fulfilled', fulfillment_note = ?, fulfilled_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'pending'`,
      [note, id, req.userId]
    );
    if (((result as any)?.affectedRows || 0) === 0) return fail(res, 404, '找不到這個心願，或已經還願過了');
    const [rows] = await getPool().execute(
      `SELECT id, sanctuary_id, category, wish_text, status, fulfillment_note, fulfilled_at, created_at
       FROM wishes WHERE id = ?`,
      [id]
    );
    res.json({ success: true, data: (rows as any[])[0] });
  } catch (err) {
    console.error('[wishes] fulfil failed:', err);
    fail(res, 500, '標記還願失敗');
  }
});

/**
 * DELETE /api/wishes/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const id = idParam(req);
  if (!id) return fail(res, 400, 'Invalid id');
  try {
    const [result] = await getPool().execute('DELETE FROM wishes WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (((result as any)?.affectedRows || 0) === 0) return fail(res, 404, '找不到這筆資料');
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[wishes] delete failed:', err);
    fail(res, 500, '刪除失敗');
  }
});

export default router;
