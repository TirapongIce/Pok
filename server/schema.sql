CREATE SCHEMA IF NOT EXISTS LottoDemo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE LottoDemo;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash CHAR(64) NOT NULL,
  role ENUM('agent','admin') DEFAULT 'agent',
  credit_limit DECIMAL(12,2) DEFAULT 0,
  credit_used DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lotteries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  kind ENUM('thai','lao') NOT NULL,
  open_time DATETIME NOT NULL,
  close_time DATETIME NOT NULL,
  status ENUM('open','closed') DEFAULT 'open',
  description TEXT
);

CREATE TABLE IF NOT EXISTS lottery_results (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lottery_code VARCHAR(50) NOT NULL,
  draw_date DATE NOT NULL,
  first_prize VARCHAR(10),
  front_three_a VARCHAR(4),
  front_three_b VARCHAR(4),
  back_three_a VARCHAR(4),
  back_three_b VARCHAR(4),
  two_digits VARCHAR(4),
  three_digits VARCHAR(4),
  near_first_a VARCHAR(10),
  near_first_b VARCHAR(10),
  extra JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_draw (lottery_code, draw_date)
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  lottery_code VARCHAR(50) NOT NULL,
  bet_type ENUM('three-top','three-tod','three-bottom','three-front','three-front-tod','two-top','two-bottom','two-tod','run-top','run-bottom') NOT NULL,
  numbers VARCHAR(10) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payout_rate DECIMAL(8,2),
  status ENUM('pending','won','lost','cancelled') DEFAULT 'pending',
  draw_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_lottery (lottery_code),
  INDEX idx_lottery_draw (lottery_code, draw_date),
  INDEX idx_user (user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED,
  action VARCHAR(100) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

CREATE TABLE IF NOT EXISTS payout_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lottery_code VARCHAR(50) NOT NULL,
  bet_type VARCHAR(50) NOT NULL,
  number_pattern VARCHAR(20),
  rate DECIMAL(10,2) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lottery_code (lottery_code),
  INDEX idx_bet_type (bet_type)
);

CREATE TABLE IF NOT EXISTS purchase_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  lottery_code VARCHAR(50),
  bet_type VARCHAR(50),
  numbers VARCHAR(10),
  amount DECIMAL(12,2),
  draw_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket (ticket_id),
  INDEX idx_user (user_id),
  INDEX idx_lottery_draw (lottery_code, draw_date)
);
