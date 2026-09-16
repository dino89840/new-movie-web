PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN vip_plan_months INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS promo_codes (
  code_hash TEXT PRIMARY KEY,
  code_hint TEXT NOT NULL DEFAULT '',
  plan_months INTEGER NOT NULL
    CHECK(plan_months IN (1, 3, 6, 12)),
  max_redemptions INTEGER NOT NULL DEFAULT 1
    CHECK(max_redemptions >= 1),
  redeemed_count INTEGER NOT NULL DEFAULT 0
    CHECK(redeemed_count >= 0),
  expires_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'disabled')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(created_by)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_status_expiry
ON promo_codes(status, expires_at);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  code_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY(code_hash, user_id),
  FOREIGN KEY(code_hash)
    REFERENCES promo_codes(code_hash)
    ON DELETE CASCADE,
  FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user
ON promo_redemptions(user_id, redeemed_at DESC);

/*
 * Promo limit check နဲ့ redeemed_count update ကို
 * database တစ်နေရာတည်းမှာ atomic ဖြစ်အောင် trigger သုံးထားသည်။
 */
CREATE TRIGGER IF NOT EXISTS promo_before_redeem
BEFORE INSERT ON promo_redemptions
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM promo_codes
      WHERE code_hash = NEW.code_hash
        AND status = 'active'
        AND redeemed_count < max_redemptions
        AND (
          expires_at = 0
          OR expires_at > NEW.redeemed_at
        )
    )
    THEN RAISE(ABORT, 'PROMO_UNAVAILABLE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS promo_after_redeem
AFTER INSERT ON promo_redemptions
BEGIN
  UPDATE promo_codes
  SET redeemed_count = redeemed_count + 1,
      updated_at = NEW.redeemed_at
  WHERE code_hash = NEW.code_hash;
END;
