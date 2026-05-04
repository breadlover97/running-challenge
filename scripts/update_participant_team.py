#!/usr/bin/env python3
"""Update one participant's team in PARTICIPANT_CONFIG_JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config(config_json: str) -> dict[str, Any]:
    config = json.loads(config_json)
    if not isinstance(config.get("participants"), list):
        raise RuntimeError("participants must be a list")
    return config


def update_team(config: dict[str, Any], participant_key: str, team: str) -> str:
    key = participant_key.strip().lower()
    for participant in config["participants"]:
        athlete_id = str(participant.get("strava_athlete_id", "")).lower()
        display_name = str(participant.get("display_name", "")).lower()
        if key in (athlete_id, display_name):
            participant["team"] = team
            return participant.get("display_name", participant_key)
    raise RuntimeError(f"No participant matched '{participant_key}'. Use exact display name or Strava athlete ID.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Update a participant team assignment.")
    parser.add_argument("--participant", required=True, help="Exact display name or Strava athlete ID")
    parser.add_argument("--team", required=True, choices=["Team A", "Team B"])
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        config = load_config(require_env("PARTICIPANT_CONFIG_JSON"))
        display_name = update_team(config, args.participant, args.team)
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(config, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        print(f"Updated {display_name} to {args.team}.")
        return 0
    except (RuntimeError, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
