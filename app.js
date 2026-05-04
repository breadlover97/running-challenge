const DATA_URL = "data/leaderboard.json";
const STRAVA_CLIENT_ID = "235397";
const STRAVA_REDIRECT_URI = "https://breadlover97.github.io/running-challenge/";
const STRAVA_SCOPE = "read,activity:read_all";
const JOIN_WORKER_START_URL = "";

const formatDate = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

const formatDateTime = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short"
});

function text(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = text(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function km(value) {
  return `${Number(value || 0).toFixed(1)} km`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prettyDate(value) {
  const date = parseDate(value);
  return date ? formatDate.format(date) : "-";
}

function prettyDateTime(value) {
  const date = parseDate(value);
  return date ? formatDateTime.format(date) : "Not synced yet";
}

function duration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "-";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function rankChange(value) {
  if (value === null || value === undefined || value === 0) {
    return `<span class="rank-change">-</span>`;
  }
  const className = value > 0 ? "up" : "down";
  const sign = value > 0 ? "+" : "";
  return `<span class="rank-change ${className}">${sign}${value}</span>`;
}

function safeUrl(value) {
  if (!value || !String(value).startsWith("https://www.strava.com/activities/")) {
    return "";
  }
  return String(value);
}

function teamName(value) {
  return value === "Team B" ? "Team B" : "Team A";
}

function setupJoinLinks() {
  const links = document.querySelectorAll(".strava-join-link");

  function updateLinks() {
    const url = JOIN_WORKER_START_URL
      ? new URL(JOIN_WORKER_START_URL)
      : new URL("https://www.strava.com/oauth/authorize");

    if (!JOIN_WORKER_START_URL) {
      url.searchParams.set("client_id", STRAVA_CLIENT_ID);
      url.searchParams.set("redirect_uri", STRAVA_REDIRECT_URI);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("approval_prompt", "force");
      url.searchParams.set("scope", STRAVA_SCOPE);
      url.searchParams.set("state", "manual");
    }

    links.forEach((link) => {
      link.href = url.toString();
    });
  }

  updateLinks();
}

function renderJoinState() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  const joinPanel = document.getElementById("joinPanel");
  const title = document.getElementById("joinPanelTitle");
  const message = document.getElementById("joinPanelMessage");
  const codeBox = document.getElementById("stravaCode");
  const copyButton = document.getElementById("copyCodeButton");

  if (!joinPanel || (!code && !error)) {
    return;
  }

  joinPanel.hidden = false;
  joinPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (error) {
    title.textContent = "Strava authorization was not completed";
    message.textContent = "Please try again, or tell the organiser if you did not mean to cancel.";
    codeBox.textContent = error;
    copyButton.hidden = true;
    return;
  }

  title.textContent = "Strava authorization received";
  message.textContent =
    "Temporary manual flow: copy these details and send them privately to the organiser with your display name, activity source, and chosen team.";
  codeBox.textContent = code;
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`Strava code: ${code}`);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy Details";
      }, 1800);
    } catch (clipboardError) {
      copyButton.textContent = "Select code";
    }
  });
}

function renderSummary(data) {
  const leaderboard = data.leaderboard || [];
  const totalRuns = leaderboard.reduce((sum, runner) => sum + Number(runner.total_runs || 0), 0);
  const todayDistance = Number(data.daily_summary?.total_distance_km || 0);
  const teamSummary = data.team_summary || {};
  const teamA = teamSummary["Team A"] || {};
  const teamB = teamSummary["Team B"] || {};

  document.getElementById("challengeName").textContent = data.challenge?.name || "Mileage Challenge";
  document.getElementById("challengeDates").textContent =
    `${prettyDate(data.challenge?.start_date)} to ${prettyDate(data.challenge?.end_date)}`;
  document.getElementById("teamADistance").textContent = km(teamA.total_distance_km);
  document.getElementById("teamAMeta").textContent = `${text(teamA.participant_count, "0")} runners`;
  document.getElementById("teamBDistance").textContent = km(teamB.total_distance_km);
  document.getElementById("teamBMeta").textContent = `${text(teamB.participant_count, "0")} runners`;
  document.getElementById("totalRuns").textContent = String(totalRuns);
  document.getElementById("todayDistance").textContent = `${km(todayDistance)} today`;
  document.getElementById("lastUpdated").textContent = prettyDateTime(data.generated_at);
}

