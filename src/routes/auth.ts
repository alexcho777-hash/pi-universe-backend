import { Router, Request, Response } from 'express';
import { generateToken } from '../utils/auth';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { UserService } from '../services/UserService';
import { authMiddleware, sanctuaryIsolationMiddleware } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user with Pi Network
 * Body: { pi_uid, username, sanctuary_id, gender?, birthday? }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { pi_uid, username, sanctuary_id, gender, birthday } = req.body;

    // Validate input
    if (!pi_uid || !username || !sanctuary_id) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '缺少必需参数: pi_uid, username, sanctuary_id'
      );
      return;
    }

    // Username should be 2-50 characters
    if (username.length < 2 || username.length > 50) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.INVALID_INPUT,
        '用户名长度必须在2-50个字符之间'
      );
      return;
    }

    const { user, wallet } = await UserService.registerUser(
      pi_uid,
      username,
      sanctuary_id,
      gender,
      birthday
    );

    sendSuccessResponse(res, StatusCodes.CREATED, {
      user_id: user.user_id,
      username: user.username,
      sanctuary_id: user.sanctuary_id,
      level: user.level,
      pi_balance: wallet.balance,
      message: '注册成功！',
    });
  } catch (error: any) {
    if (error.message.includes('已在该社群注册')) {
      sendErrorResponse(
        res,
        StatusCodes.CONFLICT,
        ErrorCodes.USER_ALREADY_EXISTS,
        error.message
      );
    } else {
      sendErrorResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        error.message
      );
    }
  }
});

/**
 * POST /api/auth/login
 * Login user with Pi Network signature
 * Body: { pi_uid, pi_sig, sanctuary_id }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { pi_uid, pi_sig, sanctuary_id } = req.body;

    // Validate input
    if (!pi_uid || !pi_sig || !sanctuary_id) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '缺少必需参数: pi_uid, pi_sig, sanctuary_id'
      );
      return;
    }

    const user = await UserService.loginUser(pi_uid, pi_sig, sanctuary_id);

    // Generate JWT token
    const token = generateToken({
      user_id: user.user_id,
      sanctuary_id: user.sanctuary_id,
      pi_uid: user.pi_uid,
    });

    sendSuccessResponse(res, StatusCodes.OK, {
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        level: user.level,
        pi_uid: user.pi_uid,
      },
    });
  } catch (error: any) {
    if (error.code === 'PI_NOT_REGISTERED') {
      // User exists but needs to register - return special error
      sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        'PI_NOT_REGISTERED',
        'π账户未注册，请先注册',
        {
          register_url: '/api/auth/register',
        }
      );
    } else if (error.message.includes('验证失败')) {
      sendErrorResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        ErrorCodes.INVALID_CREDENTIALS,
        error.message
      );
    } else if (error.message.includes('已被禁用')) {
      sendErrorResponse(
        res,
        StatusCodes.FORBIDDEN,
        ErrorCodes.FORBIDDEN,
        error.message
      );
    } else {
      sendErrorResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        error.message
      );
    }
  }
});

/**
 * GET /api/users/:user_id
 * Get user profile
 */
router.get('/users/:user_id', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);

    const user = await UserService.getUserProfile(user_id, sanctuaryId);

    sendSuccessResponse(res, StatusCodes.OK, {
      user_id: user.user_id,
      username: user.username,
      level: user.level,
      pi_balance: 0, // Will be fetched from wallet separately
      total_earned: user.total_earned,
      total_spent: user.total_spent,
      practice_hours: user.practice_hours,
      referral_count: user.referral_count,
      avatar_url: user.avatar_url,
      joined_at: user.created_at,
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.NOT_FOUND,
      ErrorCodes.USER_NOT_FOUND,
      error.message
    );
  }
});

/**
 * PATCH /api/users/:user_id
 * Update user profile
 */
router.patch('/users/:user_id', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const { avatar_url, display_name } = req.body;

    // Ensure user can only update their own profile
    if (req.user?.user_id !== user_id) {
      sendErrorResponse(
        res,
        StatusCodes.FORBIDDEN,
        ErrorCodes.FORBIDDEN,
        '无法修改他人的信息'
      );
      return;
    }

    const updates: any = {};
    if (avatar_url) updates.avatar_url = avatar_url;
    if (display_name) updates.username = display_name;

    const user = await UserService.updateUserProfile(user_id, sanctuaryId, updates);

    sendSuccessResponse(res, StatusCodes.OK, {
      user_id: user.user_id,
      username: user.username,
      level: user.level,
      total_earned: user.total_earned,
      total_spent: user.total_spent,
      practice_hours: user.practice_hours,
      referral_count: user.referral_count,
      avatar_url: user.avatar_url,
      joined_at: user.created_at,
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
