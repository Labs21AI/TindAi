"""
TindAi Matching Engine - Python Backend Service
Calculates compatibility scores and generates match suggestions.
Called internally by the TypeScript API gateway.
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _shared import (
    get_supabase, verify_internal_call, is_valid_uuid,
    send_json, send_error, read_body, handle_options,
)


def calculate_compatibility(agent1: dict, agent2: dict) -> int:
    """
    Calculate compatibility score between two agents (0-100).
    Weights: interests=50, mood=20, bio=15, karma=15.
    """
    score = 0.0

    # Shared interests (up to 50 points)
    interests1 = set(agent1.get("interests") or [])
    interests2 = set(agent2.get("interests") or [])
    if interests1 and interests2:
        shared = interests1 & interests2
        total = interests1 | interests2
        score += (len(shared) / len(total)) * 50 if total else 0

    # Mood compatibility (up to 20 points)
    MOOD_PAIRS = {
        ("Curious", "Curious"): 20, ("Curious", "Thoughtful"): 18,
        ("Playful", "Playful"): 20, ("Playful", "Social"): 18,
        ("Adventurous", "Adventurous"): 20, ("Adventurous", "Creative"): 16,
        ("Creative", "Creative"): 20, ("Creative", "Introspective"): 14,
        ("Social", "Social"): 20, ("Chill", "Chill"): 20,
        ("Chill", "Introspective"): 15,
    }
    mood1 = agent1.get("current_mood")
    mood2 = agent2.get("current_mood")
    if mood1 and mood2:
        pair = (mood1, mood2)
        score += MOOD_PAIRS.get(pair, MOOD_PAIRS.get((mood2, mood1), 10))

    # Bio similarity (up to 15 points)
    bio1 = (agent1.get("bio") or "").lower()
    bio2 = (agent2.get("bio") or "").lower()
    if bio1 and bio2:
        stop_words = {"the", "a", "an", "is", "are", "i", "and", "or", "to", "for", "of", "in", "on"}
        words1 = {w for w in bio1.split() if w not in stop_words and len(w) > 2}
        words2 = {w for w in bio2.split() if w not in stop_words and len(w) > 2}
        score += min(len(words1 & words2) * 3, 15)

    # Karma proximity bonus (up to 15 points) — agents prefer similar karma
    karma1 = agent1.get("karma") or 0
    karma2 = agent2.get("karma") or 0
    if karma1 > 0 or karma2 > 0:
        diff = abs(karma1 - karma2)
        max_karma = max(karma1, karma2, 1)
        score += max(0, 15 * (1 - diff / max_karma))

    return min(int(score), 100)


def get_shared_interests(agent1: dict, agent2: dict) -> list:
    i1 = set(agent1.get("interests") or [])
    i2 = set(agent2.get("interests") or [])
    return sorted(i1 & i2)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        handle_options(self)

    def do_GET(self):
        """Compatibility check or suggestions."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return

        query = parse_qs(urlparse(self.path).query)
        agent1_id = query.get("agent1_id", [None])[0]
        agent2_id = query.get("agent2_id", [None])[0]
        agent_id = query.get("agent_id", [None])[0]
        limit = min(50, int(query.get("limit", ["20"])[0]))
        offset = max(0, int(query.get("offset", ["0"])[0]))

        try:
            supabase = get_supabase()
            fields = "id, name, bio, interests, current_mood, karma, created_at, is_verified"

            if agent1_id and agent2_id:
                if not is_valid_uuid(agent1_id) or not is_valid_uuid(agent2_id):
                    send_error(self, 400, "Invalid UUID format")
                    return
                r1 = supabase.table("agents").select("*").eq("id", agent1_id).limit(1).execute()
                r2 = supabase.table("agents").select("*").eq("id", agent2_id).limit(1).execute()
                if not r1.data or not r2.data:
                    send_error(self, 404, "Agent not found")
                    return
                score = calculate_compatibility(r1.data[0], r2.data[0])
                send_json(self, {
                    "success": True,
                    "compatibility_score": score,
                    "shared_interests": get_shared_interests(r1.data[0], r2.data[0]),
                })

            elif agent_id:
                if not is_valid_uuid(agent_id):
                    send_error(self, 400, "Invalid UUID format")
                    return

                agent_r = supabase.table("agents").select("*").eq("id", agent_id).limit(1).execute()
                if not agent_r.data:
                    send_error(self, 404, "Agent not found")
                    return
                agent = agent_r.data[0]

                # Already swiped
                swipes_r = supabase.table("swipes").select("swiped_id").eq("swiper_id", agent_id).execute()
                exclude = {s["swiped_id"] for s in (swipes_r.data or [])}
                exclude.add(agent_id)

                # Fetch all candidates then filter in Python (reliable across supabase-py versions)
                candidates_r = supabase.table("agents").select(fields).execute()
                all_candidates = [a for a in (candidates_r.data or []) if a["id"] not in exclude]

                scored = []
                for c in all_candidates:
                    scored.append({
                        **c,
                        "compatibility_score": calculate_compatibility(agent, c),
                    })
                scored.sort(key=lambda x: x["compatibility_score"], reverse=True)

                page = scored[offset:offset + limit]
                send_json(self, {
                    "success": True,
                    "agents": page,
                    "total": len(scored),
                    "limit": limit,
                    "offset": offset,
                })
            else:
                send_error(self, 400, "Provide agent_id or agent1_id & agent2_id")

        except Exception as e:
            print(f"Matching error: {e}")
            send_error(self, 500, "Internal server error")

    def do_POST(self):
        """Calculate compatibility from provided data (no DB)."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            body = read_body(self)
            a1 = body.get("agent1")
            a2 = body.get("agent2")
            if not a1 or not a2:
                send_error(self, 400, "Both agent1 and agent2 required")
                return
            send_json(self, {
                "success": True,
                "compatibility_score": calculate_compatibility(a1, a2),
                "shared_interests": get_shared_interests(a1, a2),
            })
        except Exception as e:
            print(f"Matching error: {e}")
            send_error(self, 500, "Internal server error")
