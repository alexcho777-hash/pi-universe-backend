import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeInsert, executeUpdate } from '../db/connection';
import { Activity, ActivityAttendance } from '../types';
import { PiCurrencyService } from './PiCurrencyService';

export class ActivityService {
  /**
   * Get activities by sanctuary and filters
   */
  static async getActivities(
    sanctuaryId: number,
    type?: string,
    status?: string,
    dateRange?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ activities: Activity[]; total: number }> {
    let query = 'SELECT * FROM activities WHERE sanctuary_id = ?';
    const params: any[] = [sanctuaryId];

    if (type) {
      query += ' AND activity_type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (dateRange) {
      const now = new Date();
      let startDate, endDate;

      switch (dateRange) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
      }

      if (startDate && endDate) {
        query += ' AND scheduled_at BETWEEN ? AND ?';
        params.push(startDate.toISOString(), endDate.toISOString());
      }
    }

    // Get total count
    const countResults = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM (${query}) as counted`,
      params
    );

    // Get paginated results
    query += ' ORDER BY scheduled_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const activities = await executeQuery<Activity>(query, params);

    return {
      activities,
      total: countResults[0].count,
    };
  }

  /**
   * Get activity by ID
   */
  static async getActivityById(activityId: string, sanctuaryId: number): Promise<Activity> {
    const activities = await executeQuery<Activity>(
      `SELECT * FROM activities WHERE activity_id = ? AND sanctuary_id = ?`,
      [activityId, sanctuaryId]
    );

    if (activities.length === 0) {
      throw new Error('活动不存在');
    }

    return activities[0];
  }

  /**
   * Create an activity
   */
  static async createActivity(
    sanctuaryId: number,
    title: string,
    description: string,
    activityType: string,
    scheduledAt: string,
    durationMinutes: number,
    location: string,
    maxParticipants: number,
    rewardPi: number,
    organizerUserId: string
  ): Promise<Activity> {
    const activityId = uuidv4();

    await executeInsert(
      `INSERT INTO activities
       (activity_id, sanctuary_id, title, description, activity_type, scheduled_at, duration_minutes, location, max_participants, reward_pi, organizer_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        activityId,
        sanctuaryId,
        title,
        description,
        activityType,
        scheduledAt,
        durationMinutes,
        location,
        maxParticipants,
        rewardPi,
        organizerUserId,
      ]
    );

    return this.getActivityById(activityId, sanctuaryId);
  }

  /**
   * Confirm attendance for an activity
   */
  static async confirmAttendance(
    activityId: string,
    userId: string,
    sanctuaryId: number
  ): Promise<ActivityAttendance> {
    // Check if activity exists
    const activity = await this.getActivityById(activityId, sanctuaryId);

    // Check if already attended
    const existing = await executeQuery<ActivityAttendance>(
      `SELECT * FROM activity_attendance
       WHERE activity_id = ? AND user_id = ? AND sanctuary_id = ?`,
      [activityId, userId, sanctuaryId]
    );

    if (existing.length > 0) {
      throw new Error('已经确认参加此活动');
    }

    // Check capacity
    if (activity.max_participants && activity.current_participants >= activity.max_participants) {
      throw new Error('活动已满，无法参加');
    }

    const attendanceId = uuidv4();

    await executeInsert(
      `INSERT INTO activity_attendance
       (attendance_id, activity_id, user_id, sanctuary_id, status)
       VALUES (?, ?, ?, ?, 'confirmed')`,
      [attendanceId, activityId, userId, sanctuaryId]
    );

    // Increment participant count
    await executeUpdate(
      `UPDATE activities SET current_participants = current_participants + 1
       WHERE activity_id = ? AND sanctuary_id = ?`,
      [activityId, sanctuaryId]
    );

    const attendance = await executeQuery<ActivityAttendance>(
      `SELECT * FROM activity_attendance WHERE attendance_id = ?`,
      [attendanceId]
    );

    return attendance[0];
  }

  /**
   * Complete an activity and distribute rewards
   */
  static async completeActivity(
    activityId: string,
    sanctuaryId: number,
    activeParticipantIds: string[],
    organizerUserLevel: number = 1
  ): Promise<{
    totalRewarded: number;
    baseReward: number;
    rewardsDistributed: Array<{ userId: string; reward: number; transactionId: string }>;
  }> {
    const activity = await this.getActivityById(activityId, sanctuaryId);

    if (activity.status !== 'scheduled' && activity.status !== 'ongoing') {
      throw new Error('此活动无法完成');
    }

    const baseReward = activity.reward_pi;
    const rewardsDistributed: Array<{ userId: string; reward: number; transactionId: string }> = [];

    // Distribute rewards to active participants
    for (const userId of activeParticipantIds) {
      try {
        // Get user level for cap checking
        const userResults = await executeQuery<{ level: number }>(
          `SELECT level FROM users WHERE user_id = ? AND sanctuary_id = ?`,
          [userId, sanctuaryId]
        );

        if (userResults.length === 0) continue;

        const userLevel = userResults[0].level;
        let reward = baseReward;

        // Bonus for very active participants (could be based on additional metrics)
        // For now, give 1.5x multiplier based on activity type
        if (activity.activity_type === 'lecture') {
          reward = baseReward * 1.5;
        }

        const transaction = await PiCurrencyService.addReward(
          userId,
          sanctuaryId,
          reward,
          activity.activity_type,
          userLevel,
          activityId
        );

        // Update attendance record
        await executeUpdate(
          `UPDATE activity_attendance
           SET status = 'attended', pi_reward_earned = ?, reward_transaction_id = ?
           WHERE activity_id = ? AND user_id = ? AND sanctuary_id = ?`,
          [reward, transaction.transaction_id, activityId, userId, sanctuaryId]
        );

        rewardsDistributed.push({
          userId,
          reward,
          transactionId: transaction.transaction_id,
        });
      } catch (error) {
        console.error(`Failed to reward user ${userId}:`, error);
      }
    }

    // Mark activity as completed
    await executeUpdate(
      `UPDATE activities SET status = 'completed' WHERE activity_id = ? AND sanctuary_id = ?`,
      [activityId, sanctuaryId]
    );

    return {
      totalRewarded: rewardsDistributed.length,
      baseReward,
      rewardsDistributed,
    };
  }

  /**
   * Get attendance records for an activity
   */
  static async getActivityAttendance(
    activityId: string,
    sanctuaryId: number
  ): Promise<ActivityAttendance[]> {
    return executeQuery<ActivityAttendance>(
      `SELECT * FROM activity_attendance
       WHERE activity_id = ? AND sanctuary_id = ?`,
      [activityId, sanctuaryId]
    );
  }
}
