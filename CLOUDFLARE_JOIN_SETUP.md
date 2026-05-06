# Cloudflare Join Worker

The Cloudflare Worker powers the one-step Strava signup flow.

```text
Website -> Sign in with Strava -> Cloudflare callback -> choose team -> GitHub Actions -> participant added
```

Current Worker:

```text
https://running-challenge-join.ngimtaizhi.workers.dev
```

Health check:

```text
https://running-challenge-join.ngimtaizhi.workers.dev/health
```

## Required Cloudflare Settings

Worker variables:

```text
STRAVA_CLIENT_ID=235397
CHALLENGE_SITE_URL=https://breadlover97.github.io/running-challenge/
GITHUB_OWNER=breadlover97
GITHUB_REPO=running-challenge
GITHUB_REF=main
GITHUB_WORKFLOW_ID=add_participant.yml
```

Worker secrets:

```text
GITHUB_WORKFLOW_TOKEN=GitHub token allowed to dispatch the add-participant workflow
STATE_SIGNING_SECRET=long random private value
```

`STATE_SIGNING_SECRET` is created by you. Use a long random value and keep it only in Cloudflare secrets.

## Required Strava Setting

In [Strava API Settings](https://www.strava.com/settings/api), set Authorization Callback Domain to:

```text
running-challenge-join.ngimtaizhi.workers.dev
```

Do not include `https://`, `/start`, or `/callback`.

## Deploy

Cloudflare is connected to this GitHub repo. The root `wrangler.jsonc` points Cloudflare to:

```text
cloudflare-worker/src/index.js
```

Recommended Cloudflare build settings:

```text
Build command: leave blank
Deploy command: npx wrangler deploy
Root directory: repository root
```

If deploying locally with Node.js 22 or newer:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_WORKFLOW_TOKEN
npx wrangler secret put STATE_SIGNING_SECRET
npm run deploy
```

## Test

1. Open [https://running-challenge-join.ngimtaizhi.workers.dev/health](https://running-challenge-join.ngimtaizhi.workers.dev/health).
2. Confirm it returns `{"ok":true}`.
3. Open [https://breadlover97.github.io/running-challenge/](https://breadlover97.github.io/running-challenge/).
4. Click **Sign in with Strava**.
5. Approve Strava.
6. Enter display name and team.
7. Confirm the `Add Strava Participant` workflow runs in GitHub Actions.

## Troubleshooting

- `redirect_uri invalid`: Strava callback domain is wrong.
- Worker shows an error after Strava approval: check Cloudflare secrets.
- GitHub workflow dispatch fails: check `GITHUB_WORKFLOW_TOKEN` permissions.
- Participant does not appear: open the `Add Strava Participant` workflow logs.
- Strava connected-athlete limit: request a Strava app quota increase.
- Unexpected names or symbols are removed from display names before dispatch to GitHub Actions.
