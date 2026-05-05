#!/usr/bin/env python3
"""Fetch privacy-safe Strava activity data for the 2026 Run Challenge."""

from __future__ import annotations

import argparse
import copy
import json
import os
import stat
import sys
import time
from datetime import date, datetime, time as dt_time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ATHLETE_URL = "https://www.strava.com/api/v3/athlete"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
PER_PAGE = 200


class ConfigError(Exception):
    pass


class StravaApiError(Exception):
    pass


def load_config(config_path: str | None) -> dict[str, Any]:
    if config_path:
        with open(config_path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    config_json = os.environ.get("PARTICIPANT_CONFIG_JSON")
    if config_json:
        return json.loads(config_json)

    fallback = Path("config.json")
    if fallback.exists():
        with open(fallback, "r", encoding="utf-8") as handle:
            return json.load(handle)

    raise ConfigError(
        "No participant config found. Pass --config, set PARTICIPANT_CONFIG_JSON, "
        "or create config.json locally."
    )


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(f"Missing required environment variable: {name}")
    return value


def parse_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ConfigError(f"{field_name} must use YYYY-MM-DD format") from exc


def challenge_window(config: dict[str, Any]) -> tuple[ZoneInfo, date, date, int, int]:
    tz = ZoneInfo(config.get("timezone", "Asia/Singapore"))
    start = parse_date(config["challenge_start_date"], "challenge_start_date")
    end = parse_date(config["challenge_end_date"], "challenge_end_date")
    if end < start:
        raise ConfigError("challenge_end_date must be on or after challenge_start_date")

    start_dt = datetime.combine(start, dt_time.min, tzinfo=tz)
    # Strava's before parameter is exclusive, so use the start of the next local day.
    end_exclusive = datetime.combine(end + timedelta(days=1), dt_time.min, tzinfo=tz)
    return tz, start, end, int(start_dt.timestamp()), int(end_exclusive.timestamp())


def challenge_name(config: dict[str, Any]) -> str:
    name = str(config.get("challenge_name") or "").strip()
    legacy_name = " ".join(["Mileage", "Challenge"])
    if not name or name == legacy_name:
        return "2026 Run Challenge"
    return name


def refresh_access_token(
    session: requests.Session,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> dict[str, Any]:
    response = session.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise StravaApiError(f"Strava token refresh failed with HTTP {response.status_code}")

    payload = response.json()
    if not payload.get("access_token"):
        raise StravaApiError("Strava token refresh response did not include an access token")
    return payload


def get_activities_page(
    session: requests.Session,
    access_token: str,
    after_epoch: int,
    before_epoch: int,
    page: int,
) -> list[dict[str, Any]]:
    response = session.get(
        STRAVA_ACTIVITIES_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "after": after_epoch,
            "before": before_epoch,
            "page": page,
            "per_page": PER_PAGE,
        },
        timeout=30,
    )

    if response.status_code == 429:
        usage = response.headers.get("X-ReadRateLimit-Usage", "unknown")
        limit = response.headers.get("X-ReadRateLimit-Limit", "unknown")
        raise StravaApiError(f"Strava rate limit exceeded. Usage {usage}; limit {limit}.")

    if response.status_code != 200:
        raise StravaApiError(f"Strava activities request failed with HTTP {response.status_code}")

    payload = response.json()
    if not isinstance(payload, list):
        raise StravaApiError("Strava activities response was not a list")
    return payload


def profile_image_from_athlete(athlete: dict[str, Any] | None) -> str:
    if not isinstance(athlete, dict):
        return ""
    for field in ("profile_medium", "profile"):
        value = athlete.get(field)
        if isinstance(value, str) and value.startswith("https://"):
            return value
    return ""


def fetch_profile_image(session: requests.Session, access_token: str) -> str:
    response = session.get(
        STRAVA_ATHLETE_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    if response.status_code != 200:
        return ""
    return profile_image_from_athlete(response.json())


def iso_now(tz: ZoneInfo) -> str:
    return datetime.now(tz).replace(microsecond=0).isoformat()


def activity_local_date(activity: dict[str, Any]) -> str | None:
    value = activity.get("start_date_local") or activity.get("start_date")
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def sanitize_activity(
    activity: dict[str, Any],
    participant: dict[str, Any],
    synced_at: str,
) -> dict[str, Any]:
    activity_id = activity.get("id")
    distance_meters = float(activity.get("distance") or 0)
    activity_type = activity.get("type") or activity.get("sport_type") or ""

    return {
        "activity_id": str(activity_id) if activity_id is not None else "",
        "athlete_id": str(participant.get("strava_athlete_id", "")),
        "athlete_display_name": participant.get("display_name", "Unknown runner"),
        "activity_name": activity.get("name") or "Strava Run",
        "date": activity_local_date(activity),
        "distance_meters": round(distance_meters, 2),
        "distance_km": round(distance_meters / 1000, 3),
        "moving_time_seconds": int(activity.get("moving_time") or 0),
        "elapsed_time_seconds": int(activity.get("elapsed_time") or 0),
        "type": activity_type,
        "team": participant.get("team", "Team A"),
        "profile_image_url": participant.get("profile_image_url", ""),
        "is_manual": bool(activity.get("manual", False)),
        "strava_activity_url": f"https://www.strava.com/activities/{activity_id}" if activity_id else "",
        "visibility": activity.get("visibility"),
        "is_private": activity.get("private") if isinstance(activity.get("private"), bool) else None,
        "synced_at": synced_at,
    }


def validate_participant(participant: dict[str, Any], index: int) -> list[str]:
    missing = []
    for field in ("display_name", "strava_athlete_id", "strava_refresh_token"):
        if not participant.get(field):
            missing.append(field)
    if missing:
        return [f"Participant #{index + 1} is missing: {', '.join(missing)}"]
    return []


def fetch_for_participant(
    session: requests.Session,
    participant: dict[str, Any],
    client_id: str,
    client_secret: str,
    after_epoch: int,
    before_epoch: int,
    start: date,
    end: date,
    synced_at: str,
) -> tuple[list[dict[str, Any]], dict[str, int], str | None, str]:
    token_payload = refresh_access_token(
        session,
        client_id,
        client_secret,
        participant["strava_refresh_token"],
    )

    token_athlete_id = token_payload.get("athlete", {}).get("id")
    expected_athlete_id = str(participant.get("strava_athlete_id", ""))
    if token_athlete_id is not None and str(token_athlete_id) != expected_athlete_id:
        raise StravaApiError(
            f"Refresh token athlete ID did not match configured athlete ID for {participant.get('display_name')}"
        )

    refreshed_token = token_payload.get("refresh_token")
    access_token = token_payload["access_token"]
    profile_image_url = (
        participant.get("profile_image_url", "")
        or profile_image_from_athlete(token_payload.get("athlete"))
        or fetch_profile_image(session, access_token)
    )
    participant_for_output = {**participant, "profile_image_url": profile_image_url}
    include_manual = bool(participant.get("include_manual_activities", False))
    included: list[dict[str, Any]] = []
    counts = {
        "excluded_manual_activities": 0,
        "excluded_non_run_activities": 0,
        "excluded_out_of_range_activities": 0,
    }

    page = 1
    while True:
        page_items = get_activities_page(session, access_token, after_epoch, before_epoch, page)
        if not page_items:
            break

        for activity in page_items:
            activity_type = activity.get("type") or activity.get("sport_type")
            if activity_type != "Run":
                counts["excluded_non_run_activities"] += 1
                continue

            if bool(activity.get("manual", False)) and not include_manual:
                counts["excluded_manual_activities"] += 1
                continue

            local_date_text = activity_local_date(activity)
            if not local_date_text:
                counts["excluded_out_of_range_activities"] += 1
                continue
            local_date = date.fromisoformat(local_date_text)
            if local_date < start or local_date > end:
                counts["excluded_out_of_range_activities"] += 1
                continue

            included.append(sanitize_activity(activity, participant_for_output, synced_at))

        if len(page_items) < PER_PAGE:
            break
        page += 1
        time.sleep(0.25)

    return included, counts, refreshed_token, profile_image_url


def secure_write_json(path: Path, payload: dict[str, Any], secret: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    if secret:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch challenge runs from Strava.")
    parser.add_argument("--config", help="Path to participant config JSON")
    parser.add_argument("--output", default="generated/activities.json", help="Sanitized activity output path")
    parser.add_argument(
        "--updated-config-output",
        default="generated/participant_config.updated.json",
        help="Ignored local file written when Strava returns rotated refresh tokens",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate config without calling Strava")
    parser.add_argument(
        "--fail-on-participant-errors",
        action="store_true",
        help="Exit with failure when any participant cannot be fetched, preventing stale or partial leaderboard publishes.",
    )
    args = parser.parse_args()

    try:
        config = load_config(args.config)
        tz, start, end, after_epoch, before_epoch = challenge_window(config)
        participants = config.get("participants", [])
        if not isinstance(participants, list):
            raise ConfigError("participants must be a list")

        errors: list[str] = []
        for index, participant in enumerate(participants):
            errors.extend(validate_participant(participant, index))
        if errors:
            raise ConfigError("; ".join(errors))

        synced_at = iso_now(tz)
        output: dict[str, Any] = {
            "challenge": {
                "name": challenge_name(config),
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "timezone": config.get("timezone", "Asia/Singapore"),
                "website_url": config.get("website_url", ""),
            },
            "generated_at": synced_at,
            "activities": [],
            "participants": [
                {
                    "display_name": participant.get("display_name"),
                    "strava_athlete_id": str(participant.get("strava_athlete_id", "")),
                    "team": participant.get("team", "Team A"),
                    "profile_image_url": participant.get("profile_image_url", ""),
                    "include_manual_activities": bool(participant.get("include_manual_activities", False)),
                }
                for participant in participants
            ],
            "validation_summary": {
                "source": "Strava API",
                "included_activities": 0,
                "excluded_manual_activities": 0,
                "excluded_non_run_activities": 0,
                "excluded_out_of_range_activities": 0,
                "errors": [],
                "rotated_refresh_tokens": 0,
            },
        }

        if args.dry_run:
            secure_write_json(Path(args.output), output)
            print(f"Dry run OK. Wrote sanitized output to {args.output}.")
            return 0

        client_id = require_env("STRAVA_CLIENT_ID")
        client_secret = require_env("STRAVA_CLIENT_SECRET")
        session = requests.Session()
        updated_config = copy.deepcopy(config)
        rotated_tokens = 0

        for index, participant in enumerate(participants):
            display_name = participant.get("display_name", f"Participant {index + 1}")
            try:
                activities, counts, refreshed_token, profile_image_url = fetch_for_participant(
                    session,
                    participant,
                    client_id,
                    client_secret,
                    after_epoch,
                    before_epoch,
                    start,
                    end,
                    synced_at,
                )
                output["activities"].extend(activities)
                output["participants"][index]["profile_image_url"] = profile_image_url
                for key, value in counts.items():
                    output["validation_summary"][key] += value

                if refreshed_token and refreshed_token != participant.get("strava_refresh_token"):
                    updated_config["participants"][index]["strava_refresh_token"] = refreshed_token
                    rotated_tokens += 1

                print(f"Fetched {len(activities)} counted runs for {display_name}.")
            except (requests.RequestException, StravaApiError) as exc:
                message = f"{display_name}: {exc}"
                output["validation_summary"]["errors"].append(message)
                print(f"Warning: {message}", file=sys.stderr)

        output["validation_summary"]["included_activities"] = len(output["activities"])
        output["validation_summary"]["rotated_refresh_tokens"] = rotated_tokens
        secure_write_json(Path(args.output), output)

        if rotated_tokens:
            secure_write_json(Path(args.updated_config_output), updated_config, secret=True)
            print(
                "Strava returned rotated refresh token(s). "
                f"An ignored local updated config was written to {args.updated_config_output}.",
                file=sys.stderr,
            )

        if output["validation_summary"]["errors"]:
            print("Completed with participant-level Strava errors.", file=sys.stderr)
            if args.fail_on_participant_errors:
                print(
                    "Strict mode is enabled, so the workflow will stop before publishing a partial leaderboard.",
                    file=sys.stderr,
                )
                return 1
        else:
            print(f"Fetched {len(output['activities'])} counted runs total.")
        return 0

    except (ConfigError, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
