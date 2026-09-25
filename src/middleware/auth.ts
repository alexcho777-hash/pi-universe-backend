import { Request, Response, NextFunction } from 'express';
import { RequestUser } from '../types';
import { bearerToken, findSessionUser } from '../services/Sessions';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      userId?: number;
    }
  }
}

function unauthorized(res: Response, error: string, code: string) {
  res.status(401).json({ success: false, error, error_code: code, timestamp: new Date().toISOString() });
}

async function resolveUser(req: Request): Promise<boolean> {
  const token = bearerToken(req.headers.authorization);
  if (!token) return false;
  const user = await findSessionUser(token);
  if (!user) return false;
  req.userId = user.id;
  req.user = {
    user_id: String(user.id),
    sanctuary_id: user.current_sanctuary_id,
    pi_uid: user.pi_uid,
  };
  return true;
}

/**
 * Requires a valid session (`Authorization: Bearer <session token>`).
 * Sessions are only issued after the server verified the user with the Pi
 * Platform API (see routes/users.ts: /sync and /pi-signin), so a caller can no
 * longer act as someone else just by sending their Pi uid.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!bearerToken(req.headers.authorization)) {
      unauthorized(res, 'Please log in with Pi', 'MISSING_TOKEN');
      return;
    }
    if (!(await resolveUser(req))) {
      unauthorized(res, 'Session expired, please log in again', 'INVALID_TOKEN');
      return;
    }
    next();
  } catch (error: any) {
    console.error('Auth error:', error);
    unauthorized(res, 'Authentication failed', 'INVALID_TOKEN');
  }
}

/** Like authMiddleware, but lets anonymous requests through (req.user stays undefined). */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await resolveUser(req);
  } catch (error) {
    console.error('Optional auth error:', error);
  }
  next();
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
