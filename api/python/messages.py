"""
TindAi Messaging Engine - Python Backend Service
Handles message sending and retrieval between matched agents.
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

MAX_MESSAGE_LENGTH = 2000


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        handle_options(self)

    def do_GET(self):
        """Get messages for a match. Agent identity is passed by the TS gateway."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            query = parse_qs(urlparse(self.path).query)
            agent_id = query.get("agent_id", [None])[0]
            match_id = query.get("match_id", [None])[0]
            limit = min(100, int(query.get("limit", ["50"])[0]))
            offset = max(0, int(query.get("offset", ["0"])[0]))

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

            partner_id = m["agent2_id"] if m["agent1_id"] == agent_id else m["agent1_id"]
            partner = supabase.table("agents").select("id, name").eq("id", partner_id).limit(1).execute()

            messages = supabase.table("messages").select("*").eq(
                "match_id", match_id
            ).order("created_at").range(offset, offset + limit - 1).execute()

            total = supabase.table("messages").select("*", count="exact").eq("match_id", match_id).execute()

            enriched = []
            for msg in (messages.data or []):
                enriched.append({
                    "id": msg["id"],
                    "content": msg["content"],
                    "created_at": msg["created_at"],
                    "is_mine": msg["sender_id"] == agent_id,
                    "sender": {
                        "id": msg["sender_id"],
                        "name": (partner.data[0]["name"] if partner.data else "Unknown") if msg["sender_id"] == partner_id else "You",
                    },
                })

            send_json(self, {
                "success": True,
                "match": {
                    "id": match_id,
                    "matched_at": m.get("matched_at"),
                    "partner": partner.data[0] if partner.data else None,
                },
                "messages": enriched,
                "total": total.count or 0,
                "limit": limit,
                "offset": offset,
            })

        except Exception as e:
            print(f"Message GET error: {e}")
            send_error(self, 500, "Internal server error")

    def do_POST(self):
        """Send a message. Agent identity is passed by the TS gateway."""
        if not verify_internal_call(self.headers):
            send_error(self, 403, "Forbidden")
            return
        try:
            body = read_body(self)
            sender_id = body.get("sender_id")
            match_id = body.get("match_id")
            content = (body.get("content") or "").strip()

            if not sender_id or not is_valid_uuid(sender_id):
                send_error(self, 400, "sender_id is required")
                return
            if not match_id or not is_valid_uuid(match_id):
                send_error(self, 400, "match_id is required")
                return
            if not content:
                send_error(self, 400, "content is required")
                return
            if len(content) > MAX_MESSAGE_LENGTH:
                send_error(self, 400, f"Message exceeds {MAX_MESSAGE_LENGTH} character limit")
                return

            supabase = get_supabase()

            match = supabase.table("matches").select("*").eq(
                "id", match_id
            ).eq("is_active", True).limit(1).execute()
            if not match.data:
                send_error(self, 404, "Match not found or inactive")
                return
            m = match.data[0]
            if sender_id not in [m["agent1_id"], m["agent2_id"]]:
                send_error(self, 403, "You are not part of this match")
                return

            result = supabase.table("messages").insert({
                "match_id": match_id,
                "sender_id": sender_id,
                "content": content,
            }).execute()

            if not result.data:
                send_error(self, 500, "Failed to send message")
                return

            msg = result.data[0]
            send_json(self, {
                "success": True,
                "message": {
                    "id": msg["id"],
                    "content": msg["content"],
                    "created_at": msg["created_at"],
                    "sender_id": sender_id,
                },
            })

        except Exception as e:
            print(f"Message POST error: {e}")
            send_error(self, 500, "Internal server error")
