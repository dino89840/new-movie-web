ALTER TABLE titles
ADD COLUMN download_url TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_titles_download_category
ON titles(category, status, updated_at DESC);
