/**
 * Users Routes
 * Handles user profile, sync, and Pi Network integration
 */

import { Router, Request, Response } from 'express';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { getPool } from '../db/connection';
import { authMiddleware } from '../middleware/auth';
import { PiPlatform } from '../services/PiPlatform';
import { createSession, deleteSession, bearerToken } from '../services/Sessions';

const router = Router();

/**
 * Find the local user for a verified Pi identity, creating it on first login.
 */
async function findOrCreatePiUser(piUid: string, piUsername: string) {
  const pool = getPool();
  const [existing] = await pool.execute(
    'SELECT id, username, pi_uid, current_sanctuary_id, created_at FROM users WHERE pi_uid = ?',
    [piUid]
  );
  const list = existing as any[];
  if (list.length > 0) return { user: list[0], created: false };

  const base = piUsername || `pioneer_${piUid.slice(0, 8)}`;
  let localUsername = base;
  for (let i = 1; ; i++) {
    const [taken] = await pool.execute('SELECT id FROM users WHERE username = ?', [localUsername]);
    if ((taken as any[]).length === 0) break;
    localUsername = `${base}_${i}`;
  }
  const [sanctuaries] = await pool.execute('SELECT id FROM sanctuaries WHERE is_active = TRUE ORDER BY id LIMIT 1');
  const sanctuaryId = (sanctuaries as any[])[0]?.id || 1;

  const [ins] = await pool.execute(
    `INSERT INTO users (username, pi_uid, current_sanctuary_id, email, password_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [localUsername, piUid, sanctuaryId, `${piUid}@pi-network.local`, 'pi-auth']
  );
  const newId = (ins as any).insertId;
  await pool.execute(
    `INSERT INTO user_sanctuaries (user_id, sanctuary_id, is_primary) VALUES (?, ?, true)
     ON CONFLICT (user_id, sanctuary_id) DO NOTHING`,
    [newId, sanctuaryId]
  );
  return {
    user: { id: newId, username: localUsername, pi_uid: piUid, current_sanctuary_id: sanctuaryId, created_at: new Date().toISOString() },
    created: true,
  };
}

/**
 * Verify a Pi access token with the Pi Platform API, then log the user in:
 * returns the user plus a session token for `Authorization: Bearer <token>`.
 */
async function loginWithPiToken(accessToken: unknown, res: Response) {
  if (!accessToken || typeof accessToken !== 'string') {
    sendErrorResponse(res, StatusCodes.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR, 'Missing accessToken');
    return;
  }
  let me: { uid: string; username: string };
  try {
    me = await PiPlatform.me(accessToken);
  } catch {
    sendErrorResponse(res, StatusCodes.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, 'Pi login token is invalid or expired');
    return;
  }
  if (!me?.uid) {
    sendErrorResponse(res, StatusCodes.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, 'Pi login token is invalid');
    return;
  }
  const { user, created } = await findOrCreatePiUser(me.uid, me.username);
  const sessionToken = await createSession(user.id);
  sendSuccessResponse(res, created ? StatusCodes.CREATED : StatusCodes.OK, {
    user_id: user.id,
    pi_uid: user.pi_uid,
    username: user.username,
    sanctuary_id: user.current_sanctuary_id,
    created_at: user.created_at,
    session_token: sessionToken,
  });
}

/**
 * POST /api/users/sync   { accessToken }
 * Called by the web app after Pi.authenticate() in the Pi Browser.
 * The identity comes from Pi (GET /v2/me), never from the request body.
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    await loginWithPiToken(req.body?.accessToken, res);
  } catch (error: any) {
    console.error('User sync error:', error);
    sendErrorResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_ERROR, error.message || 'Failed to sync user');
  }
});

/**
 * POST /api/users/logout — ends the current session
 */
router.post('/logout', async (req: Request, res: Response) => {
  const token = bearerToken(req.headers.authorization);
  if (token) await deleteSession(token);
  sendSuccessResponse(res, StatusCodes.OK, { message: 'Logged out' });
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

/**
 * POST /api/users/pi-signin   { accessToken }
 * "Sign in with Pi" (OAuth implicit flow) for visitors in an ordinary browser.
 */
router.post('/pi-signin', async (req: Request, res: Response) => {
  try {
    await loginWithPiToken(req.body?.accessToken, res);
  } catch (error: any) {
    console.error('Pi sign-in error:', error);
    sendErrorResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_ERROR, error.message || 'Pi sign-in failed');
  }
});

export default router;
