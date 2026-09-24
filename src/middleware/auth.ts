import { Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader, verifyToken } from '../utils/auth';
import { getPool } from '../db/connection';
import { RequestUser } from '../types';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      userId?: number;
    }
  }
}

/**
 * Middleware to authenticate a request.
 *
 * Supports two schemes:
 *  1. Pi Network web auth (preferred): an `X-Pi-UID` header, set by the web
 *     frontend after Pi.authenticate() + /api/users/sync. Looked up against
 *     the `users` table and sets both req.userId (numeric id) and req.user.
 *  2. Legacy JWT bearer token (`Authorization: Bearer <token>`), kept for
 *     backward compatibility with any older client.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const piUid = req.headers['x-pi-uid'] as string | undefined;

    if (piUid) {
      const pool = getPool();
      const [rows] = await pool.execute(
        'SELECT id, current_sanctuary_id, pi_uid FROM users WHERE pi_uid = ?',
        [piUid]
      );
      const users = rows as any[];

      if (users.length === 0) {
        res.status(401).json({
          success: false,
          error: 'Pi 用户尚未同步，请先呼叫 /api/users/sync',
          error_code: 'PI_USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const dbUser = users[0];
      req.userId = dbUser.id;
      req.user = {
        user_id: String(dbUser.id),
        sanctuary_id: dbUser.current_sanctuary_id,
        pi_uid: dbUser.pi_uid,
      };

      next();
      return;
    }

    // Fallback: legacy JWT bearer token
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        error_code: 'MISSING_TOKEN',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const payload = verifyToken(token);

    req.user = {
      user_id: payload.user_id,
      sanctuary_id: payload.sanctuary_id,
      pi_uid: payload.pi_uid,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid token',
      error_code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Middleware to check sanctuary isolation
 * Ensures user can only access data from their own sanctuary
 */
export function sanctuaryIsolationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'User not authenticated',
      error_code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Get sanctuary_id from query parameter
  const querySanctuaryId = req.query.sanctuary_id ? parseInt(req.query.sanctuary_id as string) : null;

  // Get sanctuary_id from route parameter (e.g., /api/sanctuaries/:sanctuary_id)
  const paramSanctuaryId = req.params.sanctuary_id ? parseInt(req.params.sanctuary_id) : null;

  // Check if sanctuary_id is provided in query or params
  const requestedSanctuaryId = querySanctuaryId || paramSanctuaryId;

  // If no sanctuary_id is explicitly requested, use user's sanctuary (allowed)
  if (requestedSanctuaryId === null) {
    req.query.sanctuary_id = req.user.sanctuary_id.toString();
    next();
    return;
  }

  // Check if user is trying to access a different sanctuary
  if (requestedSanctuaryId !== req.user.sanctuary_id) {
    res.status(403).json({
      success: false,
      error: '禁止访问其他社群的数据',
      error_code: 'FORBIDDEN_CROSS_SANCTUARY',
      details: {
        your_sanctuary_id: req.user.sanctuary_id,
        requested_sanctuary_id: requestedSanctuaryId,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Ensure query.sanctuary_id is set for database queries
  if (!req.query.sanctuary_id) {
    req.query.sanctuary_id = req.user.sanctuary_id.toString();
  }

  next();
}

/**
 * Optional middleware to check specific permissions
 */
export function moderatorMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'User not authenticated',
      error_code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // TODO: Check if user is moderator from database
  // For now, just pass through - implement after user service is ready
  next();
}
