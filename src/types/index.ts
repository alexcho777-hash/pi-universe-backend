// User related types
export interface User {
  user_id: string;
  sanctuary_id: number;
  pi_uid: string;
  username: string;
  email?: string;
  password_hash?: string;
  avatar_url?: string;
  level: number;
  total_earned: number;
  total_spent: number;
  practice_hours: number;
  referral_count: number;
  status: 'active' | 'inactive' | 'banned';
  is_volunteer: boolean;
  is_moderator: boolean;
  created_at: string;
  updated_at: string;
}

// Wallet related types
export interface PiWallet {
  wallet_id: string;
  user_id: string;
  sanctuary_id: number;
  balance: number;
  locked_balance: number;
  total_earned: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface PiTransaction {
  transaction_id: string;
  user_id: string;
  sanctuary_id: number;
  type: 'earn' | 'spend' | 'transfer' | 'refund';
  amount: number;
  source: string;
  reference_id?: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  created_at: string;
  completed_at?: string;
}

export interface MonthlyRewardCap {
  cap_id: string;
  user_id: string;
  sanctuary_id: number;
  year_month: string;
  tier_level: number;
  total_earned: number;
  cap_limit: number;
  created_at: string;
  updated_at: string;
}

// Activity related types
export interface Activity {
  activity_id: string;
  sanctuary_id: number;
  title: string;
  description?: string;
  activity_type: 'daily_check_in' | 'meditation' | 'lecture' | 'volunteer' | 'discussion' | 'event';
  scheduled_at?: string;
  duration_minutes?: number;
  location?: string;
  max_participants?: number;
  current_participants: number;
  reward_pi: number;
  organizer_user_id?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface ActivityAttendance {
  attendance_id: string;
  activity_id: string;
  user_id: string;
  sanctuary_id: number;
  status: 'invited' | 'confirmed' | 'attended' | 'absent' | 'cancelled';
  check_in_time?: string;
  duration_participated?: number;
  pi_reward_earned: number;
  reward_transaction_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Shop related types
export interface ShopItem {
  item_id: string;
  sanctuary_id: number;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  price_pi: number;
  quantity_available?: number;
  quantity_sold: number;
  is_limited_edition: boolean;
  max_per_user?: number;
  status: 'active' | 'out_of_stock' | 'discontinued';
  created_at: string;
  updated_at: string;
}

export interface UserInventory {
  inventory_id: string;
  user_id: string;
  sanctuary_id: number;
  item_id: string;
  quantity: number;
  is_displayed_on_profile: boolean;
  acquired_at: string;
}

// Meditation session
export interface MeditationSession {
  session_id: string;
  user_id: string;
  sanctuary_id: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location?: string;
  notes?: string;
  pi_reward: number;
  transaction_id?: string;
  created_at: string;
}

// Streak
export interface UserStreak {
  streak_id: string;
  user_id: string;
  sanctuary_id: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date?: string;
  bonus_awarded: boolean;
  bonus_milestone?: number;
  bonus_awarded_date?: string;
  updated_at: string;
}

// Daily checkin
export interface DailyCheckin {
  checkin_id: string;
  user_id: string;
  sanctuary_id: number;
  checkin_date: string;
  checkin_time: string;
  pi_reward: number;
  transaction_id?: string;
}

// Sanctuary
export interface Sanctuary {
  sanctuary_id: number;
  name: string;
  religion_type: string;
  description?: string;
  icon?: string;
  max_members: number;
  current_members: number;
  status: 'active' | 'archived' | 'pending';
  created_at: string;
  updated_at: string;
}

// JWT Token Payload (Pi Network authentication)
export interface JWTPayload {
  user_id: string;
  sanctuary_id: number;
  pi_uid: string;
  iat?: number;
  exp?: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  details?: any;
  timestamp: string;
}

// Request user (after middleware)
export interface RequestUser {
  user_id: string;
  sanctuary_id: number;
  pi_uid: string;
}
