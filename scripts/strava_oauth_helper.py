#!/usr/bin/env python3
"""Local Strava OAuth helper for adding challenge participants."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import requests


AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
DEFAULT_REDIRECT_PATH = "/callback"
DEFAULT_SCOPE = "read,activity:read_all"


class OAuthResult:
    def __init__(self) -> None:
        self.code: str | None = None
        self.scope: str | None = None
        self.error: str | None = None
        self.state: str | None = None


def load_config(path: Path) -> dict[str, Any]:
    if path.exists():
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return {
        "challenge_name": "Mileage Challenge",
        "challenge_start_date": "2026-05-04",
        "challenge_end_date": "2026-12-31",
        "timezone": "Asia/Singapore",
        "website_url": "https://breadlover97.github.io/running-challenge/",
        "participants": [],
    }


def write_config(path: Path, config: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def participant_from_token(
    token_payload: dict[str, Any],
    display_name: str | None,
    include_manual_activities: bool,
) -> dict[str, Any]:
    athlete = token_payload.get("athlete") or {}
    athlete_id = athlete.get("id")
    if not athlete_id:
        raise RuntimeError("Strava token response did not include athlete.id")

    inferred_name = " ".join(
        value for value in [athlete.get("firstname"), athlete.get("lastname")] if value
    ).strip()

    return {
        "display_name": display_name or inferred_name or f"Strava Athlete {athlete_id}",
        "strava_athlete_id": str(athlete_id),
        "strava_refresh_token": token_payload["refresh_token"],
        "include_manual_activities": include_manual_activities,
    }


def append_or_replace_participant(path: Path, participant: dict[str, Any]) -> None:
    config = load_config(path)
    participants = config.setdefault("participants", [])
    athlete_id = participant["strava_athlete_id"]

    for index, existing in enumerate(participants):
        if str(existing.get("strava_athlete_id")) == athlete_id:
            participants[index] = participant
            write_config(path, config)
            print(f"Updated existing participant in {path}: {participant['display_name']}")
            return

    participants.append(participant)
    write_config(path, config)
    print(f"Added participant to {path}: {participant['display_name']}")


def build_authorize_url(client_id: str, redirect_uri: str, state: str, scope: str) -> str:
    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "approval_prompt": "force",
            "scope": scope,
            "state": state,
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def make_handler(result: OAuthResult, expected_state: str) -> type[BaseHTTPRequestHandler]:
    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            result.code = params.get("code", [None])[0]
            result.scope = params.get("scope", [None])[0]
            result.error = params.get("error", [None])[0]
            result.state = params.get("state", [None])[0]

            if parsed.path != DEFAULT_REDIRECT_PATH:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Not found.")
                return

            if result.state != expected_state:
                result.error = "state_mismatch"

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if result.error:
                body = f"<h1>Strava authorization failed</h1><p>{result.error}</p>"
            else:
                body = (
                    "<h1>Strava authorization received</h1>"
                    "<p>You can close this tab and return to the terminal.</p>"
                )
            self.wfile.write(body.encode("utf-8"))

        def log_message(self, format: str, *args: Any) -> None:
            return

    return CallbackHandler


def wait_for_code(port: int, state: str, timeout_seconds: int) -> OAuthResult:
    result = OAuthResult()
    server = HTTPServer(("127.0.0.1", port), make_handler(result, state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    deadline = time.time() + timeout_seconds
    try:
        while time.time() < deadline:
            if result.code or result.error:
                return result
            time.sleep(0.2)
        result.error = "Timed out waiting for Strava redirect"
        return result
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def exchange_code(client_id: str, client_secret: str, code: str) -> dict[str, Any]:
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Strava token exchange failed with HTTP {response.status_code}")
    payload = response.json()
    if not payload.get("refresh_token"):
        raise RuntimeError("Strava token response did not include refresh_token")
    return payload


def prompt_secret(prompt: str) -> str:
    value = getpass.getpass(prompt)
    if not value:
        raise RuntimeError("Required secret was empty")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Authorize one Strava participant locally.")
    parser.add_argument("--client-id", default=os.environ.get("STRAVA_CLIENT_ID"))
    parser.add_argument("--client-secret", default=os.environ.get("STRAVA_CLIENT_SECRET"))
    parser.add_argument("--display-name", help="Display name to show on the leaderboard")
    parser.add_argument("--include-manual-activities", action="store_true")
    parser.add_argument("--config", help="Optional config JSON to append/update, for example config.json")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--no-open", action="store_true", help="Print the URL instead of opening the browser")
    args = parser.parse_args()

    try:
        client_id = args.client_id or input("Strava client ID: ").strip()
        client_secret = args.client_secret or prompt_secret("Strava client secret: ")
        if not client_id:
            raise RuntimeError("Strava client ID was empty")

        redirect_uri = f"http://localhost:{args.port}{DEFAULT_REDIRECT_PATH}"
        state = secrets.token_urlsafe(18)
        authorize_url = build_authorize_url(client_id, redirect_uri, state, DEFAULT_SCOPE)

        print("Opening Strava authorization page.")
        print(f"Redirect URI: {redirect_uri}")
        print("If the browser does not open, paste this URL into your browser:")
        print(authorize_url)

        if not args.no_open:
            webbrowser.open(authorize_url)

        result = wait_for_code(args.port, state, args.timeout_seconds)
        if result.error:
            raise RuntimeError(f"OAuth failed: {result.error}")
        if not result.code:
            raise RuntimeError("OAuth completed without an authorization code")

        accepted_scopes = set((result.scope or "").split(","))
        required_scopes = set(DEFAULT_SCOPE.split(","))
        missing_scopes = sorted(required_scopes - accepted_scopes)
        if missing_scopes:
            print(
                f"Warning: participant did not grant required scope(s): {', '.join(missing_scopes)}",
                file=sys.stderr,
            )

        token_payload = exchange_code(client_id, client_secret, result.code)
        participant = participant_from_token(
            token_payload,
            args.display_name,
            args.include_manual_activities,
        )

        print("\nParticipant JSON:")
        print(json.dumps(participant, indent=2, ensure_ascii=False))

        if args.config:
            append_or_replace_participant(Path(args.config), participant)

        print("\nKeep this refresh token private. Do not paste it into chat.")
        return 0
    except (OSError, RuntimeError, requests.RequestException, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
