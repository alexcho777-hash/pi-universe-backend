/**
 * Users Routes
 * Handles user profile, sync, and Pi Network integration
 */

import { Router, Request, Response } from 'express';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * POST /api/users/sync
 * Sync or create user from Pi Network authentication
 * Body: { pi_uid, username }
 *
 * This endpoint is called by the Web app after Pi.authenticate() succeeds
 * It creates or updates the user in the database with Pi UID
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { pi_uid, username } = req.body;

    if (!pi_uid || !username) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'Missing required fields: pi_uid, username'
      );
      return;
    }

    const pool = getPool();

    // Check if user already exists by pi_uid
    const [existingUsers] = await pool.execute(
      'SELECT id, username, pi_uid, current_sanctuary_id, created_at FROM users WHERE pi_uid = ?',
      [pi_uid]
    );

    const existingUserList = existingUsers as any[];

    if (existingUserList.length > 0) {
      // User already exists, return their data
      const user = existingUserList[0];
      return sendSuccessResponse(res, StatusCodes.OK, {
        user_id: user.id,
        pi_uid: user.pi_uid,
        username: user.username,
        sanctuary_id: user.current_sanctuary_id,
        created_at: user.created_at,
        message: 'User already exists',
      });
    }

    // Create new user
    // Generate a unique local username if it conflicts
    let localUsername = username;
    let usernameCounter = 1;

    while (true) {
      const [usernameCheck] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [localUsername]
      );

      if ((usernameCheck as any[]).length === 0) {
        break;
      }

      localUsername = `${username}_${usernameCounter}`;
      usernameCounter++;
    }

    // Default to first sanctuary (Buddhist)
    const [sanctuaries] = await pool.execute(
      'SELECT id FROM sanctuaries WHERE is_active = TRUE LIMIT 1'
    );

    const sanctuaryList = sanctuaries as any[];
    const defaultSanctuaryId = sanctuaryList.length > 0 ? sanctuaryList[0].id : 1;

    // Insert new user
    const [insertResult] = await pool.execute(
      `INSERT INTO users (username, pi_uid, current_sanctuary_id, email, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      [
        localUsername,
        pi_uid,
        defaultSanctuaryId,
        `${pi_uid}@pi-network.local`, // Placeholder email
        'pi-auth' // No password needed for Pi auth
      ]
    );

    const result = insertResult as any;
    const newUserId = result.insertId;

    // Add user to default sanctuary
    await pool.execute(
      `INSERT INTO user_sanctuaries (user_id, sanctuary_id, is_primary)
       VALUES (?, ?, true)
       ON CONFLICT (user_id, sanctuary_id) DO NOTHING`,
      [newUserId, defaultSanctuaryId]
    );

    sendSuccessResponse(res, StatusCodes.CREATED, {
      user_id: newUserId,
      pi_uid: pi_uid,
      username: localUsername,
      sanctuary_id: defaultSanctuaryId,
      created_at: new Date().toISOString(),
      message: 'User created successfully',
    });
  } catch (error: any) {
    console.error('User sync error:', error);
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message || 'Failed to sync user'
    );
  }
});

/**
 * GET /api/users/profile
 * Get current user profile (requires auth)
 */
router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by authMiddleware

    const pool = getPool();
    const [users] = await pool.execute(
      `SELECT id, username, pi_uid, current_sanctuary_id, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    const userList = users as any[];
    if (userList.length === 0) {
      sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'User not found'
      );
      return;
    }

    const user = userList[0];
    sendSuccessResponse(res, StatusCodes.OK, {
      user_id: user.id,
      username: user.username,
      pi_uid: user.pi_uid,
      sanctuary_id: user.current_sanctuary_id,
      created_at: user.created_at,
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
});

/**
 * POST /api/users/profile
 * Update user profile (requires auth)
 */
router.post('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { username, current_sanctuary_id } = req.body;

    const pool = getPool();

    // Check if username is taken (by someone else)
    if (username) {
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, userId]
      );

      if ((existingUsers as any[]).length > 0) {
        sendErrorResponse(
          res,
          StatusCodes.CONFLICT,
          ErrorCodes.USER_ALREADY_EXISTS,
          'Username already taken'
        );
        return;
      }
    }

    // Build update query
    const updates = [];
    const values = [];

    if (username) {
      updates.push('username = ?');
      values.push(username);
    }

    if (current_sanctuary_id) {
      updates.push('current_sanctuary_id = ?');
      values.push(current_sanctuary_id);
    }

    if (updates.length === 0) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'No fields to update'
      );
      return;
    }

    values.push(userId);

    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    sendSuccessResponse(res, StatusCodes.OK, {
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
});

export default router;
