-- Migration: Add API cache table for Redis-like caching
-- Created: 2026-03-22

-- API Cache table for storing polled data with TTL
CREATE TABLE IF NOT EXISTS api_cache (
  source TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INTEGER NOT NULL DEFAULT 1800,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient expiry checks
CREATE INDEX IF NOT EXISTS api_cache_expires_at_idx ON api_cache(expires_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_cache_updated_at
  BEFORE UPDATE ON api_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_api_cache_updated_at();

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM api_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE api_cache IS 'Redis-like cache for API responses with TTL';
COMMENT ON COLUMN api_cache.source IS 'Unique cache key (e.g., "opensky:caribbean_corridor")';
COMMENT ON COLUMN api_cache.data IS 'Cached response data';
COMMENT ON COLUMN api_cache.ttl_seconds IS 'Time to live in seconds';
COMMENT ON COLUMN api_cache.expires_at IS 'Absolute expiration timestamp';
