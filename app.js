const DATA_URL = "data/leaderboard.json";

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
    "Copy this one-time code and send it privately to the organiser with your display name and activity source.";
  codeBox.textContent = code;
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy Code";
      }, 1800);
    } catch (clipboardError) {
      copyButton.textContent = "Select code";
    }
  });
}

function renderSummary(data) {
  const leaderboard = data.leaderboard || [];
  const totalDistance = leaderboard.reduce((sum, runner) => sum + Number(runner.total_distance_km || 0), 0);
  const totalRuns = leaderboard.reduce((sum, runner) => sum + Number(runner.total_runs || 0), 0);
  const todayDistance = Number(data.daily_summary?.total_distance_km || 0);

  document.getElementById("challengeName").textContent = data.challenge?.name || "Mileage Challenge";
  document.getElementById("challengeDates").textContent =
    `${prettyDate(data.challenge?.start_date)} to ${prettyDate(data.challenge?.end_date)}`;
  document.getElementById("totalDistance").textContent = km(totalDistance);
  document.getElementById("totalRuns").textContent = String(totalRuns);
  document.getElementById("todayDistance").textContent = km(todayDistance);
  document.getElementById("lastUpdated").textContent = prettyDateTime(data.generated_at);
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

renderJoinState();

loadLeaderboard()
  .then((data) => {
    renderSummary(data);
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
