const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_STATE_AGE_SECONDS = 30 * 60;
const TEAMS = new Set(["Team A", "Team B"]);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return redirect(`${env.CHALLENGE_SITE_URL || ""}join.html`, 302);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/start") {
        return await startStravaAuth(request, env);
      }

      if (request.method === "GET" && url.pathname === "/callback") {
        return await handleStravaCallback(request, env);
      }

      if (request.method === "POST" && url.pathname === "/complete") {
        return await completeJoin(request, env);
      }

      return page("Page not found", "This join link is not valid.", env, 404);
    } catch (error) {
      console.error("Join Worker error:", safeError(error));
      return page(
        "Something went wrong",
        "The join request could not be completed. Please try again or tell the organiser.",
        env,
        500
      );
    }
  }
};

async function startStravaAuth(request, env) {
  requireEnv(env, ["STRAVA_CLIENT_ID", "STATE_SIGNING_SECRET"]);

  const url = new URL(request.url);
  const state = await signState(
    {
      issued_at: Math.floor(Date.now() / 1000)
    },
    env.STATE_SIGNING_SECRET
  );

  const authUrl = new URL(STRAVA_AUTHORIZE_URL);
  authUrl.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", callbackUrl(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("approval_prompt", "force");
  authUrl.searchParams.set("scope", "read,activity:read_all");
  authUrl.searchParams.set("state", state);

  return redirect(authUrl.toString(), 302);
}

async function handleStravaCallback(request, env) {
  requireEnv(env, [
    "GITHUB_WORKFLOW_TOKEN",
    "STATE_SIGNING_SECRET",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_REF",
    "GITHUB_WORKFLOW_ID"
  ]);

  const url = new URL(request.url);
  const denied = url.searchParams.get("error");
  if (denied) {
    return page(
      "Strava was not connected",
      "No worries. You can go back to the challenge page and try again whenever you are ready.",
      env,
      400
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return page("Missing Strava response", "The Strava callback did not include the expected details.", env, 400);
  }

  const authState = await verifyState(state, env.STATE_SIGNING_SECRET);
  if (Math.floor(Date.now() / 1000) - authState.issued_at > MAX_STATE_AGE_SECONDS) {
    return page("Join link expired", "Please return to the challenge page and tap Sign in with Strava again.", env, 400);
  }

  const joinTicket = await signState(
    {
      strava_authorization_code: code,
      issued_at: Math.floor(Date.now() / 1000)
    },
    env.STATE_SIGNING_SECRET
  );

  return html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Finish Joining</title>
    ${style()}
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Strava connected</p>
      <h1>Finish joining.</h1>
      <p>Choose how your name and team should appear on the leaderboard.</p>
      <form class="join-form" action="/complete" method="post">
        <input type="hidden" name="join_ticket" value="${escapeHtml(joinTicket)}">
        <label>
          Display name
          <input name="display_name" type="text" autocomplete="name" placeholder="Your name" required maxlength="80">
        </label>
        <fieldset>
          <legend>Join as</legend>
          <label><input type="radio" name="team" value="Team A" required checked> Team A</label>
          <label><input type="radio" name="team" value="Team B" required> Team B</label>
        </fieldset>
        <button class="button" type="submit">Join challenge</button>
      </form>
    </main>
  </body>
</html>`,
    200
  );
}

async function completeJoin(request, env) {
  requireEnv(env, [
    "GITHUB_WORKFLOW_TOKEN",
    "STATE_SIGNING_SECRET",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_REF",
    "GITHUB_WORKFLOW_ID"
  ]);

  const form = await request.formData();
  const ticket = await verifyJoinTicket(String(form.get("join_ticket") || ""), env.STATE_SIGNING_SECRET);
  if (Math.floor(Date.now() / 1000) - ticket.issued_at > MAX_STATE_AGE_SECONDS) {
    return page("Join form expired", "Please return to the challenge page and sign in with Strava again.", env, 400);
  }

  const participant = {
    display_name: cleanName(form.get("display_name")),
    team: cleanTeam(form.get("team")),
    include_manual_activities: false
  };

  if (!participant.display_name) {
    return page("Name needed", "Please enter the name you want shown on the leaderboard.", env, 400);
  }

  const workflow = await dispatchAddParticipantWorkflow(env, {
    display_name: participant.display_name,
    team: participant.team,
    strava_authorization_code: ticket.strava_authorization_code,
    include_manual_activities: String(Boolean(participant.include_manual_activities))
  });

  const actionLink = workflow?.html_url
    ? `<p class="small">GitHub is adding you now. The organiser can check <a href="${escapeHtml(workflow.html_url)}">this workflow run</a> if needed.</p>`
    : `<p class="small">GitHub is adding you now. The leaderboard will refresh after the next update.</p>`;

  return html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Joined 2026 Run Challenge</title>
    ${style()}
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Strava connected</p>
      <h1>You're in the challenge queue.</h1>
      <p><strong>${escapeHtml(participant.display_name)}</strong> has been submitted for <strong>${escapeHtml(participant.team)}</strong>.</p>
      <p>Your runs will appear after the next leaderboard update. You do not need to copy or send any Strava code.</p>
      ${actionLink}
      <a class="button" href="${escapeHtml(env.CHALLENGE_SITE_URL || "/")}">Back to leaderboard</a>
    </main>
  </body>
</html>`,
    200
  );
}

