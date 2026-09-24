import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeInsert, executeUpdate } from '../db/connection';
import { User, PiWallet } from '../types';
import { verifyPiSignature } from '../utils/auth';
import { PiCurrencyService } from './PiCurrencyService';

export class UserService {
  /**
   * Register a new user with Pi Network
   */
  static async registerUser(
    piUid: string,
    username: string,
    sanctuaryId: number,
    gender?: string,
    birthday?: string
  ): Promise<{ user: User; wallet: PiWallet }> {
    // Check if user already exists with this Pi UID
    const existing = await executeQuery<User>(
      `SELECT * FROM users WHERE pi_uid = ? AND sanctuary_id = ?`,
      [piUid, sanctuaryId]
    );

    if (existing.length > 0) {
      throw new Error('此π账户已在该社群注册');
    }

    const userId = uuidv4();

    // Create user with Pi Network authentication
    await executeInsert(
      `INSERT INTO users
       (user_id, sanctuary_id, pi_uid, username, level, total_earned, total_spent, practice_hours, referral_count, status)
       VALUES (?, ?, ?, ?, 1, 0, 0, 0, 0, 'active')`,
      [userId, sanctuaryId, piUid, username]
    );

    // Create wallet
    const wallet = await PiCurrencyService.createWallet(userId, sanctuaryId);

    // Create user streak tracker
    await executeInsert(
      `INSERT INTO user_streaks
       (streak_id, user_id, sanctuary_id, current_streak, longest_streak)
       VALUES (?, ?, ?, 0, 0)`,
      [uuidv4(), userId, sanctuaryId]
    );

    const user = await executeQuery<User>(
      `SELECT * FROM users WHERE user_id = ?`,
      [userId]
    );

    return {
      user: user[0],
      wallet,
    };
  }

  /**
   * Login user with Pi Network signature verification
   */
  static async loginUser(piUid: string, signature: string, sanctuaryId: number): Promise<User> {
    // Verify Pi signature
    const isValidSignature = await verifyPiSignature(piUid, signature);
    if (!isValidSignature) {
      throw new Error('π网络签名验证失败');
    }

    // Find user by Pi UID
    const users = await executeQuery<User>(
      `SELECT * FROM users WHERE pi_uid = ? AND sanctuary_id = ?`,
      [piUid, sanctuaryId]
    );

    // If user doesn't exist, throw error indicating they need to register
    if (users.length === 0) {
      const error: any = new Error('用户未注册');
      error.code = 'PI_NOT_REGISTERED';
      throw error;
    }

    const user = users[0];

    if (user.status === 'banned') {
      throw new Error('该账户已被禁用');
    }

    return user;
  }

  /**
   * Get user by Pi UID
   */
  static async getUserByPiUid(piUid: string, sanctuaryId: number): Promise<User | null> {
    const users = await executeQuery<User>(
      `SELECT * FROM users WHERE pi_uid = ? AND sanctuary_id = ?`,
      [piUid, sanctuaryId]
    );

    return users.length > 0 ? users[0] : null;
  }

  /**
   * Get user profile
   */
  static async getUserProfile(userId: string, sanctuaryId: number): Promise<User> {
    const users = await executeQuery<User>(
      `SELECT * FROM users WHERE user_id = ? AND sanctuary_id = ?`,
      [userId, sanctuaryId]
    );

    if (users.length === 0) {
      throw new Error('用户不存在');
    }

    return users[0];
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(
    userId: string,
    sanctuaryId: number,
    updates: {
      avatar_url?: string;
      username?: string;
    }
  ): Promise<User> {
    const allowedFields = ['avatar_url', 'username'];
    const updateFields = Object.keys(updates)
      .filter(key => allowedFields.includes(key) && updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`);

    if (updateFields.length === 0) {
      return this.getUserProfile(userId, sanctuaryId);
    }

    const updateValues: any[] = Object.keys(updates)
      .filter(key => allowedFields.includes(key) && updates[key as keyof typeof updates] !== undefined)
      .map(key => updates[key as keyof typeof updates]);

    updateValues.push(userId, sanctuaryId);

    await executeUpdate(
      `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE user_id = ? AND sanctuary_id = ?`,
      updateValues
    );

    return this.getUserProfile(userId, sanctuaryId);
  }
}
