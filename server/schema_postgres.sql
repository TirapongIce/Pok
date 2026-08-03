CREATE SCHEMA IF NOT EXISTS lotto_demo;
SET search_path TO lotto_demo;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('agent', 'admin');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lottery_kind AS ENUM ('thai', 'lao');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lottery_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE bet_type AS ENUM ('three-top','three-tod','three-bottom','three-front','three-front-tod','two-top','two-bottom','two-tod','run-top','run-bottom');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('pending','won','lost','cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('deposit','withdraw');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE chat_sender AS ENUM ('user','admin');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash CHAR(64) NOT NULL,
  role user_role DEFAULT 'agent',
  credit_limit NUMERIC(12,2) DEFAULT 0,
  credit_used NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lotteries (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  kind lottery_kind NOT NULL,
  open_time TIMESTAMP NOT NULL,
  close_time TIMESTAMP NOT NULL,
  status lottery_status DEFAULT 'open',
  description TEXT
);

CREATE TABLE IF NOT EXISTS lottery_results (
  id BIGSERIAL PRIMARY KEY,
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
  extra JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lottery_results_unique UNIQUE (lottery_code, draw_date)
);

CREATE TABLE IF NOT EXISTS number_restrictions (
  id BIGSERIAL PRIMARY KEY,
  lottery_code VARCHAR(50) NOT NULL,
  bet_type VARCHAR(50) NOT NULL,
  number VARCHAR(10) NOT NULL,
  payout_rate NUMERIC(10,2),
  max_amount NUMERIC(12,2),
  discount_percent NUMERIC(5,2),
  scope VARCHAR(20),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_number_restrictions_lottery ON number_restrictions(lottery_code);
CREATE INDEX IF NOT EXISTS idx_number_restrictions_bet ON number_restrictions(bet_type);

ALTER TABLE IF EXISTS number_restrictions
  ADD COLUMN IF NOT EXISTS max_amount NUMERIC(12,2);
ALTER TABLE IF EXISTS number_restrictions
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2);
ALTER TABLE IF EXISTS number_restrictions
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20);
ALTER TABLE IF EXISTS number_restrictions
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  lottery_code VARCHAR(50) NOT NULL,
  bet_type bet_type NOT NULL,
  numbers TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payout_rate NUMERIC(8,2),
  status ticket_status DEFAULT 'pending',
  draw_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
ALTER TABLE IF EXISTS tickets
  ALTER COLUMN numbers TYPE TEXT;
ALTER TABLE IF EXISTS tickets
  ADD COLUMN IF NOT EXISTS draw_date DATE;
CREATE INDEX IF NOT EXISTS idx_tickets_lottery ON tickets(lottery_code);
CREATE INDEX IF NOT EXISTS idx_tickets_lottery_draw ON tickets(lottery_code, draw_date);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS payout_rates (
  id BIGSERIAL PRIMARY KEY,
  lottery_code VARCHAR(50) NOT NULL,
  bet_type VARCHAR(50) NOT NULL,
  number_pattern VARCHAR(20),
  rate NUMERIC(10,2) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payout_rates_lottery ON payout_rates(lottery_code);
CREATE INDEX IF NOT EXISTS idx_payout_rates_type ON payout_rates(bet_type);

CREATE TABLE IF NOT EXISTS purchase_logs (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT,
  user_id BIGINT,
  lottery_code VARCHAR(50),
  bet_type VARCHAR(50),
  numbers VARCHAR(10),
  amount NUMERIC(12,2),
  draw_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE IF EXISTS purchase_logs
  ADD COLUMN IF NOT EXISTS draw_date DATE;
CREATE INDEX IF NOT EXISTS idx_purchase_logs_ticket ON purchase_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_user ON purchase_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_lottery_draw ON purchase_logs(lottery_code, draw_date);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(150),
  bank_name VARCHAR(150),
  bank_account VARCHAR(50),
  bank_branch VARCHAR(100),
  bsb VARCHAR(50),
  registration_no VARCHAR(100),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txn_type transaction_type NOT NULL,
  status transaction_status DEFAULT 'pending',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(txn_type);

CREATE TABLE IF NOT EXISTS promotions (
  id BIGSERIAL PRIMARY KEY,
  promo_code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO live_settings (id, enabled)
  VALUES (1, TRUE)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_threads (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender chat_sender NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);

ALTER TABLE IF EXISTS tickets
  ADD COLUMN IF NOT EXISTS promotion_code VARCHAR(50);

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(200),
    message TEXT,
    meta JSONB,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
EXCEPTION WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS lottery_rounds (
    lottery_code VARCHAR(50) PRIMARY KEY,
    rounds JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
EXCEPTION WHEN duplicate_table THEN null;
END $$;
