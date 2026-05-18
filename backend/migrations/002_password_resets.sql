CREATE TABLE IF NOT EXISTS password_resets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token);
