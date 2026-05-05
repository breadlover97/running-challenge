# 2026 Run Challenge

Static team running dashboard with Strava as the source of truth, GitHub Pages for the website, GitHub Actions for scheduled syncs, Cloudflare Workers for one-step participant signup, and Telegram for daily updates.

Challenge period: **4 May 2026 to 31 December 2026**  
Timezone: **Asia/Singapore**

```text
Garmin / Apple Watch / Strava App -> Strava -> Strava API -> data/leaderboard.json -> GitHub Pages + Telegram
```

## What Counts

- Only Strava activities with type `Run` count.
- The activity date must be from `2026-05-04` through `2026-12-31`, using `Asia/Singapore`.
- The filter is based on the activity's Strava start date, not the upload date.
- A run inside the challenge period can be uploaded later and still count on the next sync.
- A run before the challenge period will not count even if it is uploaded during the challenge.
- Manual activities are excluded unless `include_manual_activities` is enabled for that participant.
- GPS maps, coordinates, heart rate, cadence, power, and exact start/end locations are not stored or displayed.

## Project Structure

```text
running-challenge/
├── index.html
├── join.html
├── styles.css
├── app.js
├── data/
│   └── leaderboard.json
├── scripts/
│   ├── fetch_strava.py
│   ├── build_leaderboard.py
│   ├── send_telegram.py
│   ├── add_participant_from_code.py
│   ├── update_participant_team.py
│   └── remove_participant.py
├── .github/workflows/
│   ├── daily_update.yml
│   ├── add_participant.yml
│   ├── update_team.yml
│   └── remove_participant.yml
├── cloudflare-worker/
│   ├── src/index.js
│   ├── package.json
│   └── wrangler.jsonc
├── wrangler.jsonc
├── requirements.txt
├── config.example.json
├── CLOUDFLARE_JOIN_SETUP.md
└── PARTICIPANT_SETUP.md
```

## Private Config

`PARTICIPANT_CONFIG_JSON` is stored as a GitHub repository secret. Do not commit real refresh tokens.
`profile_image_url` is optional; the one-step join flow fills it from Strava when available, and the website falls back to initials when it is blank.

Shape:

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

## Required Secrets

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

## Main Workflows

- [Daily 2026 Run Challenge Update](https://github.com/breadlover97/running-challenge/actions/workflows/daily_update.yml): fetches Strava runs, rebuilds `data/leaderboard.json`, sends Telegram, and commits the public JSON.
- [Add Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml): exchanges the Strava authorization code, updates the private participant config, and refreshes the leaderboard.
- [Update Participant Team](https://github.com/breadlover97/running-challenge/actions/workflows/update_team.yml): changes Team A/B assignment and refreshes the leaderboard.
- [Remove Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/remove_participant.yml): removes a participant token from the private config and refreshes the leaderboard.

## Participant Signup

Participants use:

[https://breadlover97.github.io/running-challenge/](https://breadlover97.github.io/running-challenge/)

Flow:

1. Click **Sign in with Strava**.
2. Approve the Strava permission screen once.
3. Enter display name.
4. Choose Team A or Team B.
5. Submit.

The Cloudflare Worker receives the one-time Strava code and triggers the GitHub workflow. Participants do not need terminal access or code copying.

## Strava Setup

1. Create a Strava API app from [Strava API Settings](https://www.strava.com/settings/api).
2. Set the Authorization Callback Domain to:

```text
running-challenge-join.ngimtaizhi.workers.dev
```

3. Keep the Strava client secret only in GitHub repository secrets.

Official docs:

- [Strava Authentication](https://developers.strava.com/docs/authentication/)
- [Strava Activities API](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities)

## Cloudflare Worker

The deployed Worker is:

```text
https://running-challenge-join.ngimtaizhi.workers.dev
```

Health check:

```text
https://running-challenge-join.ngimtaizhi.workers.dev/health
```

Setup and redeploy instructions are in [CLOUDFLARE_JOIN_SETUP.md](CLOUDFLARE_JOIN_SETUP.md).

## Local Checks

Install Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Validate config and generated data:

```bash
python3 scripts/fetch_strava.py --config config.json --dry-run
python3 scripts/build_leaderboard.py
python3 scripts/send_telegram.py --dry-run
```

Preview the static site:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Privacy Notes

- Participants should consent before joining.
- The public site shows names, teams, profile photos or initials, mileage totals, daily mileage, run counts, and Strava validation links.
- Telegram may mention daily mileage and leaderboard rank.
- The scripts intentionally avoid GPS maps, exact start/end locations, coordinates, heart rate, cadence, power, and detailed sensor data.
- A participant can leave by asking the organiser to run the remove-participant workflow.
