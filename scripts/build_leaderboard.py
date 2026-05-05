#!/usr/bin/env python3
"""Build the public leaderboard JSON from sanitized Strava activity data."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def load_json(path: Path, required: bool = True) -> dict[str, Any]:
    if not path.exists():
        if required:
            raise FileNotFoundError(f"Missing required file: {path}")
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def one_decimal(value: float | int | None) -> float:
    return round(float(value or 0), 1)


def team_name(value: Any) -> str:
    return "Team B" if value == "Team B" else "Team A"


def generated_date(generated_at: str | None, timezone_name: str, override: str | None) -> str:
    if override:
        return override
    tz = ZoneInfo(timezone_name)
    if generated_at:
        try:
            return datetime.fromisoformat(generated_at).astimezone(tz).date().isoformat()
        except ValueError:
            pass
    return datetime.now(tz).date().isoformat()


def previous_ranks(previous: dict[str, Any]) -> dict[str, int]:
    ranks = {}
    for row in previous.get("leaderboard", []):
        key = str(row.get("athlete_id") or row.get("display_name") or "")
        if key and row.get("rank"):
            ranks[key] = int(row["rank"])
    return ranks


def public_activity(activity: dict[str, Any]) -> dict[str, Any]:
    return {
        "activity_id": str(activity.get("activity_id", "")),
        "date": activity.get("date"),
        "activity_name": activity.get("activity_name", "Strava Run"),
        "distance_km": one_decimal(activity.get("distance_km")),
        "moving_time_seconds": int(activity.get("moving_time_seconds") or 0),
        "elapsed_time_seconds": int(activity.get("elapsed_time_seconds") or 0),
        "team": team_name(activity.get("team")),
        "is_manual": bool(activity.get("is_manual", False)),
        "strava_activity_url": activity.get("strava_activity_url", ""),
        "visibility": activity.get("visibility"),
        "is_private": activity.get("is_private"),
    }


def build_leaderboard(raw: dict[str, Any], previous: dict[str, Any], today: str) -> dict[str, Any]:
    challenge = raw.get("challenge", {})
    participants = raw.get("participants", [])
    activities = raw.get("activities", [])
    previous_rank_by_key = previous_ranks(previous)

    runners: dict[str, dict[str, Any]] = {}
    for participant in participants:
        athlete_id = str(participant.get("strava_athlete_id", ""))
        if not athlete_id:
            continue
        runners[athlete_id] = {
            "athlete_id": athlete_id,
            "display_name": participant.get("display_name", "Unknown runner"),
            "team": team_name(participant.get("team")),
            "total_distance_raw": 0.0,
            "total_runs": 0,
            "latest_activity_date": None,
            "distance_added_today_raw": 0.0,
            "daily_distance_raw": defaultdict(float),
            "longest_run": None,
            "last_synced_at": None,
            "activities": [],
        }

    for activity in activities:
        athlete_id = str(activity.get("athlete_id", ""))
        if athlete_id not in runners:
            runners[athlete_id] = {
                "athlete_id": athlete_id,
                "display_name": activity.get("athlete_display_name", "Unknown runner"),
                "team": team_name(activity.get("team")),
                "total_distance_raw": 0.0,
                "total_runs": 0,
                "latest_activity_date": None,
                "distance_added_today_raw": 0.0,
                "daily_distance_raw": defaultdict(float),
                "longest_run": None,
                "last_synced_at": None,
                "activities": [],
            }

        runner = runners[athlete_id]
        distance = float(activity.get("distance_km") or 0)
        activity_date = activity.get("date")
        synced_at = activity.get("synced_at")
        public = public_activity(activity)

        runner["total_distance_raw"] += distance
        runner["total_runs"] += 1
        runner["activities"].append(public)
        if activity_date:
            runner["daily_distance_raw"][activity_date] += distance
            if runner["latest_activity_date"] is None or activity_date > runner["latest_activity_date"]:
                runner["latest_activity_date"] = activity_date
        if activity_date == today:
            runner["distance_added_today_raw"] += distance
        if synced_at and (runner["last_synced_at"] is None or synced_at > runner["last_synced_at"]):
            runner["last_synced_at"] = synced_at
        if runner["longest_run"] is None or distance > float(runner["longest_run"]["distance_km"]):
            runner["longest_run"] = {
                "date": activity_date,
                "activity_name": activity.get("activity_name", "Strava Run"),
                "distance_km": one_decimal(distance),
                "strava_activity_url": activity.get("strava_activity_url", ""),
            }

    rows = []
    for runner in runners.values():
        sorted_activities = sorted(
            runner["activities"],
            key=lambda item: (item.get("date") or "", item.get("activity_id") or ""),
            reverse=True,
        )
        daily_distance = {
            day: one_decimal(distance)
            for day, distance in sorted(runner["daily_distance_raw"].items())
        }
        rows.append(
            {
                "rank": None,
                "rank_change": None,
                "athlete_id": runner["athlete_id"],
                "display_name": runner["display_name"],
                "team": runner["team"],
                "total_distance_km": one_decimal(runner["total_distance_raw"]),
                "distance_added_today_km": one_decimal(runner["distance_added_today_raw"]),
                "total_runs": runner["total_runs"],
                "latest_activity_date": runner["latest_activity_date"],
                "daily_distance_km": daily_distance,
                "longest_run": runner["longest_run"],
                "last_synced_at": runner["last_synced_at"] or raw.get("generated_at"),
                "activities": sorted_activities,
            }
        )

    rows.sort(key=lambda item: (-item["total_distance_km"], item["display_name"].lower()))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
        previous_rank = previous_rank_by_key.get(row["athlete_id"]) or previous_rank_by_key.get(row["display_name"])
        row["rank_change"] = previous_rank - index if previous_rank else None

    todays_runners = [
        {
            "display_name": row["display_name"],
            "team": row["team"],
            "distance_km": row["distance_added_today_km"],
        }
        for row in rows
        if row["distance_added_today_km"] > 0
    ]
    todays_runners.sort(key=lambda item: (-item["distance_km"], item["display_name"].lower()))

    biggest_mover = todays_runners[0] if todays_runners else None
    total_today = one_decimal(sum(item["distance_km"] for item in todays_runners))
    validation = raw.get("validation_summary", {})
    team_summary = {}
    for name in ("Team A", "Team B"):
        team_rows = [row for row in rows if row["team"] == name]
        team_summary[name] = {
            "team": name,
            "total_distance_km": one_decimal(sum(row["total_distance_km"] for row in team_rows)),
            "total_runs": sum(row["total_runs"] for row in team_rows),
            "participant_count": len(team_rows),
            "participants": sorted(
                [
                    {
                        "rank": row["rank"],
                        "display_name": row["display_name"],
                        "total_distance_km": row["total_distance_km"],
                        "distance_added_today_km": row["distance_added_today_km"],
                        "total_runs": row["total_runs"],
                        "latest_activity_date": row["latest_activity_date"],
                    }
                    for row in team_rows
                ],
                key=lambda item: (-item["total_distance_km"], item["display_name"].lower()),
            ),
        }

    participants_map = {
        row["athlete_id"]: {
            "display_name": row["display_name"],
            "team": row["team"],
            "activities": row["activities"],
        }
        for row in rows
    }

    return {
        "challenge": {
            "name": challenge.get("name", "Mileage Challenge"),
            "start_date": challenge.get("start_date", "2026-05-04"),
            "end_date": challenge.get("end_date", "2026-12-31"),
            "timezone": challenge.get("timezone", "Asia/Singapore"),
            "website_url": challenge.get("website_url", ""),
        },
        "generated_at": raw.get("generated_at"),
        "team_summary": team_summary,
        "leaderboard": rows,
        "participants": participants_map,
        "daily_summary": {
            "date": today,
            "total_distance_km": total_today,
            "total_runs": sum(1 for activity in activities if activity.get("date") == today),
            "runners": todays_runners,
            "biggest_mover": biggest_mover,
        },
        "validation_summary": {
            "source": validation.get("source", "Strava API"),
            "included_activities": int(validation.get("included_activities", len(activities)) or 0),
            "excluded_manual_activities": int(validation.get("excluded_manual_activities", 0) or 0),
            "excluded_non_run_activities": int(validation.get("excluded_non_run_activities", 0) or 0),
            "excluded_out_of_range_activities": int(validation.get("excluded_out_of_range_activities", 0) or 0),
            "errors": validation.get("errors", []),
            "rotated_refresh_tokens": int(validation.get("rotated_refresh_tokens", 0) or 0),
            "privacy": [
                "Only Run activities inside the challenge date range are counted.",
                "Manual activities are excluded unless explicitly allowed.",
                "GPS maps, coordinates, heart rate, cadence, and power are not stored or displayed.",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build data/leaderboard.json.")
    parser.add_argument("--input", default="generated/activities.json", help="Sanitized activity input path")
    parser.add_argument("--output", default="data/leaderboard.json", help="Public leaderboard JSON path")
    parser.add_argument("--today", help="Override current challenge date as YYYY-MM-DD")
    args = parser.parse_args()

    try:
        input_path = Path(args.input)
        output_path = Path(args.output)
        raw = load_json(input_path)
        previous = load_json(output_path, required=False)
        timezone_name = raw.get("challenge", {}).get("timezone", "Asia/Singapore")
        today = generated_date(raw.get("generated_at"), timezone_name, args.today)
        payload = build_leaderboard(raw, previous, today)
        write_json(output_path, payload)
        print(f"Wrote leaderboard with {len(payload['leaderboard'])} participant(s) to {output_path}.")
        return 0
    except (FileNotFoundError, json.JSONDecodeError, OSError, KeyError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
