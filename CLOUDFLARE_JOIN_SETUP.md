# Cloudflare One-Step Join Setup

This turns participant onboarding into:

```text
Challenge website -> Sign in with Strava -> Strava approval -> choose team -> GitHub Actions -> participant added
```

Participants will not need to copy a Strava code or send anything to the organiser.

## What The Worker Does

- Sends participants to Strava with the correct challenge details.
- Receives Strava's one-time authorization code at `/callback`.
- Triggers the existing GitHub Actions workflow: `add_participant.yml`.
- Lets GitHub Actions exchange the code for the participant refresh token and update `PARTICIPANT_CONFIG_JSON`.
- Does not store Strava refresh tokens, GPS data, or activity data in Cloudflare.

## Accounts And Access Needed

You need:

- A free Cloudflare account: <https://dash.cloudflare.com/sign-up>
- Access to this GitHub repo: <https://github.com/breadlover97/running-challenge>
- A GitHub token for the Worker with permission to trigger Actions workflows.
- Access to your Strava API app settings.

## Recommended Setup

### 1. Create A Cloudflare Account

1. Go to <https://dash.cloudflare.com/sign-up>.
2. Create an account and verify your email.
3. Open the Cloudflare dashboard.

You do not need to move your domain to Cloudflare. The default `workers.dev` URL is enough.

### 2. Create A GitHub Token For The Worker

1. Go to <https://github.com/settings/personal-access-tokens>.
2. Create a fine-grained token.
3. Repository access: select only `breadlover97/running-challenge`.
4. Repository permissions: set **Actions** to **Read and write**.
5. Generate the token and keep it private.

This token is only for triggering the `Add Strava Participant` workflow.

### 3. Deploy The Worker With Wrangler

If you have Node.js 22 or newer installed, run:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_WORKFLOW_TOKEN
npx wrangler secret put STATE_SIGNING_SECRET
npm run deploy
```

If `npm install` says your Node version is too old, install the current LTS version from <https://nodejs.org/> and try again.

For `GITHUB_WORKFLOW_TOKEN`, paste the GitHub token from step 2.

For `STATE_SIGNING_SECRET`, paste any long random text. You can generate one at:
<https://1password.com/password-generator/>

After deploy, Wrangler will show a URL like:

```text
https://running-challenge-join.YOUR_SUBDOMAIN.workers.dev
```

Your join start URL is:

```text
https://running-challenge-join.YOUR_SUBDOMAIN.workers.dev/start
```

### 4. Browser-Only Alternative

If you do not want to use terminal yet:

1. In Cloudflare, go to **Workers & Pages**.
2. Create a new Worker called `running-challenge-join`.
3. Open the Worker code editor.
4. Replace the default code with `cloudflare-worker/src/index.js`.
5. Go to **Settings** -> **Variables and Secrets**.
6. Add these plain text variables:

```text
STRAVA_CLIENT_ID=235397
CHALLENGE_SITE_URL=https://breadlover97.github.io/running-challenge/
GITHUB_OWNER=breadlover97
GITHUB_REPO=running-challenge
GITHUB_REF=main
GITHUB_WORKFLOW_ID=add_participant.yml
```

7. Add these as secrets:

```text
GITHUB_WORKFLOW_TOKEN=your GitHub token from step 2
STATE_SIGNING_SECRET=any long random text
```

8. Deploy the Worker.

### 5. Update Strava Callback Domain

In your Strava API app settings, set the Authorization Callback Domain to your Worker domain only, without `https://` and without `/callback`.

Example:

```text
running-challenge-join.YOUR_SUBDOMAIN.workers.dev
```

Strava requires the `redirect_uri` to be within the configured callback domain.

### 6. Connect The Website Button To The Worker

In `app.js`, update this line:

```js
const JOIN_WORKER_START_URL = "";
```

to:

```js
const JOIN_WORKER_START_URL = "https://running-challenge-join.YOUR_SUBDOMAIN.workers.dev/start";
```

Commit and push the change.

### 7. Test With One Participant

1. Open <https://breadlover97.github.io/running-challenge/join.html>.
2. Click **Sign in with Strava**.
3. Approve access in Strava.
4. Enter display name and activity source.
5. Choose **Team A** or **Team B**, then submit the join form.
6. Confirm the page says the participant is in the challenge queue.
7. Check the GitHub workflow:
   <https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml>
8. When that workflow succeeds, the public leaderboard should refresh automatically. Telegram updates still run on the normal daily schedule.

## Important Notes

- The Strava connected-athlete limit still applies. The Worker makes joining smoother, but it does not increase Strava's quota.
- The Strava authorization code is short-lived and can only be used once.
- Keep `GITHUB_WORKFLOW_TOKEN` and `STATE_SIGNING_SECRET` private.
- The Worker does not need your Strava client secret because GitHub Actions already performs the token exchange.

## Troubleshooting

### Strava says the redirect URI is invalid

Check that the Strava callback domain exactly matches your Worker domain, without `https://` and without `/callback`.

### The Worker says GitHub workflow dispatch failed

Check that `GITHUB_WORKFLOW_TOKEN` has Actions read/write access to `breadlover97/running-challenge`.

### Participant approved Strava but does not appear

Open the `Add Strava Participant` workflow run and check the error. The most common causes are an expired Strava code, missing GitHub repo secrets, or the Strava connected-athlete limit.
