import { Router, Request, Response } from 'express';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { authMiddleware, sanctuaryIsolationMiddleware } from '../middleware/auth';
import { PiCurrencyService } from '../services/PiCurrencyService';
import { UserService } from '../services/UserService';

const router = Router();

/**
 * GET /api/wallets/current
 * Get current user's wallet
 */
router.get('/current', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;

    const wallet = await PiCurrencyService.getUserWallet(userId, sanctuaryId);
    if (!wallet) {
      sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.WALLET_NOT_FOUND,
        '钱包不存在'
      );
      return;
    }

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const monthlyCapStatus = await PiCurrencyService.checkMonthlyRewardCap(userId, sanctuaryId, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      wallet_id: wallet.wallet_id,
      user_id: wallet.user_id,
      balance: wallet.balance,
      locked_balance: wallet.locked_balance,
      total_earned: wallet.total_earned,
      total_spent: wallet.total_spent,
      monthly_earned: monthlyCapStatus.earned,
      monthly_cap: monthlyCapStatus.limit,
      monthly_remaining: monthlyCapStatus.remaining,
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
 * GET /api/transactions
 * Get transaction history
 */
router.get('/transactions', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { transactions, total } = await PiCurrencyService.getTransactionHistory(userId, sanctuaryId, limit, offset);

    sendSuccessResponse(res, StatusCodes.OK, {
      transactions: transactions.map(tx => ({
        transaction_id: tx.transaction_id,
        type: tx.type,
        amount: tx.amount,
        source: tx.source,
        description: tx.description,
        created_at: tx.created_at,
      })),
      total_count: total,
      page: Math.floor(offset / limit) + 1,
      page_size: limit,
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
 * GET /api/wallets/stats
 * Get wallet statistics
 */
router.get('/stats', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const stats = await PiCurrencyService.getWalletStats(userId, sanctuaryId, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      current_balance: stats.current_balance,
      total_earned: stats.total_earned,
      total_spent: stats.total_spent,
      monthly_earned: stats.monthly_earned,
      monthly_remaining_cap: stats.monthly_remaining_cap,
      level: stats.level,
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
 * GET /api/wallets/monthly-cap
 * Check monthly reward cap
 */
router.get('/monthly-cap', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const yearMonth = new Date().toISOString().substring(0, 7);
    const capStatus = await PiCurrencyService.checkMonthlyRewardCap(userId, sanctuaryId, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      year_month: yearMonth,
      user_level: user.level,
      cap_limit: capStatus.limit,
      total_earned_this_month: capStatus.earned,
      remaining_cap: capStatus.remaining,
      reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
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
