-- π Universe Multi-Sanctuary Database Schema (PostgreSQL)
-- Support for 6 major world religions

-- ===========================
-- Core Tables
-- ===========================

-- Sanctuaries (佛教 Buddhist, 基督教 Christian, 天主教 Catholic,
--              伊斯蘭教 Islamic, 日本道教 Shinto, 印度教 Hindu)
CREATE TABLE IF NOT EXISTS sanctuaries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  religion_type VARCHAR(20) NOT NULL UNIQUE CHECK (religion_type IN (
    'buddhist', 'christian', 'catholic', 'islamic', 'shinto', 'hindu'
  )),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  language VARCHAR(10) DEFAULT 'zh',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuaries_religion_type ON sanctuaries(religion_type);
CREATE INDEX IF NOT EXISTS idx_sanctuaries_is_active ON sanctuaries(is_active);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  pi_uid VARCHAR(255) UNIQUE,
  pi_username VARCHAR(255) UNIQUE,
  pi_address VARCHAR(255),
  current_sanctuary_id INT REFERENCES sanctuaries(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_pi_uid ON users(pi_uid);

-- Sanctuary Zones (各教派的區域)
CREATE TABLE IF NOT EXISTS sanctuary_zones (
  id SERIAL PRIMARY KEY,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  position_x FLOAT,
  position_y FLOAT,
  position_z FLOAT,
  radius FLOAT DEFAULT 5.0,
  zone_type VARCHAR(30) CHECK (zone_type IN (
    'main_hall', 'meditation', 'prayer_room', 'library', 'courtyard',
    'garden', 'water_feature', 'shop', 'baptism_pool', 'ablution_room',
    'confession_booth', 'pulpit', 'altar', 'shrine', 'yoga_room', 'other'
  )),
  is_interactive BOOLEAN DEFAULT FALSE,
  interaction_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_sanctuary_zone UNIQUE (sanctuary_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_zones_type ON sanctuary_zones(zone_type);

-- ===========================
-- User-Sanctuary Relationships
-- ===========================

-- User Sanctuary Memberships
CREATE TABLE IF NOT EXISTS user_sanctuaries (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_primary BOOLEAN DEFAULT FALSE,
  visit_count INT DEFAULT 0,
  total_visit_time INT DEFAULT 0,
  last_visit TIMESTAMP,
  CONSTRAINT unique_user_sanctuary UNIQUE (user_id, sanctuary_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sanctuaries_sanctuary_id ON user_sanctuaries(sanctuary_id);

-- ===========================
-- Activity Tables
-- ===========================

-- Activities (冥想 Meditation, 祈禱 Prayer, 誦經 Chanting, 瑜伽 Yoga, etc.)
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN (
    'meditation', 'prayer', 'chanting', 'yoga', 'study', 'worship', 'check_in'
  )),
  duration_minutes INT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activities_sanctuary_id ON activities(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

-- ===========================
-- Donation System
-- ===========================

-- Donations (樂捐功德)
CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'pi' CHECK (currency IN ('pi', 'usd', 'cny')),
  donor_name VARCHAR(255),
  message TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donations_sanctuary_id ON donations(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations(created_at);

-- Donation Statistics (每日統計)
CREATE TABLE IF NOT EXISTS donation_stats (
  id SERIAL PRIMARY KEY,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_donations DECIMAL(15, 2),
  donation_count INT,
  top_donor_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_sanctuary_date_donation UNIQUE (sanctuary_id, date)
);

CREATE INDEX IF NOT EXISTS idx_donation_stats_date ON donation_stats(date);

-- ===========================
-- Visit Statistics
-- ===========================

-- Sanctuary Visits (訪問記錄)
CREATE TABLE IF NOT EXISTS sanctuary_visits (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  zone_id INT REFERENCES sanctuary_zones(id) ON DELETE SET NULL,
  visit_duration_seconds INT,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_visits_sanctuary_id ON sanctuary_visits(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_sanctuary_visits_user_id ON sanctuary_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_sanctuary_visits_visited_at ON sanctuary_visits(visited_at);

-- Visit Statistics (每日訪問統計)
CREATE TABLE IF NOT EXISTS visit_stats (
  id SERIAL PRIMARY KEY,
  sanctuary_id INT NOT NULL REFERENCES sanctuaries(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  unique_visitors INT,
  total_visits INT,
  avg_visit_duration INT,
  peak_hour INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_sanctuary_date_visit UNIQUE (sanctuary_id, date)
);

CREATE INDEX IF NOT EXISTS idx_visit_stats_date ON visit_stats(date);

-- ===========================
-- User Preferences
-- ===========================

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_language VARCHAR(10) DEFAULT 'zh',
  theme VARCHAR(10) DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  receive_sanctuary_updates BOOLEAN DEFAULT TRUE,
  privacy_level VARCHAR(10) DEFAULT 'private' CHECK (privacy_level IN ('public', 'friends', 'private')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================
-- Additional Composite Indexes
-- ===========================

CREATE INDEX IF NOT EXISTS idx_user_sanctuaries_user_id ON user_sanctuaries(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_sanctuary_user ON activities(sanctuary_id, user_id);
CREATE INDEX IF NOT EXISTS idx_donations_sanctuary_date ON donations(sanctuary_id, created_at);
CREATE INDEX IF NOT EXISTS idx_visits_sanctuary_date ON sanctuary_visits(sanctuary_id, visited_at);

-- ===========================
-- Initial Sanctuary Data
-- ===========================

INSERT INTO sanctuaries (name, religion_type, description, icon, color, language) VALUES
  ('佛教禪修', 'buddhist', '中華佛教禪修聖地', '🏯', '#D4AF37', 'zh-TW'),
  ('基督教禮拜堂', 'christian', '基督教信仰社區', '✝️', '#FFFFFF', 'zh-TW'),
  ('天主教聖堂', 'catholic', '天主教靈性聖殿', '✝️', '#FFD700', 'zh-TW'),
  ('伊斯蘭清真寺', 'islamic', '伊斯蘭信仰中心', '☪️', '#2ECC71', 'zh-TW'),
  ('日本神社', 'shinto', '日本傳統神社', '⛩️', '#FF6B6B', 'zh-TW'),
  ('印度廟', 'hindu', '印度教靈性殿堂', '🕉️', '#FF9933', 'zh-TW')
ON CONFLICT (religion_type) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
