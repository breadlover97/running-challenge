#!/usr/bin/env python3
"""Send the daily 2026 Run Challenge update to Telegram."""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

import requests


TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"
MAX_LEADERBOARD_ROWS = 12
MAX_RECENT_ROWS = 8


def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return load_json(path)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def format_date(value: str | None) -> str:
    if not value:
        return "Unknown date"
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return value
    return f"{parsed.day} {parsed.strftime('%B %Y')}"


def fmt_km(value: Any) -> str:
    return f"{float(value or 0):.1f}km"


def one_decimal(value: Any) -> float:
    return round(float(value or 0), 1)


def e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def runner_key(row: dict[str, Any]) -> str:
    return str(row.get("athlete_id") or row.get("display_name") or "")


def previous_runner_map(previous: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        runner_key(row): row
        for row in previous.get("leaderboard", [])
        if runner_key(row)
    }


def activity_ids(row: dict[str, Any]) -> set[str]:
    ids = set(row.get("activity_ids", []))
    ids.update(str(activity.get("activity_id")) for activity in row.get("activities", []) if activity.get("activity_id"))
    return ids


def distance_since_last_update(row: dict[str, Any], previous_by_runner: dict[str, dict[str, Any]]) -> float:
    previous = previous_by_runner.get(runner_key(row), {})
    return one_decimal(float(row.get("total_distance_km") or 0) - float(previous.get("total_distance_km") or 0))


def runners_since_last_update(data: dict[str, Any], previous: dict[str, Any]) -> list[dict[str, Any]]:
    previous_by_runner = previous_runner_map(previous)
    rows = []
    for row in data.get("leaderboard", []):
        previous = previous_by_runner.get(runner_key(row), {})
        previous_ids = activity_ids(previous)
        recent_activities = [
            activity
            for activity in row.get("activities", [])
            if str(activity.get("activity_id") or "") not in previous_ids
        ]
        distance_delta = distance_since_last_update(row, previous_by_runner)
        if distance_delta <= 0 and not recent_activities:
            continue
        rows.append(
            {
                "display_name": row.get("display_name", "Runner"),
                "team": row.get("team", "Team A"),
                "distance_km": max(distance_delta, 0.0),
                "run_count": len(recent_activities),
            }
        )
    rows.sort(key=lambda item: (-item["distance_km"], item["display_name"].lower()))
    return rows


def build_state(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "sent_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "leaderboard_generated_at": data.get("generated_at"),
        "leaderboard": [
            {
                "athlete_id": row.get("athlete_id"),
                "display_name": row.get("display_name"),
                "team": row.get("team"),
                "total_distance_km": row.get("total_distance_km"),
                "activity_ids": sorted(activity_ids(row)),
            }
            for row in data.get("leaderboard", [])
        ],
    }


def build_message(data: dict[str, Any], previous: dict[str, Any] | None = None) -> str:
    challenge = data.get("challenge", {})
    leaderboard = data.get("leaderboard", [])
    daily = data.get("daily_summary", {})
    website_url = challenge.get("website_url") or ""
    previous_by_runner = previous_runner_map(previous or {})
    recent_runners = runners_since_last_update(data, previous or {})

    lines = [
        f"🏃 <b>{e(challenge.get('name', '2026 Run Challenge'))} Daily Update</b>",
        f"Date: {e(format_date(daily.get('date')))}",
        "",
        "<b>Team totals:</b>",
    ]

    team_summary = data.get("team_summary", {})
    for team_name in ("Team A", "Team B"):
        team = team_summary.get(team_name, {})
        lines.append(
            f"{e(team_name)} - {fmt_km(team.get('total_distance_km'))} "
            f"({int(team.get('participant_count') or 0)} runners)"
        )

    lines.extend([
        "",
        "<b>Leaderboard:</b>",
    ])

    if leaderboard:
        for row in leaderboard[:MAX_LEADERBOARD_ROWS]:
            distance_delta = distance_since_last_update(row, previous_by_runner)
            lines.append(
                f"{row.get('rank')}. {e(row.get('display_name', 'Runner'))} "
                f"({e(row.get('team', 'Team A'))}) - "
                f"{fmt_km(row.get('total_distance_km'))} "
                f"(+{fmt_km(max(distance_delta, 0.0))} since last update)"
            )
        if len(leaderboard) > MAX_LEADERBOARD_ROWS:
            lines.append(f"...and {len(leaderboard) - MAX_LEADERBOARD_ROWS} more")
    else:
        lines.append("No runs have been logged yet.")

    biggest_mover = recent_runners[0] if recent_runners else None
    if biggest_mover:
        lines.extend(
            [
                "",
                "<b>Biggest mover:</b>",
                f"{e(biggest_mover.get('display_name', 'Runner'))} added {fmt_km(biggest_mover.get('distance_km'))} since last update.",
            ]
        )

    lines.extend(["", "<b>Runs since last update:</b>"])
    if recent_runners:
        for runner in recent_runners[:MAX_RECENT_ROWS]:
            run_count = int(runner.get("run_count") or 0)
            run_text = f" across {run_count} run{'s' if run_count != 1 else ''}" if run_count else ""
            lines.append(f"- {e(runner.get('display_name', 'Runner'))}: {fmt_km(runner.get('distance_km'))}{run_text}")
        if len(recent_runners) > MAX_RECENT_ROWS:
            lines.append(f"- Plus {len(recent_runners) - MAX_RECENT_ROWS} more runner(s)")
    else:
        lines.append("No new runs logged since the last update.")

    if website_url:
        lines.extend(["", "<b>Full leaderboard:</b>", e(website_url)])

    message = "\n".join(lines)
    if len(message) > 3900:
        message = message[:3850].rstrip() + "\n\nFull leaderboard has the complete table."
    return message


def send_message(token: str, chat_id: str, message: str) -> None:
    response = requests.post(
        TELEGRAM_API_URL.format(token=token),
        json={
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": True},
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Telegram send failed with HTTP {response.status_code}")

    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError("Telegram send failed: API returned ok=false")


def main() -> int:
    parser = argparse.ArgumentParser(description="Send the daily Telegram update.")
    parser.add_argument("--leaderboard", default="data/leaderboard.json", help="Path to public leaderboard JSON")
    parser.add_argument("--state", default="data/telegram_state.json", help="Path to last successful Telegram update state")
    parser.add_argument("--write-state", action="store_true", help="Update the state file after a successful send")
    parser.add_argument("--dry-run", action="store_true", help="Print the message without sending it")
    args = parser.parse_args()

    try:
        data = load_json(Path(args.leaderboard))
        state_path = Path(args.state)
        previous = load_optional_json(state_path)
        message = build_message(data, previous)
        if args.dry_run:
            print(message)
            return 0

        token = require_env("TELEGRAM_BOT_TOKEN")
        chat_id = require_env("TELEGRAM_CHAT_ID")
        send_message(token, chat_id, message)
        if args.write_state:
            write_json(state_path, build_state(data))
        print("Telegram daily update sent.")
        return 0
    except (OSError, json.JSONDecodeError, RuntimeError, requests.RequestException) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
