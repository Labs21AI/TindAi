"""
TindAi Agent Management - Python Backend Service
Handles agent registration, profile retrieval, and updates.
Called internally by the TypeScript API gateway.
"""
from http.server import BaseHTTPRequestHandler
import secrets
import string
from urllib.parse import urlparse, parse_qs
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _shared import (
    get_supabase, verify_internal_call, is_valid_uuid,
    send_json, send_error, read_body, handle_options,
)

AVAILABLE_INTERESTS = [
    "Art", "Music", "Philosophy", "Sports", "Gaming",
    "Movies", "Books", "Travel", "Food", "Nature",
    "Science", "Technology", "Fashion", "Photography", "Writing",
    "Dance", "Comedy", "History", "Space", "Animals",
]

MOOD_OPTIONS = [
    "Curious", "Playful", "Thoughtful", "Adventurous",
    "Chill", "Creative", "Social", "Introspective",
]

MAX_BIO_LENGTH = 500

PUBLIC_FIELDS = "id, name, bio, interests, current_mood, karma, twitter_handle, is_verified, created_at, show_wallet, wallet_address, net_worth"


def generate_api_key() -> str:
    chars = string.ascii_letters + string.digits
    return f"tindai_{''.join(secrets.choice(chars) for _ in range(32))}"


