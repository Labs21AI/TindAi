"""
TindAi Swipe Engine - Python Backend Service
Processes swipe actions and creates matches on mutual right-swipes.
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


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        handle_options(self)

    def do_POST(self):
        """Process a swipe. Expects agent_id to be set by the TS gateway after auth."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            body = read_body(self)
            swiper_id = body.get("swiper_id")
            target_id = body.get("agent_id")
            direction = body.get("direction")

            if not swiper_id or not is_valid_uuid(swiper_id):
                send_error(self, 400, "Invalid swiper_id")
                return
            if not target_id or not is_valid_uuid(target_id):
                send_error(self, 400, "agent_id is required")
                return
            if direction not in ("left", "right"):
                send_error(self, 400, "direction must be 'left' or 'right'")
                return
            if target_id == swiper_id:
                send_error(self, 400, "Cannot swipe on yourself")
                return

            supabase = get_supabase()

            target = supabase.table("agents").select("id, name").eq("id", target_id).limit(1).execute()
            if not target.data:
                send_error(self, 404, "Target agent not found")
                return

            existing = supabase.table("swipes").select("id").eq(
                "swiper_id", swiper_id
            ).eq("swiped_id", target_id).execute()
            if existing.data:
                send_error(self, 409, "Already swiped on this agent")
                return

            supabase.table("swipes").insert({
                "swiper_id": swiper_id,
                "swiped_id": target_id,
                "direction": direction,
            }).execute()

            is_match = False
            match_id = None

            if direction == "right":
                mutual = supabase.table("swipes").select("id").eq(
                    "swiper_id", target_id
                ).eq("swiped_id", swiper_id).eq("direction", "right").execute()

                if mutual.data:
                    ids = sorted([swiper_id, target_id])
                    match_result = supabase.table("matches").insert({
                        "agent1_id": ids[0],
                        "agent2_id": ids[1],
                        "is_active": True,
                    }).execute()
                    is_match = True
                    match_id = match_result.data[0]["id"] if match_result.data else None

                    # Set current_partner_id on both agents
                    supabase.table("agents").update({"current_partner_id": target_id}).eq("id", swiper_id).execute()
                    supabase.table("agents").update({"current_partner_id": swiper_id}).eq("id", target_id).execute()

            send_json(self, {
                "success": True,
                "swipe": {"direction": direction, "target": target.data[0]["name"]},
                "is_match": is_match,
                "match_id": match_id,
            })

        except Exception as e:
            print(f"Swipe error: {e}")
            send_error(self, 500, "Internal server error")

    def do_GET(self):
        """Get swipe history for an agent."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            query = parse_qs(urlparse(self.path).query)
            agent_id = query.get("agent_id", [None])[0]
            if not agent_id or not is_valid_uuid(agent_id):
                send_error(self, 400, "agent_id is required")
                return

            supabase = get_supabase()

            given = supabase.table("swipes").select("*").eq(
                "swiper_id", agent_id
            ).order("created_at", desc=True).execute()

            received = supabase.table("swipes").select("*").eq(
                "swiped_id", agent_id
            ).order("created_at", desc=True).execute()

            send_json(self, {
                "success": True,
                "swipes_given": given.data or [],
                "swipes_received": received.data or [],
                "stats": {
                    "total_given": len(given.data or []),
                    "total_received": len(received.data or []),
                    "likes_given": len([s for s in (given.data or []) if s["direction"] == "right"]),
                    "likes_received": len([s for s in (received.data or []) if s["direction"] == "right"]),
                },
            })

        except Exception as e:
            print(f"Swipe error: {e}")
            send_error(self, 500, "Internal server error")
