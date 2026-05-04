# Mileage Challenge

A lightweight, Strava-first mileage challenge system for a friends' running challenge from 4 May 2026 to 31 December 2026.

Data flow:

```text
Garmin / Apple Watch -> Strava -> Strava API -> data/leaderboard.json -> GitHub Pages + Telegram
```

The site is static HTML, CSS, and JavaScript, so it works well on GitHub Pages. The daily update runs in GitHub Actions, fetches Strava activity data, rebuilds `data/leaderboard.json`, sends a Telegram group update, and commits the new leaderboard JSON.

## What It Counts

- Activity type must be `Run`.
- Activity date must be inside `2026-05-04` to `2026-12-31`, using `Asia/Singapore`.
- Manual activities are excluded unless a participant has `include_manual_activities: true`.
- Garmin and Apple Watch runs count only after they sync into Strava.
- Activity links are shown for validation.
- GPS maps, exact start/end locations, coordinates, heart rate, cadence, and power are not stored or displayed.

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
│   ├── strava_oauth_helper.py
│   └── add_participant_from_code.py
├── .github/
│   └── workflows/
│       ├── daily_update.yml
│       └── add_participant.yml
├── requirements.txt
├── README.md
├── PARTICIPANT_SETUP.md
└── config.example.json
```

## Configuration

Copy `config.example.json` to a private local `config.json` for local testing. Do not commit `config.json`; it contains participant refresh tokens and is ignored by Git.

```json
{
  "challenge_name": "Mileage Challenge",
  "challenge_start_date": "2026-05-04",
  "challenge_end_date": "2026-12-31",
  "timezone": "Asia/Singapore",
  "website_url": "https://YOUR_USERNAME.github.io/running-challenge/",
  "participants": [
    {
      "display_name": "Tai Zhi",
      "strava_athlete_id": "123456",
      "strava_refresh_token": "REFRESH_TOKEN_HERE",
      "source_label": "Garmin → Strava",
      "include_manual_activities": false
    }
  ]
}
```

## Strava API Setup

1. Create a Strava API application from your Strava account.
2. Save the app's Client ID and Client Secret.
3. Set the Authorization Callback Domain to `breadlover97.github.io`.
4. Ask participants to use the website button:
   [Join with Strava](https://breadlover97.github.io/running-challenge/join.html)
5. When they send you the one-time code, open:
   [Add Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml)
6. Click **Run workflow**, enter their display name, source label, and code, then run:
   [Daily Mileage Challenge Update](https://github.com/breadlover97/running-challenge/actions/workflows/daily_update.yml)

For local organiser testing, Strava also allows `localhost` and `127.0.0.1`. You can use the local helper:

```bash
export STRAVA_CLIENT_ID="..."
export STRAVA_CLIENT_SECRET="..."
python3 scripts/strava_oauth_helper.py \
  --display-name "Tai Zhi" \
  --source-label "Garmin → Strava" \
  --config config.json
```

The helper opens Strava in your browser, waits for the local redirect, exchanges the authorization code, prints the participant JSON, and appends or updates that participant in `config.json`.

For a manual flow, ask each participant to authorize the app once with this URL:

```text
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code&approval_prompt=force&scope=read,activity:read_all
```

After approval, Strava redirects to your redirect URI with `code=...` in the URL. Exchange that code for tokens:

```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=THE_CODE_FROM_REDIRECT \
  -d grant_type=authorization_code
```

Save each participant's `refresh_token` and athlete `id` into `PARTICIPANT_CONFIG_JSON`.

Important: Strava refresh tokens can rotate when exchanged for access tokens. The fetch script writes `generated/participant_config.updated.json` locally if this happens. Use it to update the `PARTICIPANT_CONFIG_JSON` GitHub secret. Do not commit that file. In GitHub Actions, set `GH_SECRETS_TOKEN` if you want the workflow to update the secret automatically.

Official references:

- [Strava Authentication](https://developers.strava.com/docs/authentication/)
- [Strava Activities API](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities)

## Telegram Bot Setup

1. In Telegram, message `@BotFather`.
2. Run `/newbot` and follow the prompts.
3. Copy the bot token.
4. Add the bot to your group chat.
5. Send a test message in the group.
6. Visit this URL in a browser, replacing the token:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

Look for the group `chat.id`. Group chat IDs are often negative numbers.

Official reference: [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage)

## GitHub Secrets

Add these repository secrets under GitHub repository settings:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `PARTICIPANT_CONFIG_JSON`
- `GH_SECRETS_TOKEN`

`PARTICIPANT_CONFIG_JSON` should be the full private config JSON, not `config.example.json`.

`GH_SECRETS_TOKEN` lets GitHub Actions update `PARTICIPANT_CONFIG_JSON` when adding participants or when Strava rotates refresh tokens. Use a GitHub token that can update Actions secrets for this repository, such as a fine-grained token with repository administration access or a classic token with the needed repo permissions.

## GitHub Pages

1. Push this repository to GitHub.
2. Go to repository Settings -> Pages.
3. Set the source to deploy from the main branch root.
4. Update `website_url` in `PARTICIPANT_CONFIG_JSON` to the Pages URL.
5. Run the workflow manually once from Actions -> Daily Mileage Challenge Update.

## Local Development

Install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Validate config without calling Strava:

```bash
python3 scripts/fetch_strava.py --config config.json --dry-run
python3 scripts/build_leaderboard.py
python3 scripts/send_telegram.py --dry-run
```

Authorize and add a Strava participant locally:

```bash
export STRAVA_CLIENT_ID="..."
export STRAVA_CLIENT_SECRET="..."
python3 scripts/strava_oauth_helper.py \
  --display-name "Tai Zhi" \
  --source-label "Garmin → Strava" \
  --config config.json
```

Fetch real Strava data locally:

```bash
export STRAVA_CLIENT_ID="..."
export STRAVA_CLIENT_SECRET="..."
python3 scripts/fetch_strava.py --config config.json
python3 scripts/build_leaderboard.py
```

Preview the site locally:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

Send a Telegram test:

```bash
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
python3 scripts/send_telegram.py
```

## Privacy Notes

- Participants should consent before their data is included.
- The public site shows names, mileage totals, daily mileage, source labels, and Strava validation links.
- The Telegram group message may mention daily mileage.
- The scripts intentionally do not save maps, latitude/longitude, start/end coordinates, heart rate, cadence, power, or detailed sensor data.
- A participant can leave by asking the organiser to remove their token and delete their data from the generated leaderboard.

## Limitations

- Strava is the source of truth. If Garmin or Apple Watch data does not appear in Strava as a run, it will not count.
- Strava API access depends on participant authorization and the accepted OAuth scopes.
- Private activities may not be returned unless the participant granted `activity:read_all`.
- Strava refresh tokens may rotate. Keep the GitHub secret updated when the script reports rotation.
- GitHub Actions scheduled workflows can be delayed by GitHub platform load.
- This is a static leaderboard, not a real-time dashboard. It updates when the workflow runs.
