/**
 * Acknowledgments Routes
 * Display contributors, donors, and thank you messages
 */

import express, { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';

const router = Router();

/**
 * GET /api/acknowledgments
 * Get all acknowledgment data
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get top donors by sanctuary
    const [donations] = await getPool().execute(
      `SELECT
        s.id, s.name, s.icon, s.religion_type,
        COALESCE(SUM(d.amount), 0) as total_donations,
        COUNT(DISTINCT d.user_id) as donor_count,
        COUNT(d.id) as donation_count
      FROM sanctuaries s
      LEFT JOIN donations d ON s.id = d.sanctuary_id
      WHERE s.is_active = TRUE
      GROUP BY s.id
      ORDER BY total_donations DESC`
    );

    // Get top individual donors (anonymous donations excluded)
    const [topDonors] = await getPool().execute(
      `SELECT
        u.username,
        COUNT(d.id) as donation_count,
        SUM(d.amount) as total_donated,
        MAX(d.created_at) as last_donation
      FROM donations d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_anonymous = FALSE
      GROUP BY d.user_id, u.username
      ORDER BY total_donated DESC
      LIMIT 10`
    );

    // Get active contributors (users with activities)
    const [activeUsers] = await getPool().execute(
      `SELECT
        u.username,
        COUNT(a.id) as activity_count,
        COUNT(DISTINCT a.sanctuary_id) as sanctuaries_visited,
        MAX(a.created_at) as last_activity
      FROM activities a
      JOIN users u ON a.user_id = u.id
      GROUP BY a.user_id, u.username
      ORDER BY activity_count DESC
      LIMIT 10`
    );

    // Get stats
    const [stats] = await getPool().execute(
      `SELECT
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT d.id) as total_donations,
        COALESCE(SUM(d.amount), 0) as total_donated_amount,
        COUNT(DISTINCT a.id) as total_activities,
        COUNT(DISTINCT us.user_id) as total_sanctuary_members
      FROM users u
      LEFT JOIN donations d ON u.id = d.user_id
      LEFT JOIN activities a ON u.id = a.user_id
      LEFT JOIN user_sanctuaries us ON u.id = us.user_id`
    );

    res.json({
      success: true,
      data: {
        sanctuaries: donations || [],
        topDonors: topDonors || [],
        activeContributors: activeUsers || [],
        stats: stats ? (stats as any[])[0] : {
          total_users: 0,
          total_donations: 0,
          total_donated_amount: 0,
          total_activities: 0,
          total_sanctuary_members: 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching acknowledgments:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取感謝頁面失敗'
    );
  }
});

/**
 * GET /api/acknowledgments/sanctuary/:id
 * Get sanctuary-specific acknowledgments
 */
router.get('/sanctuary/:id', async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.params.id);

    // Get sanctuary info
    const [sanctuary] = await getPool().execute(
      'SELECT * FROM sanctuaries WHERE id = ? AND is_active = TRUE',
      [sanctuaryId]
    );

    if (!sanctuary || (sanctuary as any[]).length === 0) {
      return sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        '聖地不存在'
      );
    }

    // Get top donors for this sanctuary
    const [topDonors] = await getPool().execute(
      `SELECT
        u.username,
        COUNT(d.id) as donation_count,
        SUM(d.amount) as total_donated,
        MAX(d.created_at) as last_donation
      FROM donations d
      JOIN users u ON d.user_id = u.id
      WHERE d.sanctuary_id = ? AND d.is_anonymous = FALSE
      GROUP BY d.user_id, u.username
      ORDER BY total_donated DESC
      LIMIT 10`,
      [sanctuaryId]
    );

    // Get statistics
    const [stats] = await getPool().execute(
      `SELECT
        COUNT(DISTINCT user_id) as total_donors,
        COUNT(d.id) as donation_count,
        COALESCE(SUM(d.amount), 0) as total_donations,
        COALESCE(AVG(d.amount), 0) as avg_donation
      FROM donations d
      WHERE d.sanctuary_id = ?`,
      [sanctuaryId]
    );

    res.json({
      success: true,
      data: {
        sanctuary: (sanctuary as any[])[0],
        topDonors: topDonors || [],
        stats: stats ? (stats as any[])[0] : {
          total_donors: 0,
          donation_count: 0,
          total_donations: 0,
          avg_donation: 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching sanctuary acknowledgments:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取聖地感謝信息失敗'
    );
  }
});

export default router;
