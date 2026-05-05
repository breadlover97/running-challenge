#!/usr/bin/env python3
"""Send the daily 2026 Run Challenge update to Telegram."""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

import requests


TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"
MAX_LEADERBOARD_ROWS = 12
MAX_TODAY_ROWS = 8


def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


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


def e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def build_message(data: dict[str, Any]) -> str:
    challenge = data.get("challenge", {})
    leaderboard = data.get("leaderboard", [])
    daily = data.get("daily_summary", {})
    website_url = challenge.get("website_url") or ""

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
            lines.append(
                f"{row.get('rank')}. {e(row.get('display_name', 'Runner'))} "
                f"({e(row.get('team', 'Team A'))}) - "
                f"{fmt_km(row.get('total_distance_km'))} "
                f"(+{fmt_km(row.get('distance_added_today_km'))} today)"
            )
        if len(leaderboard) > MAX_LEADERBOARD_ROWS:
            lines.append(f"...and {len(leaderboard) - MAX_LEADERBOARD_ROWS} more")
    else:
        lines.append("No runs have been logged yet.")

    biggest_mover = daily.get("biggest_mover")
    if biggest_mover:
        lines.extend(
            [
                "",
                "<b>Biggest mover:</b>",
                f"{e(biggest_mover.get('display_name', 'Runner'))} added {fmt_km(biggest_mover.get('distance_km'))} today.",
            ]
        )

    todays_runs = daily.get("runners", [])
    lines.extend(["", "<b>Today's runs:</b>"])
    if todays_runs:
        for runner in todays_runs[:MAX_TODAY_ROWS]:
            lines.append(f"- {e(runner.get('display_name', 'Runner'))}: {fmt_km(runner.get('distance_km'))}")
        if len(todays_runs) > MAX_TODAY_ROWS:
            lines.append(f"- Plus {len(todays_runs) - MAX_TODAY_ROWS} more runner(s)")
    else:
        lines.append("No new runs logged today.")

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
    parser.add_argument("--dry-run", action="store_true", help="Print the message without sending it")
    args = parser.parse_args()

    try:
        data = load_json(Path(args.leaderboard))
        message = build_message(data)
        if args.dry_run:
            print(message)
            return 0

        token = require_env("TELEGRAM_BOT_TOKEN")
        chat_id = require_env("TELEGRAM_CHAT_ID")
        send_message(token, chat_id, message)
        print("Telegram daily update sent.")
        return 0
    except (OSError, json.JSONDecodeError, RuntimeError, requests.RequestException) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
