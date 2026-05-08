# 2026 Run Challenge

A static team running dashboard for a Strava-first mileage challenge.

- Challenge period: **4 May 2026 to 31 December 2026**
- Timezone: **Asia/Singapore**
- Website: [breadlover97.github.io/running-challenge](https://breadlover97.github.io/running-challenge/)
- Join Worker: [running-challenge-join.ngimtaizhi.workers.dev](https://running-challenge-join.ngimtaizhi.workers.dev)

```text
Garmin / Apple Watch / Strava App
  -> Strava
  -> Strava API
  -> GitHub Actions
  -> data/leaderboard.json
  -> GitHub Pages + Telegram
  -> data/telegram_state.json
```

## What Counts

- Only Strava activities with type `Run` count.
- Activity dates must be from `2026-05-04` through `2026-12-31`.
- The activity date matters, not the upload date.
- Runs inside the challenge period can be uploaded later and still count.
- Runs before the challenge period do not count even if uploaded during the challenge.
- Manual activities are excluded unless enabled for a participant.
- GPS maps, coordinates, exact start/end locations, heart rate, cadence, power, and detailed sensor data are not stored or displayed.

## Current Features

- GitHub Pages static dashboard.
- Team A vs Team B cumulative mileage chart with hover details.
- Leaderboard, team contribution breakdown, insights, and activity validation table.
- One-step Strava signup through Cloudflare Workers.
- GitHub Actions workflows for daily sync, participant join, team updates, and removals.
- Telegram daily update generated from the same `data/leaderboard.json` used by the website, compared against `data/telegram_state.json` so the message shows mileage since the last successful Telegram update.

## Repository Map

```text
running-challenge/
├── index.html                    # Main dashboard
├── join.html                     # Participant setup page
├── backend.html                  # Technical "how it works" page
├── styles.css                    # Shared site styling
├── app.js                        # Browser rendering logic
├── data/
│   ├── leaderboard.json          # Public generated dashboard data
│   └── telegram_state.json       # Last successful Telegram update snapshot
├── scripts/
│   ├── fetch_strava.py           # Strava API fetch and sanitisation
│   ├── build_leaderboard.py      # Leaderboard and team aggregation
│   ├── send_telegram.py          # Telegram daily update
│   ├── add_participant_from_code.py
│   ├── update_participant_team.py
│   └── remove_participant.py
├── .github/workflows/
│   ├── daily_update.yml          # 11:59 pm SGT Strava sync
│   ├── add_participant.yml       # One-time Strava signup
│   ├── update_team.yml
│   └── remove_participant.yml
├── cloudflare-worker/
│   ├── src/index.js              # OAuth callback and workflow dispatch
│   ├── package.json
│   ├── package-lock.json
│   └── wrangler.jsonc
├── wrangler.jsonc                # Root deploy config for Cloudflare Git integration
├── requirements.txt
├── config.example.json
├── CLOUDFLARE_JOIN_SETUP.md
├── PARTICIPANT_SETUP.md
└── .gitignore
```

## Private Config

The real participant config lives only in the GitHub repository secret `PARTICIPANT_CONFIG_JSON`.
Do not commit real Strava refresh tokens.

Example shape:

```json
{
  "challenge_name": "2026 Run Challenge",
  "challenge_start_date": "2026-05-04",
  "challenge_end_date": "2026-12-31",
  "timezone": "Asia/Singapore",
  "website_url": "https://breadlover97.github.io/running-challenge/",
  "teams": ["Team A", "Team B"],
  "participants": [
    {
      "display_name": "Tai Zhi",
      "strava_athlete_id": "123456",
      "strava_refresh_token": "REFRESH_TOKEN_HERE",
      "team": "Team A",
      "profile_image_url": "https://example.com/profile.jpg",
      "include_manual_activities": false
    }
  ]
}
```

`profile_image_url` is optional. The Cloudflare join flow fills it from Strava when available; the site falls back to initials.

## Secrets And Variables

GitHub repository secrets:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `PARTICIPANT_CONFIG_JSON`
- `GH_SECRETS_TOKEN`

Cloudflare Worker secrets:

- `GITHUB_WORKFLOW_TOKEN`
- `STATE_SIGNING_SECRET`

Cloudflare Worker variables:

- `STRAVA_CLIENT_ID=235397`
- `CHALLENGE_SITE_URL=https://breadlover97.github.io/running-challenge/`
- `GITHUB_OWNER=breadlover97`
- `GITHUB_REPO=running-challenge`
- `GITHUB_REF=main`
- `GITHUB_WORKFLOW_ID=add_participant.yml`

Use least-privilege tokens where possible. Rotate secrets if they are pasted outside GitHub or Cloudflare secret storage.

## Workflows

- [Daily 2026 Run Challenge Update](https://github.com/breadlover97/running-challenge/actions/workflows/daily_update.yml): runs at **11:59 pm SGT**, fetches Strava runs, rebuilds `data/leaderboard.json`, sends Telegram, updates `data/telegram_state.json`, and commits public data.
- [Add Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml): exchanges a one-time Strava code, updates private participant config, and refreshes the leaderboard.
- [Update Participant Team](https://github.com/breadlover97/running-challenge/actions/workflows/update_team.yml): changes Team A/B assignment and refreshes the leaderboard.
- [Remove Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/remove_participant.yml): removes a participant token and refreshes the public JSON.

All workflows share the `participant-config` concurrency lock so signups, removals, team changes, and token refreshes do not overwrite each other.

## Participant Signup

Participants use the website and do not need terminal access, GitHub, Cloudflare, or code copying.

1. Open [the dashboard](https://breadlover97.github.io/running-challenge/).
2. Click **Sign in with Strava**.
3. Approve the Strava permission screen once.
4. Enter display name.
5. Choose Team A or Team B.
6. Submit.

The Cloudflare Worker receives the one-time Strava code and dispatches the `Add Strava Participant` workflow.

## Strava App Setup

1. Create a Strava API app from [Strava API Settings](https://www.strava.com/settings/api).
2. Set **Authorization Callback Domain** to:

```text
running-challenge-join.ngimtaizhi.workers.dev
```

Do not include `https://`, `/start`, or `/callback`.

Official references:

- [Strava Authentication](https://developers.strava.com/docs/authentication/)
- [Strava Activities API](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities)

## Cloudflare Worker

The Worker handles Strava OAuth state, callback processing, team choice, and GitHub workflow dispatch.

- Setup guide: [CLOUDFLARE_JOIN_SETUP.md](CLOUDFLARE_JOIN_SETUP.md)
- Health check: [running-challenge-join.ngimtaizhi.workers.dev/health](https://running-challenge-join.ngimtaizhi.workers.dev/health)

## Local Checks

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

```bash
python3 scripts/fetch_strava.py --config config.json --dry-run
python3 scripts/build_leaderboard.py
python3 scripts/send_telegram.py --dry-run
python3 -m py_compile scripts/*.py
node --check app.js
node --check cloudflare-worker/src/index.js
```

Preview the static site:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Privacy Notes

- Participants should consent before joining.
- The public site shows names, teams, profile photos or initials, mileage totals, run counts, Avg Pace, and Strava validation links.
- Telegram may mention daily mileage and leaderboard rank.
- A participant can leave by asking the organiser to run the remove-participant workflow.
- Removed public data may still exist in public git history unless repository history is rewritten, so keep the public JSON limited to challenge-safe fields.
