import { Router, Request, Response } from 'express';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { authMiddleware, sanctuaryIsolationMiddleware } from '../middleware/auth';
import { ActivityService } from '../services/ActivityService';
import { PiCurrencyService } from '../services/PiCurrencyService';
import { UserService } from '../services/UserService';

const router = Router();

/**
 * POST /api/activities/daily-checkin
 * Daily bell-ringing check-in
 */
router.post('/daily-checkin', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const checkin = await PiCurrencyService.addDailyCheckInReward(userId, sanctuaryId, user.level);

    // Check for streak bonus
    const streakBonus = await PiCurrencyService.checkAndAwardStreakBonus(userId, sanctuaryId, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      transaction_id: checkin.transaction_id,
      reward: checkin.pi_reward,
      message: `打卡成功！获得 π${checkin.pi_reward}${streakBonus.bonusAwarded ? ` + π${streakBonus.bonusAmount} 连续打卡奖励` : ''}`,
      next_checkin_available_at: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error: any) {
    if (error.message.includes('今日已打卡')) {
      sendErrorResponse(
        res,
        StatusCodes.CONFLICT,
        ErrorCodes.VALIDATION_ERROR,
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
 * POST /api/activities/meditation/start
 * Start meditation session
 */
router.post('/meditation/start', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;
    const { location } = req.body;

    // For now, return session ID - actual session tracking would be more complex
    const sessionId = require('uuid').v4();

    sendSuccessResponse(res, StatusCodes.OK, {
      session_id: sessionId,
      start_time: new Date().toISOString(),
      location: location || '禅修堂',
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
 * POST /api/activities/meditation/:session_id/end
 * End meditation session and award rewards
 */
router.post('/meditation/:session_id/end', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;
    const { session_id } = req.params;
    const { duration_minutes, notes } = req.body;

    if (!duration_minutes) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '缺少必需参数: duration_minutes'
      );
      return;
    }

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const result = await PiCurrencyService.addMeditationReward(
      userId,
      sanctuaryId,
      duration_minutes,
      user.level,
      undefined,
      notes
    );

    const streakBonus = await PiCurrencyService.checkAndAwardStreakBonus(userId, sanctuaryId, user.level);
    const monthlyCapStatus = await PiCurrencyService.checkMonthlyRewardCap(userId, sanctuaryId, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      session_id,
      duration_minutes,
      pi_reward: result.reward,
      transaction_id: result.transaction.transaction_id,
      monthly_remaining: monthlyCapStatus.remaining,
      streak_status: {
        current_days: 0, // Would need to query streak table
        bonus_earned: streakBonus.bonusAwarded,
        bonus_amount: streakBonus.bonusAmount,
      },
    });
  } catch (error: any) {
    if (error.message.includes('至少')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.INVALID_INPUT,
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
 * GET /api/activities
 * Get activities list
 */
router.get('/', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const type = req.query.type as string;
    const status = req.query.status as string;
    const dateRange = req.query.date_range as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const { activities, total } = await ActivityService.getActivities(
      sanctuaryId,
      type,
      status,
      dateRange,
      limit,
      offset
    );

    sendSuccessResponse(res, StatusCodes.OK, {
      activities: activities.map(act => ({
        activity_id: act.activity_id,
        title: act.title,
        type: act.activity_type,
        scheduled_at: act.scheduled_at,
        location: act.location,
        reward_pi: act.reward_pi,
        current_participants: act.current_participants,
        max_participants: act.max_participants,
        status: act.status,
        organizer: act.organizer_user_id,
      })),
      total,
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
 * POST /api/activities/:activity_id/attend
 * Confirm attendance
 */
router.post('/:activity_id/attend', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const { activity_id } = req.params;
    const userId = req.user!.user_id;

    const attendance = await ActivityService.confirmAttendance(activity_id, userId, sanctuaryId);

    sendSuccessResponse(res, StatusCodes.OK, {
      attendance_id: attendance.attendance_id,
      activity_id,
      status: attendance.status,
      message: '您已确认参加活动',
    });
  } catch (error: any) {
    if (error.message.includes('已经确认参加')) {
      sendErrorResponse(
        res,
        StatusCodes.CONFLICT,
        ErrorCodes.VALIDATION_ERROR,
        error.message
      );
    } else if (error.message.includes('无法参加')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.ACTIVITY_FULL,
        error.message
      );
    } else if (error.message.includes('不存在')) {
      sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.ACTIVITY_NOT_FOUND,
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
 * POST /api/activities/:activity_id/complete
 * Complete activity and distribute rewards
 */
router.post('/:activity_id/complete', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const { activity_id } = req.params;
    const { active_participants } = req.body;

    if (!active_participants || !Array.isArray(active_participants)) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '缺少必需参数: active_participants (array)'
      );
      return;
    }

    const result = await ActivityService.completeActivity(activity_id, sanctuaryId, active_participants);

    sendSuccessResponse(res, StatusCodes.OK, {
      total_rewarded: result.totalRewarded,
      base_reward: result.baseReward,
      rewards_distributed: result.rewardsDistributed.map(r => ({
        user_id: r.userId,
        reward: r.reward,
        transaction_id: r.transactionId,
      })),
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
