/**
 * Donations Routes
 * Handle merit/donation contributions to sanctuaries
 */

import express, { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getPool } from '../db/connection';
import { sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';

const router = Router();

/**
 * POST /api/donations
 * Create a new donation to a sanctuary
 * Requires authentication
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { sanctuary_id, amount, message = '', is_anonymous = false } = req.body;

    // Validate input
    if (!sanctuary_id || !amount) {
      return sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '聖地ID和捐獻金額為必填項'
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '捐獻金額必須大於零'
      );
    }

    // Verify sanctuary exists
    const [sanctuary] = await getPool().execute(
      'SELECT id FROM sanctuaries WHERE id = ? AND is_active = TRUE',
      [sanctuary_id]
    );

    if (!sanctuary || (sanctuary as any[]).length === 0) {
      return sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        '聖地不存在'
      );
    }

    // Create donation record
    const [result] = await getPool().execute(
      `INSERT INTO donations (user_id, sanctuary_id, amount, message, is_anonymous, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, sanctuary_id, amount, message || null, is_anonymous ? 1 : 0]
    );

    const insertResult = result as any;

    res.json({
      success: true,
      message: '感謝您的慈悲功德！',
      data: {
        donation_id: insertResult.insertId,
        sanctuary_id,
        amount,
        is_anonymous,
      },
    });
  } catch (error) {
    console.error('Error creating donation:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '建立捐獻記錄失敗'
    );
  }
});

/**
 * GET /api/donations/sanctuary/:id
 * Get donations for a specific sanctuary
 */
router.get('/sanctuary/:id', async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.params.id);

    const [donations] = await getPool().execute(
      `SELECT
        d.id,
        d.amount,
        d.message,
        d.created_at,
        CASE WHEN d.is_anonymous = TRUE THEN '隱名修行者' ELSE u.username END as donor_name
      FROM donations d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.sanctuary_id = ?
      ORDER BY d.created_at DESC
      LIMIT 50`,
      [sanctuaryId]
    );

    res.json({
      success: true,
      data: donations || [],
    });
  } catch (error) {
    console.error('Error fetching donations:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取捐獻列表失敗'
    );
  }
});

/**
 * GET /api/donations/user/history
 * Get donation history for current user
 * Requires authentication
 */
router.get('/user/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const [donations] = await getPool().execute(
      `SELECT
        d.id,
        d.amount,
        d.created_at,
        s.name as sanctuary_name,
        s.icon
      FROM donations d
      JOIN sanctuaries s ON d.sanctuary_id = s.id
      WHERE d.user_id = ?
      ORDER BY d.created_at DESC
      LIMIT 100`,
      [userId]
    );

    res.json({
      success: true,
      data: donations || [],
    });
  } catch (error) {
    console.error('Error fetching user donations:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取捐獻歷史失敗'
    );
  }
});

export default router;
