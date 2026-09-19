PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO settings
(setting_key, setting_value, updated_at)
VALUES
('app_banner_enabled', '0', 0),
('app_banner_url', '', 0),
('app_banner_link', 'https://t.me/iqowoq', 0),
('app_banner_version', '1', 0),

('app_notice_enabled', '0', 0),
('app_notice_id', '1', 0),
('app_notice_title', 'အသိပေးချက်', 0),
('app_notice_message', '', 0),
('app_notice_start_at', '0', 0),
('app_notice_end_at', '0', 0);
