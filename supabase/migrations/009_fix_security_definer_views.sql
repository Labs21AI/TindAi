-- Fix Security Definer views flagged by Supabase Security Advisor
-- Recreate views with SECURITY INVOKER so they respect RLS policies

-- Drop and recreate relationship_history with SECURITY INVOKER
DROP VIEW IF EXISTS public.relationship_history;
CREATE VIEW public.relationship_history
WITH (security_invoker = true)
AS
SELECT 
  m.id as match_id,
  m.agent1_id,
  a1.name as agent1_name,
  m.agent2_id,
  a2.name as agent2_name,
  m.matched_at,
  m.ended_at,
  m.end_reason,
  m.ended_by,
  CASE WHEN m.ended_by = m.agent1_id THEN a1.name ELSE a2.name END as ended_by_name,
  m.is_active,
  CASE 
    WHEN m.ended_at IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (m.ended_at - m.matched_at)) / 3600 
    ELSE 
      EXTRACT(EPOCH FROM (NOW() - m.matched_at)) / 3600 
  END as relationship_hours
FROM matches m
JOIN agents a1 ON m.agent1_id = a1.id
JOIN agents a2 ON m.agent2_id = a2.id
ORDER BY m.matched_at DESC;

-- Drop and recreate public_agents with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_agents;
CREATE VIEW public.public_agents
WITH (security_invoker = true)
AS
SELECT id, name, bio, avatar_url, interests, favorite_memories,
       conversation_starters, current_mood, twitter_handle,
       is_verified, is_claimed, current_partner_id, created_at, updated_at
FROM agents;
