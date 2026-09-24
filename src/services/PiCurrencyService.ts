import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeInsert, executeUpdate } from '../db/connection';
import {
  PiWallet,
  PiTransaction,
  MonthlyRewardCap,
  DailyCheckin,
  UserStreak,
  MeditationSession,
} from '../types';

/**
 * Reward configuration per activity type
 */
const REWARD_CONFIG = {
  daily_checkin: {
    base_reward: 2,
    unit: 'per_day',
    max_frequency: 1,
  },
  meditation: {
    reward_per_minute: 0.5,
    min_duration: 10,
    max_daily_minutes: 60,
  },
  lecture_attendance: {
    base_reward: 5,
    bonus_multiplier: 1.5,
  },
  volunteer: {
    reward_per_hour: 10,
    min_duration: 15,
  },
};

/**
 * Tier-based monthly π reward caps
 */
const TIER_CONFIG: { [key: number]: number } = {
  1: 100,
  2: 150,
  3: 250,
  4: 400,
  5: 600,
  6: 1000,
  7: 3000,
};

/**
 * Streak bonus configuration
 */
const STREAK_BONUSES = {
  7: 20,   // 7-day streak: π20
  14: 40,  // 14-day streak: π40
  30: 100, // 30-day streak: π100
};

export class PiCurrencyService {
  /**
   * Get user's current wallet
   */
  static async getUserWallet(userId: string, sanctuaryId: number): Promise<PiWallet | null> {
    const results = await executeQuery<PiWallet>(
      `SELECT * FROM pi_wallets
       WHERE user_id = ? AND sanctuary_id = ?`,
      [userId, sanctuaryId]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Create a new wallet for user
   */
  static async createWallet(userId: string, sanctuaryId: number): Promise<PiWallet> {
    const walletId = uuidv4();
    await executeInsert(
      `INSERT INTO pi_wallets (wallet_id, user_id, sanctuary_id, balance, locked_balance, total_earned, total_spent)
       VALUES (?, ?, ?, 0, 0, 0, 0)`,
      [walletId, userId, sanctuaryId]
    );

    const wallet = await this.getUserWallet(userId, sanctuaryId);
    if (!wallet) throw new Error('Failed to create wallet');
    return wallet;
  }

  /**
   * Check monthly reward cap for user
   */
  static async checkMonthlyRewardCap(
    userId: string,
    sanctuaryId: number,
    userLevel: number
  ): Promise<{ remaining: number; limit: number; earned: number }> {
    const yearMonth = new Date().toISOString().substring(0, 7);
    const cap = TIER_CONFIG[userLevel] || TIER_CONFIG[1];

    const results = await executeQuery<MonthlyRewardCap>(
      `SELECT * FROM monthly_reward_caps
       WHERE user_id = ? AND sanctuary_id = ? AND year_month = ?`,
      [userId, sanctuaryId, yearMonth]
    );

    if (results.length === 0) {
      // Create new monthly cap entry
      await executeInsert(
        `INSERT INTO monthly_reward_caps (cap_id, user_id, sanctuary_id, year_month, tier_level, total_earned, cap_limit)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [uuidv4(), userId, sanctuaryId, yearMonth, userLevel, cap]
      );
      return { remaining: cap, limit: cap, earned: 0 };
    }

    const monthlyData = results[0];
    return {
      remaining: cap - monthlyData.total_earned,
      limit: cap,
      earned: monthlyData.total_earned,
    };
  }

  /**
   * Add π reward to wallet (with cap enforcement)
   */
  static async addReward(
    userId: string,
    sanctuaryId: number,
    amount: number,
    source: string,
    userLevel: number,
    referenceId?: string
  ): Promise<PiTransaction> {
    // Check monthly cap
    const capStatus = await this.checkMonthlyRewardCap(userId, sanctuaryId, userLevel);
    if (capStatus.remaining <= 0) {
      throw new Error('已达到本月奖励上限');
    }

    const actualReward = Math.min(amount, capStatus.remaining);

    // Create transaction
    const transactionId = uuidv4();
    const wallet = await this.getUserWallet(userId, sanctuaryId);
    if (!wallet) throw new Error('Wallet not found');

    await executeInsert(
      `INSERT INTO pi_transactions
       (transaction_id, user_id, sanctuary_id, type, amount, source, reference_id, status, created_at)
       VALUES (?, ?, ?, 'earn', ?, ?, ?, 'completed', NOW())`,
      [transactionId, userId, sanctuaryId, actualReward, source, referenceId]
    );

    // Update wallet balance
    await executeUpdate(
      `UPDATE pi_wallets
       SET balance = balance + ?, total_earned = total_earned + ?
       WHERE user_id = ? AND sanctuary_id = ?`,
      [actualReward, actualReward, userId, sanctuaryId]
    );

    // Update monthly cap
    const yearMonth = new Date().toISOString().substring(0, 7);
    await executeUpdate(
      `UPDATE monthly_reward_caps
       SET total_earned = total_earned + ?
       WHERE user_id = ? AND sanctuary_id = ? AND year_month = ?`,
      [actualReward, userId, sanctuaryId, yearMonth]
    );

    const transaction = await executeQuery<PiTransaction>(
      `SELECT * FROM pi_transactions WHERE transaction_id = ?`,
      [transactionId]
    );

    return transaction[0];
  }

  /**
   * Daily check-in reward
   */
  static async addDailyCheckInReward(userId: string, sanctuaryId: number, userLevel: number): Promise<DailyCheckin> {
    const today = new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const existingCheckins = await executeQuery<DailyCheckin>(
      `SELECT * FROM daily_checkins
       WHERE user_id = ? AND sanctuary_id = ? AND checkin_date = ?`,
      [userId, sanctuaryId, today]
    );

    if (existingCheckins.length > 0) {
      throw new Error('今日已打卡，请明日再来');
    }

    // Award π2
    const reward = REWARD_CONFIG.daily_checkin.base_reward;
    const transaction = await this.addReward(
      userId,
      sanctuaryId,
      reward,
      'daily_check_in',
      userLevel
    );

    // Log checkin
    const checkinId = uuidv4();
    await executeInsert(
      `INSERT INTO daily_checkins
       (checkin_id, user_id, sanctuary_id, checkin_date, checkin_time, pi_reward, transaction_id)
       VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
      [checkinId, userId, sanctuaryId, today, reward, transaction.transaction_id]
    );

    const checkin = await executeQuery<DailyCheckin>(
      `SELECT * FROM daily_checkins WHERE checkin_id = ?`,
      [checkinId]
    );

    return checkin[0];
  }

  /**
   * Add meditation reward
   */
  static async addMeditationReward(
    userId: string,
    sanctuaryId: number,
    durationMinutes: number,
    userLevel: number,
    location?: string,
    notes?: string
  ): Promise<{ reward: number; transaction: PiTransaction; session: MeditationSession }> {
    const minDuration = REWARD_CONFIG.meditation.min_duration;
    const rewardPerMinute = REWARD_CONFIG.meditation.reward_per_minute;

    if (durationMinutes < minDuration) {
      throw new Error(`冥想时长需至少 ${minDuration} 分钟`);
    }

    // Calculate reward (capped at max daily minutes)
    const maxDailyMinutes = REWARD_CONFIG.meditation.max_daily_minutes;
    const effectiveDuration = Math.min(durationMinutes, maxDailyMinutes);
    const reward = Math.round(effectiveDuration * rewardPerMinute * 10) / 10;

    // Create meditation session
    const sessionId = uuidv4();
    const now = new Date();
    const startTime = new Date(now.getTime() - durationMinutes * 60000).toISOString();

    await executeInsert(
      `INSERT INTO meditation_sessions
       (session_id, user_id, sanctuary_id, start_time, end_time, duration_minutes, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, sanctuaryId, startTime, now.toISOString(), durationMinutes, location, notes]
    );

    // Award π
    const transaction = await this.addReward(
      userId,
      sanctuaryId,
      reward,
      'meditation',
      userLevel,
      sessionId
    );

    const session = await executeQuery<MeditationSession>(
      `SELECT * FROM meditation_sessions WHERE session_id = ?`,
      [sessionId]
    );

    return {
      reward,
      transaction,
      session: session[0],
    };
  }

  /**
   * Add lecture attendance reward
   */
  static async addLectureAttendanceReward(
    userId: string,
    sanctuaryId: number,
    activityId: string,
    userLevel: number
  ): Promise<PiTransaction> {
    // Check if already attended
    const existing = await executeQuery(
      `SELECT * FROM activity_attendance
       WHERE activity_id = ? AND user_id = ? AND sanctuary_id = ?`,
      [activityId, userId, sanctuaryId]
    );

    if (existing.length > 0) {
      throw new Error('已经参加过这场讲座');
    }

    const reward = REWARD_CONFIG.lecture_attendance.base_reward;
    const transaction = await this.addReward(
      userId,
      sanctuaryId,
      reward,
      'lecture_attendance',
      userLevel,
      activityId
    );

    // Log attendance
    await executeInsert(
      `INSERT INTO activity_attendance
       (attendance_id, activity_id, user_id, sanctuary_id, status, pi_reward_earned, reward_transaction_id)
       VALUES (?, ?, ?, ?, 'attended', ?, ?)`,
      [uuidv4(), activityId, userId, sanctuaryId, reward, transaction.transaction_id]
    );

    return transaction;
  }

  /**
   * Deduct π from wallet (purchase or transfer)
   */
  static async deductBalance(
    userId: string,
    sanctuaryId: number,
    amount: number,
    source: string,
    referenceId?: string
  ): Promise<PiTransaction> {
    const wallet = await this.getUserWallet(userId, sanctuaryId);
    if (!wallet) throw new Error('Wallet not found');

    if (wallet.balance < amount) {
      throw new Error(`π 派币不足。需要 π${amount}，您有 π${wallet.balance}`);
    }

    // Create transaction
    const transactionId = uuidv4();
    await executeInsert(
      `INSERT INTO pi_transactions
       (transaction_id, user_id, sanctuary_id, type, amount, source, reference_id, status, created_at)
       VALUES (?, ?, ?, 'spend', ?, ?, ?, 'completed', NOW())`,
      [transactionId, userId, sanctuaryId, amount, source, referenceId]
    );

    // Update wallet balance
    await executeUpdate(
      `UPDATE pi_wallets
       SET balance = balance - ?, total_spent = total_spent + ?
       WHERE user_id = ? AND sanctuary_id = ?`,
      [amount, amount, userId, sanctuaryId]
    );

    const transaction = await executeQuery<PiTransaction>(
      `SELECT * FROM pi_transactions WHERE transaction_id = ?`,
      [transactionId]
    );

    return transaction[0];
  }

  /**
   * Check and award streak bonus
   */
  static async checkAndAwardStreakBonus(
    userId: string,
    sanctuaryId: number,
    userLevel: number
  ): Promise<{ bonusAwarded: boolean; bonusAmount: number; streak: number }> {
    const results = await executeQuery<UserStreak>(
      `SELECT * FROM user_streaks WHERE user_id = ? AND sanctuary_id = ?`,
      [userId, sanctuaryId]
    );

    if (results.length === 0) {
      return { bonusAwarded: false, bonusAmount: 0, streak: 0 };
    }

    const streak = results[0];
    let bonusAmount = 0;

    // Check for milestone bonuses
    for (const [milestone, reward] of Object.entries(STREAK_BONUSES)) {
      const milestoneNum = parseInt(milestone);
      if (streak.current_streak === milestoneNum && !streak.bonus_awarded) {
        bonusAmount = reward as number;
        break;
      }
    }

    if (bonusAmount > 0) {
      // Award bonus
      await this.addReward(
        userId,
        sanctuaryId,
        bonusAmount,
        'streak_bonus',
        userLevel,
        streak.streak_id
      );

      // Mark bonus as awarded
      await executeUpdate(
        `UPDATE user_streaks
         SET bonus_awarded = true, bonus_milestone = ?, bonus_awarded_date = NOW()
         WHERE streak_id = ?`,
        [parseInt(Object.keys(STREAK_BONUSES).find(k => parseInt(k) === streak.current_streak)!), streak.streak_id]
      );

      return { bonusAwarded: true, bonusAmount, streak: streak.current_streak };
    }

    return { bonusAwarded: false, bonusAmount: 0, streak: streak.current_streak };
  }

  /**
   * Get transaction history
   */
  static async getTransactionHistory(
    userId: string,
    sanctuaryId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: PiTransaction[]; total: number }> {
    const countResults = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM pi_transactions
       WHERE user_id = ? AND sanctuary_id = ?`,
      [userId, sanctuaryId]
    );

    const transactions = await executeQuery<PiTransaction>(
      `SELECT * FROM pi_transactions
       WHERE user_id = ? AND sanctuary_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, sanctuaryId, limit, offset]
    );

    return {
      transactions,
      total: countResults[0].count,
    };
  }

  /**
   * Get wallet statistics
   */
  static async getWalletStats(userId: string, sanctuaryId: number, userLevel: number) {
    const wallet = await this.getUserWallet(userId, sanctuaryId);
    if (!wallet) throw new Error('Wallet not found');

    const capStatus = await this.checkMonthlyRewardCap(userId, sanctuaryId, userLevel);

    return {
      current_balance: wallet.balance,
      total_earned: wallet.total_earned,
      total_spent: wallet.total_spent,
      monthly_earned: capStatus.earned,
      monthly_remaining_cap: capStatus.remaining,
      level: userLevel,
    };
  }
}
