#!/usr/bin/env python3
"""Exchange a Strava OAuth code and add the athlete to participant config."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests


TOKEN_URL = "https://www.strava.com/oauth/token"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config(config_json: str) -> dict[str, Any]:
    config = json.loads(config_json)
    participants = config.setdefault("participants", [])
    if not isinstance(participants, list):
        raise RuntimeError("participants must be a list")
    return config


def exchange_code(client_id: str, client_secret: str, code: str) -> dict[str, Any]:
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code.strip(),
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Strava code exchange failed with HTTP {response.status_code}. "
            "The code may be expired, already used, or copied incorrectly."
        )

    payload = response.json()
    if not payload.get("refresh_token"):
        raise RuntimeError("Strava response did not include a refresh token")
    if not payload.get("athlete", {}).get("id"):
        raise RuntimeError("Strava response did not include athlete.id")
    return payload


def display_name_from_payload(payload: dict[str, Any], requested_name: str | None) -> str:
    if requested_name:
        return requested_name.strip()
    athlete = payload.get("athlete", {})
    inferred_name = " ".join(
        value for value in [athlete.get("firstname"), athlete.get("lastname")] if value
    ).strip()
    return inferred_name or f"Strava Athlete {athlete.get('id')}"


def upsert_participant(config: dict[str, Any], participant: dict[str, Any]) -> str:
    participants = config.setdefault("participants", [])
    athlete_id = participant["strava_athlete_id"]
    for index, existing in enumerate(participants):
        if str(existing.get("strava_athlete_id")) == athlete_id:
            participants[index] = participant
            return "updated"
    participants.append(participant)
    return "added"


def main() -> int:
    parser = argparse.ArgumentParser(description="Add a Strava participant from an OAuth code.")
    parser.add_argument("--code", required=True, help="One-time Strava authorization code")
    parser.add_argument("--display-name", required=True, help="Leaderboard display name")
    parser.add_argument("--source-label", default="Strava App", help='Example: "Garmin → Strava"')
    parser.add_argument("--team", choices=["Team A", "Team B"], default="Team A")
    parser.add_argument("--include-manual-activities", action="store_true")
    parser.add_argument("--output", required=True, help="Updated participant config output path")
    args = parser.parse_args()

    try:
        config = load_config(require_env("PARTICIPANT_CONFIG_JSON"))
        token_payload = exchange_code(
            require_env("STRAVA_CLIENT_ID"),
            require_env("STRAVA_CLIENT_SECRET"),
            args.code,
        )
        athlete_id = str(token_payload["athlete"]["id"])
        participant = {
            "display_name": display_name_from_payload(token_payload, args.display_name),
            "strava_athlete_id": athlete_id,
            "strava_refresh_token": token_payload["refresh_token"],
            "team": args.team,
            "source_label": args.source_label.strip() or "Strava App",
            "include_manual_activities": bool(args.include_manual_activities),
        }
        action = upsert_participant(config, participant)

        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(config, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        print(
            f"Participant {action}: {participant['display_name']} "
            f"(athlete_id ending {athlete_id[-4:]})"
        )
        return 0
    except (RuntimeError, requests.RequestException, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
