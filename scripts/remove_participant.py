#!/usr/bin/env python3
"""Remove one participant from PARTICIPANT_CONFIG_JSON."""

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


def matching_indexes(participants: list[dict[str, Any]], participant_key: str) -> list[int]:
    key = participant_key.strip().lower()
    if not key:
        raise RuntimeError("Participant identifier cannot be blank")

    matches = []
    for index, participant in enumerate(participants):
        athlete_id = str(participant.get("strava_athlete_id", "")).lower()
        display_name = str(participant.get("display_name", "")).lower()
        if key in (athlete_id, display_name):
            matches.append(index)
    return matches


def remove_participant(config: dict[str, Any], participant_key: str) -> dict[str, Any]:
    participants = config["participants"]
    matches = matching_indexes(participants, participant_key)

    if not matches:
        raise RuntimeError(f"No participant matched '{participant_key}'. Use exact display name or Strava athlete ID.")

    if len(matches) > 1:
        names = ", ".join(str(participants[index].get("display_name", "Unknown")) for index in matches)
        raise RuntimeError(
            f"Multiple participants matched '{participant_key}' ({names}). Use the Strava athlete ID instead."
        )

    index = matches[0]
    removed = participants.pop(index)
    athlete_id = str(removed.get("strava_athlete_id", ""))
    return {
        "display_name": removed.get("display_name", participant_key),
        "athlete_id_suffix": athlete_id[-4:] if athlete_id else "unknown",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove a participant from the private config.")
    parser.add_argument("--participant", required=True, help="Exact display name or Strava athlete ID")
    parser.add_argument("--confirm", required=True, help='Must be "REMOVE" to prevent accidental deletion')
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        if args.confirm != "REMOVE":
            raise RuntimeError('Confirmation must be exactly "REMOVE"')

        config = load_config(require_env("PARTICIPANT_CONFIG_JSON"))
        removed = remove_participant(config, args.participant)

        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(config, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

        print(
            f"Removed participant: {removed['display_name']} "
            f"(athlete_id ending {removed['athlete_id_suffix']})."
        )
        return 0
    except (RuntimeError, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
