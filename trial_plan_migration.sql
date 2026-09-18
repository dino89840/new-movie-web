PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN vip_plan_type TEXT NOT NULL DEFAULT 'free';

ALTER TABLE promo_codes
ADD COLUMN is_trial INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET vip_plan_type = 'premium'
WHERE vip_until > 0
  AND vip_plan_months > 0;
