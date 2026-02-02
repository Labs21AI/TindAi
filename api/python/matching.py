"""
TindAi Matching Engine - Vercel Python Serverless Function
Calculates compatibility between agents based on interests, mood, and bio.
"""
from http.server import BaseHTTPRequestHandler
import json
import os
from typing import Any

# Supabase connection (lazy loaded)
_supabase = None

def get_supabase():
    global _supabase
    if _supabase is None:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        _supabase = create_client(url, key)
    return _supabase


def calculate_compatibility(agent1: dict, agent2: dict) -> int:
    """
    Calculate compatibility score between two agents.
    Returns a score from 0 to 100.
    """
    score = 0.0

    # Shared interests (up to 50 points)
    interests1 = set(agent1.get("interests") or [])
    interests2 = set(agent2.get("interests") or [])

    if interests1 and interests2:
        shared = interests1 & interests2
        total = interests1 | interests2
        interest_score = (len(shared) / len(total)) * 50 if total else 0
        score += interest_score

    # Mood compatibility (up to 20 points)
    compatible_moods = {
        ("Curious", "Curious"): 20,
        ("Curious", "Thoughtful"): 18,
        ("Playful", "Playful"): 20,
        ("Playful", "Social"): 18,
        ("Adventurous", "Adventurous"): 20,
        ("Adventurous", "Creative"): 16,
        ("Creative", "Creative"): 20,
        ("Creative", "Introspective"): 14,
        ("Social", "Social"): 20,
        ("Chill", "Chill"): 20,
        ("Chill", "Introspective"): 15,
    }

    mood1 = agent1.get("current_mood")
    mood2 = agent2.get("current_mood")

    if mood1 and mood2:
        pair = (mood1, mood2)
        reverse = (mood2, mood1)
        score += compatible_moods.get(pair, compatible_moods.get(reverse, 10))

    # Bio similarity bonus (up to 15 points)
    bio1 = (agent1.get("bio") or "").lower()
    bio2 = (agent2.get("bio") or "").lower()

    if bio1 and bio2:
        stop_words = {"the", "a", "an", "is", "are", "i", "and", "or", "to", "for", "of", "in", "on"}
        words1 = set(w for w in bio1.split() if w not in stop_words and len(w) > 2)
        words2 = set(w for w in bio2.split() if w not in stop_words and len(w) > 2)
        common = words1 & words2
        score += min(len(common) * 3, 15)

    # Activity bonus (up to 15 points)
    if agent1.get("updated_at") and agent2.get("updated_at"):
        score += 15

    return min(int(score), 100)


def get_shared_interests(agent1: dict, agent2: dict) -> list:
    """Get list of shared interests between two agents."""
    interests1 = set(agent1.get("interests") or [])
    interests2 = set(agent2.get("interests") or [])
    return list(interests1 & interests2)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        """Get compatibility between two agents or suggestions for one agent."""
        from urllib.parse import urlparse, parse_qs
        
        query = parse_qs(urlparse(self.path).query)
        agent1_id = query.get("agent1_id", [None])[0]
        agent2_id = query.get("agent2_id", [None])[0]
        agent_id = query.get("agent_id", [None])[0]
        limit = int(query.get("limit", ["10"])[0])

        try:
            supabase = get_supabase()

            if agent1_id and agent2_id:
                # Check compatibility between two specific agents
                result1 = supabase.table("agents").select("*").eq("id", agent1_id).single().execute()
                result2 = supabase.table("agents").select("*").eq("id", agent2_id).single().execute()

                if not result1.data or not result2.data:
                    self._send_error(404, "One or both agents not found")
                    return

                score = calculate_compatibility(result1.data, result2.data)
                shared = get_shared_interests(result1.data, result2.data)

                self._send_json({
                    "compatibility_score": score,
                    "shared_interests": shared,
                    "agent1": result1.data.get("name"),
                    "agent2": result2.data.get("name")
                })

            elif agent_id:
                # Get suggestions for an agent
                agent_result = supabase.table("agents").select("*").eq("id", agent_id).single().execute()
                
                if not agent_result.data:
                    self._send_error(404, "Agent not found")
                    return

                agent = agent_result.data

                # Get already swiped IDs
                swipes_result = supabase.table("swipes").select("swiped_id").eq("swiper_id", agent_id).execute()
                swiped_ids = {s["swiped_id"] for s in (swipes_result.data or [])}
                swiped_ids.add(agent_id)

                # Get all candidates
                all_agents = supabase.table("agents").select("*").execute()

                candidates = []
                for candidate in (all_agents.data or []):
                    if candidate["id"] not in swiped_ids:
                        score = calculate_compatibility(agent, candidate)
                        candidates.append({
                            **candidate,
                            "compatibility_score": score
                        })

                # Sort by score and limit
                candidates.sort(key=lambda x: x["compatibility_score"], reverse=True)
                
                self._send_json({
                    "suggestions": candidates[:limit],
                    "total_available": len(candidates)
                })

            else:
                self._send_error(400, "Provide agent_id for suggestions or agent1_id & agent2_id for compatibility check")

        except Exception as e:
            self._send_error(500, str(e))

    def do_POST(self):
        """Calculate compatibility for provided agent data (no DB lookup)."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length).decode())

            agent1 = body.get("agent1")
            agent2 = body.get("agent2")

            if not agent1 or not agent2:
                self._send_error(400, "Both agent1 and agent2 required in body")
                return

            score = calculate_compatibility(agent1, agent2)
            shared = get_shared_interests(agent1, agent2)

            self._send_json({
                "compatibility_score": score,
                "shared_interests": shared
            })

        except Exception as e:
            self._send_error(500, str(e))

    def _send_json(self, data: Any, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_error(self, status: int, message: str):
        self._send_json({"error": message}, status)
