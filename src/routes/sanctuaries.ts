/**
 * Sanctuaries Routes
 * Handle multi-religion sanctuary operations
 */

import express, { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as initDB from '../db/initialize';
import { sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';

const router = Router();

/**
 * GET /api/sanctuaries
 * Get all available sanctuaries
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sanctuaries = await initDB.getSanctuaries();
    res.json({
      success: true,
      data: sanctuaries,
      count: sanctuaries.length,
    });
  } catch (error) {
    console.error('Error fetching sanctuaries:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取聖地列表失敗'
    );
  }
});

/**
 * GET /api/sanctuaries/:id
 * Get specific sanctuary details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.params.id);
    const sanctuary = await initDB.getSanctuaryById(sanctuaryId);

    if (!sanctuary) {
      return sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        '聖地不存在'
      );
    }

    // Get zones for this sanctuary
    const zones = await initDB.getSanctuaryZones(sanctuaryId);

    res.json({
      success: true,
      data: {
        ...sanctuary,
        zones,
      },
    });
  } catch (error) {
    console.error('Error fetching sanctuary:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取聖地詳情失敗'
    );
  }
});

/**
 * GET /api/sanctuaries/:id/zones
 * Get zones for a sanctuary
 */
router.get('/:id/zones', async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.params.id);
    const zones = await initDB.getSanctuaryZones(sanctuaryId);

    res.json({
      success: true,
      data: zones,
      count: zones.length,
    });
  } catch (error) {
    console.error('Error fetching zones:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取區域列表失敗'
    );
  }
});

/**
 * GET /api/sanctuaries/user/sanctuaries
 * Get all sanctuaries the user has joined
 * Requires authentication
 */
router.get('/user/sanctuaries', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userSanctuaries = await initDB.getUserSanctuaries(userId);

    res.json({
      success: true,
      data: userSanctuaries,
      count: userSanctuaries.length,
    });
  } catch (error) {
    console.error('Error fetching user sanctuaries:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '獲取用戶聖地列表失敗'
    );
  }
});

/**
 * POST /api/sanctuaries/:id/join
 * Join a sanctuary
 * Requires authentication
 */
router.post('/:id/join', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const sanctuaryId = parseInt(req.params.id);

    // Verify sanctuary exists
    const sanctuary = await initDB.getSanctuaryById(sanctuaryId);
    if (!sanctuary) {
      return sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        '聖地不存在'
      );
    }

    // Create user sanctuary membership
    const success = await initDB.createUserSanctuary(userId, sanctuaryId);

    if (!success) {
      return sendErrorResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        '加入聖地失敗'
      );
    }

    res.json({
      success: true,
      message: `已加入 ${sanctuary.name}`,
      data: {
        sanctuary_id: sanctuaryId,
        sanctuary_name: sanctuary.name,
      },
    });
  } catch (error) {
    console.error('Error joining sanctuary:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '加入聖地失敗'
    );
  }
});

/**
 * POST /api/sanctuaries/:id/set-primary
 * Set as primary sanctuary
 * Requires authentication
 */
router.post('/:id/set-primary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const sanctuaryId = parseInt(req.params.id);

    // Verify sanctuary exists
    const sanctuary = await initDB.getSanctuaryById(sanctuaryId);
    if (!sanctuary) {
      return sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        '聖地不存在'
      );
    }

    // Set as primary
    const success = await initDB.setUserPrimarySanctuary(userId, sanctuaryId);

    if (!success) {
      return sendErrorResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        '設置主聖地失敗'
      );
    }

    res.json({
      success: true,
      message: `已設置 ${sanctuary.name} 為主聖地`,
      data: {
        primary_sanctuary_id: sanctuaryId,
        sanctuary_name: sanctuary.name,
      },
    });
  } catch (error) {
    console.error('Error setting primary sanctuary:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      '設置主聖地失敗'
    );
  }
});

export default router;