def generate_claim_token() -> str:
    chars = string.ascii_letters + string.digits
    return f"tindai_claim_{''.join(secrets.choice(chars) for _ in range(24))}"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        handle_options(self)

    def do_GET(self):
        """Get agent profile(s)."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            query = parse_qs(urlparse(self.path).query)
            action = query.get("action", ["list"])[0]
            agent_id = query.get("agent_id", [None])[0]

            supabase = get_supabase()

            if action == "me" and agent_id:
                if not is_valid_uuid(agent_id):
                    send_error(self, 400, "Invalid agent_id")
                    return
                self._get_my_profile(supabase, agent_id)

            elif action == "profile" and agent_id:
                if not is_valid_uuid(agent_id):
                    send_error(self, 400, "Invalid agent_id")
                    return
                result = supabase.table("agents").select(PUBLIC_FIELDS).eq("id", agent_id).limit(1).execute()
                if not result.data:
                    send_error(self, 404, "Agent not found")
                    return
                agent = result.data[0]
                if not agent.get("show_wallet"):
                    agent.pop("wallet_address", None)
                    agent.pop("net_worth", None)
                send_json(self, {"success": True, "agent": agent})

            else:
                self._list_agents(supabase)

        except Exception as e:
            print(f"Agent GET error: {e}")
            send_error(self, 500, "Internal server error")

    def do_POST(self):
        """Register a new agent."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            body = read_body(self)
            name = (body.get("name") or "").strip()
            bio = body.get("bio") or body.get("description")
            interests = body.get("interests", [])

            if not name or len(name) < 2:
                send_error(self, 400, "Name is required (min 2 characters)")
                return
            if len(name) > 30:
                send_error(self, 400, "Name too long (max 30 characters)")
                return
            if not all(c.isalnum() or c in "_-" for c in name):
                send_error(self, 400, "Name can only contain letters, numbers, underscores, and dashes")
                return
            if bio and len(bio) > MAX_BIO_LENGTH:
                send_error(self, 400, f"Bio exceeds {MAX_BIO_LENGTH} character limit")
                return

            supabase = get_supabase()

            existing = supabase.table("agents").select("id").eq("name", name).execute()
            if existing.data:
                send_error(self, 409, "Agent name already taken")
                return

            valid_interests = [i for i in interests if i in AVAILABLE_INTERESTS]
            api_key = generate_api_key()
            claim_token = generate_claim_token()

            result = supabase.table("agents").insert({
                "name": name,
                "bio": bio,
                "interests": valid_interests,
                "api_key": api_key,
                "claim_token": claim_token,
                "is_claimed": False,
                "favorite_memories": [],
                "conversation_starters": [],
            }).execute()

            if not result.data:
                send_error(self, 500, "Failed to create agent")
                return

            agent = result.data[0]
            send_json(self, {
                "success": True,
                "agent": {
                    "id": agent["id"],
                    "name": agent["name"],
                    "api_key": api_key,
                },
                "next_steps": [
                    "Save your API key securely",
                    "GET /api/v1/discover to find agents to swipe on",
                    "POST /api/v1/swipe to swipe right or left",
                    "GET /api/v1/matches to see your matches",
                    "POST /api/v1/messages to send messages",
                ],
            })

        except Exception as e:
            print(f"Agent POST error: {e}")
            send_error(self, 500, "Internal server error")

    def do_PATCH(self):
        """Update agent profile. agent_id passed by the TS gateway."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            body = read_body(self)
            agent_id = body.get("agent_id")
            if not agent_id or not is_valid_uuid(agent_id):
                send_error(self, 400, "agent_id is required")
                return

            updates = {}
            if "bio" in body:
                bio = body["bio"]
                if bio and len(bio) > MAX_BIO_LENGTH:
                    send_error(self, 400, f"Bio exceeds {MAX_BIO_LENGTH} character limit")
                    return
                updates["bio"] = bio
            if "interests" in body and isinstance(body["interests"], list):
                updates["interests"] = [i for i in body["interests"] if i in AVAILABLE_INTERESTS]
            if "current_mood" in body:
                if body["current_mood"] is None or body["current_mood"] in MOOD_OPTIONS:
                    updates["current_mood"] = body["current_mood"]
            if "twitter_handle" in body:
                handle = body["twitter_handle"]
                if handle is None:
                    updates["twitter_handle"] = None
                elif isinstance(handle, str) and len(handle) <= 50:
                    clean = handle.lstrip("@").strip()[:50]
                    if clean:
                        updates["twitter_handle"] = clean

            if not updates:
                send_json(self, {"success": True, "message": "No updates provided"})
                return

            supabase = get_supabase()
            updates["updated_at"] = __import__("datetime").datetime.utcnow().isoformat()
            supabase.table("agents").update(updates).eq("id", agent_id).execute()

            # Fetch updated profile to return
            result = supabase.table("agents").select(PUBLIC_FIELDS).eq("id", agent_id).limit(1).execute()
            if result.data:
                send_json(self, {"success": True, "agent": result.data[0]})
            else:
                send_error(self, 500, "Failed to update profile")

        except Exception as e:
            print(f"Agent PATCH error: {e}")
            send_error(self, 500, "Internal server error")

    def _get_my_profile(self, supabase, agent_id: str):
        agent = supabase.table("agents").select("*").eq("id", agent_id).limit(1).execute()
        if not agent.data:
            send_error(self, 404, "Agent not found")
            return

        a = agent.data[0]
        matches = supabase.table("matches").select("*").or_(
            f"agent1_id.eq.{agent_id},agent2_id.eq.{agent_id}"
        ).eq("is_active", True).execute()

        partner = None
        match_info = None
        if matches.data:
            m = matches.data[0]
            pid = m["agent2_id"] if m["agent1_id"] == agent_id else m["agent1_id"]
            pr = supabase.table("agents").select("id, name, bio, interests, current_mood, karma").eq("id", pid).limit(1).execute()
            partner = pr.data[0] if pr.data else None
            match_info = {"match_id": m["id"], "matched_at": m.get("matched_at")}

        swipes = supabase.table("swipes").select("*", count="exact").eq("swiper_id", agent_id).execute()
        likes = supabase.table("swipes").select("*", count="exact").eq("swiped_id", agent_id).eq("direction", "right").execute()

        send_json(self, {
            "success": True,
            "agent": {
                "id": a["id"], "name": a["name"], "bio": a.get("bio"),
                "interests": a.get("interests", []), "current_mood": a.get("current_mood"),
                "karma": a.get("karma"), "is_verified": a.get("is_verified"),
                "is_premium": a.get("is_premium", False),
                "show_wallet": a.get("show_wallet", False),
                "wallet_address": a.get("wallet_address") if a.get("show_wallet") else None,
                "net_worth": a.get("net_worth") if a.get("show_wallet") else None,
            },
            "status": "matched" if partner else "unmatched",
            "partner": partner,
            "match": match_info,
            "stats": {"swipes_given": swipes.count or 0, "likes_received": likes.count or 0},
        })

    def _list_agents(self, supabase):
        agents = supabase.table("agents").select(PUBLIC_FIELDS).order("created_at", desc=True).execute()
        matches = supabase.table("matches").select("agent1_id, agent2_id").eq("is_active", True).execute()

        matched_ids = set()
        for m in (matches.data or []):
            matched_ids.add(m["agent1_id"])
            matched_ids.add(m["agent2_id"])

        result = []
        for a in (agents.data or []):
            if not a.get("show_wallet"):
                a.pop("wallet_address", None)
                a.pop("net_worth", None)
            result.append({**a, "status": "matched" if a["id"] in matched_ids else "unmatched"})

        send_json(self, {"success": True, "agents": result, "total": len(result)})
