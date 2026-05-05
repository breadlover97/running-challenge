# Join Challenge Flow

This is the browser-only flow for adding friends to the mileage challenge.

## Participant Steps

1. Open the challenge website:
   [https://breadlover97.github.io/running-challenge/](https://breadlover97.github.io/running-challenge/)
2. Tap **Sign in with Strava** in the top right corner.
3. Log in to Strava.
4. Approve access for the challenge app.
5. After Strava sends you back, enter your display name.
6. Choose **Team A** or **Team B**, then submit the join form.

After the Cloudflare join flow is enabled, that is the whole process.

Temporary manual flow:

If the site still shows a one-time code, tap **Copy Details** and send the organiser these details privately:
   - one-time code
   - display name
   - chosen team

Do not post the code in the group chat. It can be used once and may expire quickly.

## Organiser Steps

1. Open the add-participant workflow:
   [Add Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml)
2. Click **Run workflow**.
3. Fill in:
   - `display_name`
   - `team`
   - `strava_authorization_code`
   - leave `include_manual_activities` as `false` unless you are intentionally allowing manual entries
4. Click **Run workflow**.
5. After it succeeds, the public leaderboard refreshes automatically.
6. Check the live site:
   [https://breadlover97.github.io/running-challenge/](https://breadlover97.github.io/running-challenge/)

To change a participant's team after joining:

1. Open [Update Participant Team](https://github.com/breadlover97/running-challenge/actions/workflows/update_team.yml).
2. Click **Run workflow**.
3. Enter the participant's exact display name or Strava athlete ID.
4. Pick **Team A** or **Team B**.
5. Run [Daily Mileage Challenge Update](https://github.com/breadlover97/running-challenge/actions/workflows/daily_update.yml) to refresh public data.

To remove a participant from the challenge:

1. Open [Remove Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/remove_participant.yml).
2. Click **Run workflow**.
3. Enter the participant's exact display name or Strava athlete ID.
4. Type `REMOVE` in the confirmation field.
5. Click **Run workflow**.
6. The workflow removes their Strava refresh token from the private config and refreshes the public leaderboard.

## One-Time Setup Required

The add-participant workflow needs `GH_SECRETS_TOKEN` because it updates the hidden `PARTICIPANT_CONFIG_JSON` GitHub secret.

If it is missing, create a GitHub token that can update repository secrets, then add it here:
[Repository Actions secrets](https://github.com/breadlover97/running-challenge/settings/secrets/actions)

Required repository secrets:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `PARTICIPANT_CONFIG_JSON`
- `GH_SECRETS_TOKEN`

## Why Two Steps?

The public website can safely send participants to Strava, but it cannot safely exchange the code for a refresh token because that requires the private Strava client secret. GitHub Actions performs that exchange securely using repository secrets.
