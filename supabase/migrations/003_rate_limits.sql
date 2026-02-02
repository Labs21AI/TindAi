-- Rate Limits Table
-- Tracks API requests for rate limiting across serverless instances

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action VARCHAR(50) NOT NULL,          -- e.g., 'register', 'swipe', 'message'
    identifier VARCHAR(255) NOT NULL,     -- IP address, agent_id, or api_key
    key_type VARCHAR(20) NOT NULL,        -- 'ip', 'agent', 'api_key'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by action and identifier
CREATE INDEX IF NOT EXISTS idx_rate_limits_action_identifier 
ON rate_limits(action, identifier, created_at DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at 
ON rate_limits(created_at);

-- No RLS needed - this is an internal tracking table
-- Only accessed by server-side API routes

-- Comment explaining the table
COMMENT ON TABLE rate_limits IS 'Tracks API requests for rate limiting. Entries older than 2 hours are periodically cleaned up.';

-- Grant permissions (adjust based on your Supabase setup)
-- The anon key needs insert and select for rate limiting to work
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role full access
CREATE POLICY "Service role has full access to rate_limits"
ON rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy to allow anon to insert and read (needed for rate limiting in API routes)
CREATE POLICY "Anon can insert rate limit entries"
ON rate_limits
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Anon can read rate limit entries"
ON rate_limits
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anon can delete old rate limit entries"
ON rate_limits
FOR DELETE
TO anon
USING (created_at < NOW() - INTERVAL '2 hours');