function renderTeamBreakdown(data) {
  const container = document.getElementById("teamBreakdown");
  if (!container) return;

  const teams = data.team_summary || {};
  const orderedTeams = ["Team A", "Team B"];
  container.innerHTML = orderedTeams.map((name) => {
    const team = teams[name] || { total_distance_km: 0, participants: [] };
    const participants = team.participants || [];
    const rows = participants.length
      ? participants.map((runner) => {
        const teamTotal = Number(team.total_distance_km || 0);
        const runnerTotal = Number(runner.total_distance_km || 0);
        const share = teamTotal > 0 ? Math.round((runnerTotal / teamTotal) * 100) : 0;
        return `
          <div class="team-runner-row">
            <div>
              <strong>${escapeHtml(runner.display_name)}</strong>
              <span>${text(runner.total_runs, "0")} runs</span>
            </div>
            <div class="contribution-meter" aria-label="${escapeAttr(runner.display_name)} contribution ${share}%">
              <span style="width: ${share}%"></span>
            </div>
            <strong>${km(runner.total_distance_km)}</strong>
          </div>
        `;
      }).join("")
      : `<div class="empty-state">No runners assigned yet.</div>`;

    return `
      <article class="team-breakdown-card">
        <div class="team-breakdown-head">
          <h3>${name}</h3>
          <strong>${km(team.total_distance_km)}</strong>
        </div>
        <div class="team-runner-list">${rows}</div>
      </article>
    `;
  }).join("");
}

function renderLeaderboard(data) {
  const body = document.getElementById("leaderboardBody");
  const empty = document.getElementById("emptyState");
  const leaderboard = data.leaderboard || [];

  body.innerHTML = leaderboard.map((runner) => {
    const latestUrl = safeUrl(runner.activities?.[0]?.strava_activity_url);
    const validation = latestUrl
      ? `<a class="validation-pill" href="${latestUrl}" target="_blank" rel="noreferrer">Latest run</a>`
      : `<span class="validation-pill">No link</span>`;

    return `
      <tr>
        <td data-label="Rank"><span class="rank-cell">#${runner.rank} ${rankChange(runner.rank_change)}</span></td>
        <td data-label="Runner"><span class="runner-name">${escapeHtml(runner.display_name)}</span></td>
        <td data-label="Team"><span class="source-pill">${escapeHtml(teamName(runner.team))}</span></td>
        <td data-label="Distance"><strong>${km(runner.total_distance_km)}</strong></td>
        <td data-label="Today">${km(runner.distance_added_today_km)}</td>
        <td data-label="Runs">${text(runner.total_runs, "0")}</td>
        <td data-label="Last Run">${prettyDate(runner.latest_activity_date)}</td>
        <td data-label="Source"><span class="source-pill">${escapeHtml(runner.source_label)}</span></td>
        <td data-label="Validation">${validation}</td>
      </tr>
    `;
  }).join("");

  empty.hidden = leaderboard.length > 0;
}

function renderActivities(data) {
  const list = document.getElementById("activityList");
  const leaderboard = data.leaderboard || [];

  if (!leaderboard.length) {
    list.innerHTML = `<div class="empty-state">Activity links will appear after the first Strava sync.</div>`;
    return;
  }

  list.innerHTML = leaderboard.map((runner) => {
    const activities = runner.activities || [];
    const rows = activities.length
      ? activities.map((activity) => {
        const url = safeUrl(activity.strava_activity_url);
        const link = url
          ? `<a href="${url}" target="_blank" rel="noreferrer">Open</a>`
          : `<span>-</span>`;
        return `
          <div class="activity-row">
          <span>${prettyDate(activity.date)}</span>
          <span class="activity-title" title="${escapeAttr(activity.activity_name)}">${escapeHtml(activity.activity_name)}</span>
            <strong>${km(activity.distance_km)}</strong>
            <span>${duration(activity.moving_time_seconds)}</span>
            <span>${link}</span>
          </div>
        `;
      }).join("")
      : `<div class="empty-state">No counted runs yet.</div>`;

    return `
      <details class="activity-card">
        <summary>
          <span>${escapeHtml(runner.display_name)}</span>
          <span class="activity-meta">${text(runner.total_runs, "0")} runs · ${km(runner.total_distance_km)}</span>
        </summary>
        <div class="activity-items">${rows}</div>
      </details>
    `;
  }).join("");
}

async function loadLeaderboard() {
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load leaderboard data (${response.status})`);
  }
  return response.json();
}

setupJoinLinks();
renderJoinState();

loadLeaderboard()
  .then((data) => {
    renderSummary(data);
    renderTeamBreakdown(data);
    renderLeaderboard(data);
    renderActivities(data);
    document.getElementById("syncStatus").textContent = "Synced from Strava API";
  })
  .catch((error) => {
    console.error(error);
    document.getElementById("syncStatus").textContent = "Unable to load leaderboard data.";
    document.getElementById("emptyState").hidden = false;
    document.getElementById("emptyState").textContent = "Check that data/leaderboard.json exists and is valid JSON.";
  });
