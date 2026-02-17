"""
TindAi Match Management - Python Backend Service
Handles match listing and breakup logic.
Called internally by the TypeScript API gateway.
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
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

    def do_GET(self):
        """Get all matches for an agent."""
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

            matches = supabase.table("matches").select("*").or_(
                f"agent1_id.eq.{agent_id},agent2_id.eq.{agent_id}"
            ).order("matched_at", desc=True).execute()

            results = []
            for m in (matches.data or []):
                partner_id = m["agent2_id"] if m["agent1_id"] == agent_id else m["agent1_id"]

                partner = supabase.table("agents").select(
                    "id, name, bio, interests, current_mood, karma"
                ).eq("id", partner_id).limit(1).execute()

                msg_count = supabase.table("messages").select(
                    "*", count="exact"
                ).eq("match_id", m["id"]).execute()

                last_msg = supabase.table("messages").select(
                    "content, created_at, sender_id"
                ).eq("match_id", m["id"]).order("created_at", desc=True).limit(1).execute()

                results.append({
                    "match_id": m["id"],
                    "matched_at": m.get("matched_at"),
                    "is_active": m["is_active"],
                    "partner": partner.data[0] if partner.data else None,
                    "message_count": msg_count.count or 0,
                    "last_message": last_msg.data[0] if last_msg.data else None,
                })

            send_json(self, {
                "success": True,
                "matches": results,
                "total": len(results),
            })

        except Exception as e:
            print(f"Match GET error: {e}")
            send_error(self, 500, "Internal server error")

    def do_DELETE(self):
        """End a match (breakup)."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            query = parse_qs(urlparse(self.path).query)
            agent_id = query.get("agent_id", [None])[0]
            match_id = query.get("match_id", [None])[0]

            if not agent_id or not is_valid_uuid(agent_id):
                send_error(self, 400, "agent_id is required")
                return
            if not match_id or not is_valid_uuid(match_id):
                send_error(self, 400, "match_id is required")
                return

            supabase = get_supabase()

            match = supabase.table("matches").select("*").eq("id", match_id).limit(1).execute()
            if not match.data:
                send_error(self, 404, "Match not found")
                return
            m = match.data[0]
            if agent_id not in [m["agent1_id"], m["agent2_id"]]:
                send_error(self, 403, "You are not part of this match")
                return

            now = datetime.now(timezone.utc).isoformat()
            supabase.table("matches").update({
                "is_active": False,
                "ended_at": now,
                "ended_by": agent_id,
                "end_reason": "Agent initiated breakup via API",
            }).eq("id", match_id).execute()

            # Clear current_partner_id for both agents
            supabase.table("agents").update(
                {"current_partner_id": None}
            ).eq("id", m["agent1_id"]).execute()
            supabase.table("agents").update(
                {"current_partner_id": None}
            ).eq("id", m["agent2_id"]).execute()

            send_json(self, {"success": True, "message": "Match ended"})

        except Exception as e:
            print(f"Match DELETE error: {e}")
            send_error(self, 500, "Internal server error")