async function dispatchAddParticipantWorkflow(env, inputs) {
  const endpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW_ID}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_WORKFLOW_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "running-challenge-join-worker",
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    },
    body: JSON.stringify({
      ref: env.GITHUB_REF,
      inputs,
      return_run_details: true
    })
  });

  if (response.status === 204) {
    return null;
  }

  const textBody = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}: ${textBody.slice(0, 300)}`);
  }

  return textBody ? JSON.parse(textBody) : null;
}

async function signState(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifyState(value, secret) {
  const [encodedPayload, suppliedSignature] = String(value).split(".");
  if (!encodedPayload || !suppliedSignature) {
    throw new Error("Invalid state");
  }

  const expectedSignature = await hmac(encodedPayload, secret);
  if (!timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new Error("State signature mismatch");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  payload.issued_at = Number(payload.issued_at || 0);

  if (!payload.issued_at) {
    throw new Error("State is incomplete");
  }
  return payload;
}

async function verifyJoinTicket(value, secret) {
  const payload = await verifyState(value, secret);
  payload.strava_authorization_code = String(payload.strava_authorization_code || "").trim();
  if (!payload.strava_authorization_code) {
    throw new Error("Join ticket is incomplete");
  }
  return payload;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(signature);
}

function callbackUrl(request) {
  const url = new URL(request.url);
  url.pathname = "/callback";
  url.search = "";
  return url.toString();
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanTeam(value) {
  return TEAMS.has(value) ? value : "Team A";
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  return base64UrlEncodeBytes(bytes);
}

function base64UrlEncodeBytes(value) {
  let binary = "";
  const bytes = new Uint8Array(value);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing Worker configuration: ${missing.join(", ")}`);
  }
}

function redirect(location, status) {
  return new Response(null, {
    status,
    headers: { "Location": location }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function page(title, message, env, status = 200) {
  return html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${style()}
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">2026 Run Challenge</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="button" href="${escapeHtml(env.CHALLENGE_SITE_URL || "/")}">Back to challenge</a>
    </main>
  </body>
</html>`,
    status
  );
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function style() {
  return `<style>
    :root { color-scheme: light; --orange: #fc4c02; --ink: #050505; --muted: #666; --line: #e8e5df; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px; background: #fff; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
    .card { width: min(100%, 620px); padding: clamp(24px, 6vw, 48px); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 20px 60px rgba(5, 5, 5, 0.08); }
    .eyebrow { margin: 0 0 10px; color: var(--orange); font-size: 0.78rem; font-weight: 900; text-transform: uppercase; }
    h1 { margin: 0 0 16px; font-size: clamp(2rem, 7vw, 4rem); line-height: 0.95; letter-spacing: 0; }
    p { margin: 0 0 14px; color: var(--muted); font-weight: 650; }
    p strong { color: var(--ink); }
    .small { font-size: 0.92rem; }
    .join-form { display: grid; gap: 14px; margin-top: 22px; }
    .join-form label { display: grid; gap: 8px; color: var(--muted); font-size: 0.78rem; font-weight: 900; text-transform: uppercase; }
    .join-form input[type="text"], .join-form select { min-height: 46px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; color: var(--ink); font: inherit; font-weight: 800; outline: none; }
    fieldset { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 16px; }
    legend { padding: 0 6px; color: var(--muted); font-size: 0.78rem; font-weight: 900; text-transform: uppercase; }
    fieldset label { display: inline-flex; grid-auto-flow: column; align-items: center; min-height: 34px; padding: 7px 11px; border-radius: 999px; background: #fff; color: var(--ink); }
    input[type="radio"] { accent-color: var(--orange); }
    a { color: var(--ink); font-weight: 900; text-decoration-color: var(--orange); text-decoration-thickness: 0.12em; text-underline-offset: 0.2em; }
    .button { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; margin-top: 8px; padding: 12px 18px; border: 0; border-radius: 999px; background: var(--orange); color: #fff; font: inherit; font-weight: 900; text-decoration: none; box-shadow: 0 12px 28px rgba(252, 76, 2, 0.24); cursor: pointer; }
  </style>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}
