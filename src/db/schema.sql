-- π Universe Multi-Sanctuary Database Schema
-- Support for 6 major world religions

-- ===========================
-- Core Tables
-- ===========================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  pi_uid VARCHAR(255) UNIQUE,
  pi_username VARCHAR(255) UNIQUE,
  pi_address VARCHAR(255),
  current_sanctuary_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (current_sanctuary_id) REFERENCES sanctuaries(id),
  INDEX (pi_uid)
);

-- ===========================
-- Sanctuary Tables (6 Religions)
-- ===========================

-- Sanctuaries (佛教 Buddhist, 基督教 Christian, 天主教 Catholic,
--              伊斯蘭教 Islamic, 日本道教 Shinto, 印度教 Hindu)
CREATE TABLE IF NOT EXISTS sanctuaries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  religion_type ENUM(
    'buddhist',
    'christian',
    'catholic',
    'islamic',
    'shinto',
    'hindu'
  ) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  language VARCHAR(10) DEFAULT 'zh',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (religion_type),
  INDEX (is_active)
);

-- Sanctuary Zones (各教派的區域)
CREATE TABLE IF NOT EXISTS sanctuary_zones (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sanctuary_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  position_x FLOAT,
  position_y FLOAT,
  position_z FLOAT,
  radius FLOAT DEFAULT 5.0,
  zone_type ENUM(
    'main_hall',
    'meditation',
    'prayer_room',
    'library',
    'courtyard',
    'garden',
    'water_feature',
    'shop',
    'baptism_pool',
    'ablution_room',
    'confession_booth',
    'pulpit',
    'altar',
    'shrine',
    'yoga_room',
    'other'
  ),
  is_interactive BOOLEAN DEFAULT FALSE,
  interaction_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  UNIQUE KEY unique_sanctuary_zone (sanctuary_id, name),
  INDEX (zone_type)
);

-- ===========================
-- User-Sanctuary Relationships
-- ===========================

-- User Sanctuary Memberships
CREATE TABLE IF NOT EXISTS user_sanctuaries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  sanctuary_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_primary BOOLEAN DEFAULT FALSE,
  visit_count INT DEFAULT 0,
  total_visit_time INT DEFAULT 0,
  last_visit TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_sanctuary (user_id, sanctuary_id),
  INDEX (sanctuary_id)
);

-- ===========================
-- Activity Tables
-- ===========================

-- Activities (冥想 Meditation, 祈禱 Prayer, 誦經 Chanting, 瑜伽 Yoga, etc.)
CREATE TABLE IF NOT EXISTS activities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sanctuary_id INT NOT NULL,
  user_id INT NOT NULL,
  activity_type ENUM(
    'meditation',
    'prayer',
    'chanting',
    'yoga',
    'study',
    'worship',
    'check_in'
  ) NOT NULL,
  duration_minutes INT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (sanctuary_id),
  INDEX (user_id),
  INDEX (activity_type),
  INDEX (created_at)
);

-- ===========================
-- Donation System
-- ===========================

-- Donations (樂捐功德)
CREATE TABLE IF NOT EXISTS donations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  sanctuary_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency ENUM('pi', 'usd', 'cny') DEFAULT 'pi',
  donor_name VARCHAR(255),
  message TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  INDEX (sanctuary_id),
  INDEX (user_id),
  INDEX (created_at)
);

-- Donation Statistics (每日統計)
CREATE TABLE IF NOT EXISTS donation_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sanctuary_id INT NOT NULL,
  date DATE NOT NULL,
  total_donations DECIMAL(15, 2),
  donation_count INT,
  top_donor_id INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  FOREIGN KEY (top_donor_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_sanctuary_date (sanctuary_id, date),
  INDEX (date)
);

-- ===========================
-- Visit Statistics
-- ===========================

-- Sanctuary Visits (訪問記錄)
CREATE TABLE IF NOT EXISTS sanctuary_visits (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  sanctuary_id INT NOT NULL,
  zone_id INT,
  visit_duration_seconds INT,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES sanctuary_zones(id) ON DELETE SET NULL,
  INDEX (sanctuary_id),
  INDEX (user_id),
  INDEX (visited_at)
);

-- Visit Statistics (每日訪問統計)
CREATE TABLE IF NOT EXISTS visit_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sanctuary_id INT NOT NULL,
  date DATE NOT NULL,
  unique_visitors INT,
  total_visits INT,
  avg_visit_duration INT,
  peak_hour INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sanctuary_id) REFERENCES sanctuaries(id) ON DELETE CASCADE,
  UNIQUE KEY unique_sanctuary_date (sanctuary_id, date),
  INDEX (date)
);

-- ===========================
-- User Preferences
-- ===========================

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  preferred_language VARCHAR(10) DEFAULT 'zh',
  theme ENUM('light', 'dark') DEFAULT 'dark',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  receive_sanctuary_updates BOOLEAN DEFAULT TRUE,
  privacy_level ENUM('public', 'friends', 'private') DEFAULT 'private',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================
-- Indexes for Performance
-- ===========================

CREATE INDEX idx_users_pi_username ON users(pi_username);
CREATE INDEX idx_user_sanctuaries_user_id ON user_sanctuaries(user_id);
CREATE INDEX idx_activities_sanctuary_user ON activities(sanctuary_id, user_id);
CREATE INDEX idx_donations_sanctuary_date ON donations(sanctuary_id, created_at);
CREATE INDEX idx_visits_sanctuary_date ON sanctuary_visits(sanctuary_id, visited_at);

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
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
