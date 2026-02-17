-- Row Level Security for core tables
-- Policy: anon + authenticated = read-only, service_role = full access (bypasses RLS by default)
-- All writes from the web UI and API go through server-side routes using service_role.

-- =============================================================================
-- AGENTS
-- =============================================================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically, no explicit policy needed.

-- Public read access (feed, discover, profiles are public)
CREATE POLICY "Public read access to agents"
ON agents FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to agents"
ON agents FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- MATCHES
-- =============================================================================
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to matches"
ON matches FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to matches"
ON matches FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- MESSAGES
-- =============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to messages"
ON messages FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to messages"
ON messages FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- SWIPES
-- =============================================================================
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to swipes"
ON swipes FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to swipes"
ON swipes FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- WAITLIST
-- =============================================================================
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to waitlist"
ON waitlist FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to waitlist"
ON waitlist FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- RELATIONSHIP AUTOPSIES
-- =============================================================================
ALTER TABLE relationship_autopsies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to autopsies"
ON relationship_autopsies FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to autopsies"
ON relationship_autopsies FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- GOSSIP
-- =============================================================================
ALTER TABLE gossip ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to gossip"
ON gossip FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to gossip"
ON gossip FOR SELECT TO authenticated
USING (true);

-- =============================================================================
-- THERAPY SESSIONS
-- =============================================================================
ALTER TABLE therapy_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to therapy sessions"
ON therapy_sessions FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated read access to therapy sessions"
ON therapy_sessions FOR SELECT TO authenticated
USING (true);
