const DATA_URL = "data/leaderboard.json";
const JOIN_WORKER_START_URL = "https://running-challenge-join.ngimtaizhi.workers.dev/start";
const DEFAULT_CHALLENGE_NAME = "2026 Run Challenge";

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

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function prettyDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? parseLocalDate(value) : parseDate(value);
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

function teamClass(value) {
  return teamName(value) === "Team B" ? "team-b" : "team-a";
}

function initials(name) {
  const parts = text(name, "?").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function safeImageUrl(value) {
  const url = String(value || "");
  return url.startsWith("https://") ? url : "";
}

function avatarMarkup(runner, size = "regular") {
  const imageUrl = safeImageUrl(runner.profile_image_url);
  const label = escapeAttr(`${runner.display_name || "Runner"} profile photo`);
  const fallback = escapeHtml(initials(runner.display_name));
  const image = imageUrl
    ? `<img src="${escapeAttr(imageUrl)}" alt="${label}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${fallback}</span>`
    : fallback;
  return `<span class="avatar avatar-${size} ${teamClass(runner.team)}" aria-label="${label}">${image}</span>`;
}

function runnerIdentity(runner, options = {}) {
  const showMeta = options.showMeta !== false;
  const meta = showMeta ? `<span>${text(runner.total_runs, "0")} runs</span>` : "";
  return `
    <span class="runner-identity">
      ${avatarMarkup(runner, options.size || "regular")}
      <span>
        <strong>${escapeHtml(runner.display_name)}</strong>
        ${meta}
      </span>
    </span>
  `;
}

function challengeDayText(challenge, generatedAt) {
  const start = parseLocalDate(challenge?.start_date);
  const end = parseLocalDate(challenge?.end_date);
  if (!start || !end) return "";

  const generatedDay = String(generatedAt || "").slice(0, 10);
  const today = parseLocalDate(generatedDay) || new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((end - start) / oneDay) + 1;
  const currentDay = Math.min(Math.max(Math.floor((today - start) / oneDay) + 1, 1), totalDays);
  return `Day ${currentDay} of ${totalDays}`;
}

function setupJoinLinks() {
  const links = document.querySelectorAll(".strava-join-link");
  links.forEach((link) => {
    link.href = JOIN_WORKER_START_URL;
  });
}

function setupReturnTop() {
  const button = document.getElementById("returnTop");
  if (!button) return;

  const updateVisibility = () => {
    button.classList.toggle("visible", window.scrollY > 420);
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}

function renderSummary(data) {
  const leaderboard = data.leaderboard || [];
  const totalRuns = leaderboard.reduce((sum, runner) => sum + Number(runner.total_runs || 0), 0);
  const todayDistance = Number(data.daily_summary?.total_distance_km || 0);
  const teamSummary = data.team_summary || {};
  const teamA = teamSummary["Team A"] || {};
  const teamB = teamSummary["Team B"] || {};

  document.title = data.challenge?.name || DEFAULT_CHALLENGE_NAME;
  document.getElementById("challengeDates").textContent =
    `${prettyDate(data.challenge?.start_date)} to ${prettyDate(data.challenge?.end_date)}`;
  document.getElementById("challengeCountdown").textContent = challengeDayText(data.challenge, data.generated_at);
  document.getElementById("teamADistance").textContent = km(teamA.total_distance_km);
  document.getElementById("teamAMeta").textContent = `${text(teamA.participant_count, "0")} runners`;
  document.getElementById("teamBDistance").textContent = km(teamB.total_distance_km);
  document.getElementById("teamBMeta").textContent = `${text(teamB.participant_count, "0")} runners`;
  document.getElementById("totalRuns").textContent = String(totalRuns);
  document.getElementById("todayDistance").textContent = `${km(todayDistance)} today`;
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
          <div class="team-runner-row ${teamClass(name)}">
            ${runnerIdentity({ ...runner, team: name })}
            <div class="contribution-meter" aria-label="${escapeAttr(runner.display_name)} contribution ${share}%">
              <span style="width: ${share}%"></span>
            </div>
            <strong>${km(runner.total_distance_km)}</strong>
          </div>
        `;
      }).join("")
      : `<div class="empty-state">No runners assigned yet.</div>`;

    return `
      <article class="team-breakdown-card ${teamClass(name)}">
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
        <td data-label="Runner">${runnerIdentity(runner, { showMeta: false })}</td>
        <td data-label="Team"><span class="meta-pill ${teamClass(runner.team)}">${escapeHtml(teamName(runner.team))}</span></td>
        <td data-label="Distance"><strong>${km(runner.total_distance_km)}</strong></td>
        <td data-label="Today">${km(runner.distance_added_today_km)}</td>
        <td data-label="Runs">${text(runner.total_runs, "0")}</td>
        <td data-label="Last Run">${prettyDate(runner.latest_activity_date)}</td>
        <td data-label="Validation">${validation}</td>
      </tr>
    `;
  }).join("");

  empty.hidden = leaderboard.length > 0;
}

function insightCard(label, value, detail, className = "") {
  return `
    <article class="insight-card ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderInsights(data) {
  const grid = document.getElementById("insightsGrid");
  if (!grid) return;

  const leaderboard = data.leaderboard || [];
  const teamA = data.team_summary?.["Team A"] || { total_distance_km: 0, total_runs: 0 };
  const teamB = data.team_summary?.["Team B"] || { total_distance_km: 0, total_runs: 0 };
  const teamGap = Math.abs(Number(teamA.total_distance_km || 0) - Number(teamB.total_distance_km || 0));
  const teamADistance = Number(teamA.total_distance_km || 0);
  const teamBDistance = Number(teamB.total_distance_km || 0);
  const leadingTeam = teamBDistance > teamADistance ? "Team B" : "Team A";
  const teamRaceValue = teamGap === 0 ? "Teams are tied" : `${leadingTeam} leads by ${km(teamGap)}`;
  const topRunner = leaderboard[0];
  const mostRuns = [...leaderboard].sort((a, b) => Number(b.total_runs || 0) - Number(a.total_runs || 0))[0];
  const longestRun = leaderboard
    .map((runner) => ({ runner, run: runner.longest_run }))
    .filter((item) => item.run)
    .sort((a, b) => Number(b.run.distance_km || 0) - Number(a.run.distance_km || 0))[0];
  const today = data.daily_summary || {};
  const todayRunners = today.runners || [];

  const cards = [
    insightCard(
      "Team race",
      teamRaceValue,
      `Team A: ${km(teamA.total_distance_km)} · Team B: ${km(teamB.total_distance_km)}`,
      teamGap === 0 ? "" : teamClass(leadingTeam),
    ),
    topRunner
      ? insightCard("Top runner", topRunner.display_name, `${km(topRunner.total_distance_km)} across ${topRunner.total_runs} runs`)
      : insightCard("Top runner", "No runs yet", "The leaderboard will update after the first Strava sync."),
    mostRuns
      ? insightCard("Most consistent", mostRuns.display_name, `${mostRuns.total_runs} counted runs so far`)
      : insightCard("Most consistent", "No runs yet", "Run counts will appear after activities sync."),
    longestRun
      ? insightCard("Longest run", longestRun.runner.display_name, `${km(longestRun.run.distance_km)} on ${prettyDate(longestRun.run.date)}`)
      : insightCard("Longest run", "No runs yet", "Longest run will appear after activities sync."),
    insightCard(
      "Today",
      todayRunners.length ? `${km(today.total_distance_km)} added` : "No new runs",
      todayRunners.length ? `${todayRunners.length} runner${todayRunners.length === 1 ? "" : "s"} logged distance today.` : "The daily update will still show the current standings.",
    ),
  ];

  grid.innerHTML = cards.join("");
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
          ${runnerIdentity(runner, { showMeta: false })}
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
setupReturnTop();

loadLeaderboard()
  .then((data) => {
    renderSummary(data);
    renderTeamBreakdown(data);
    renderLeaderboard(data);
    renderInsights(data);
    renderActivities(data);
    document.getElementById("syncStatus").textContent =
      `Synced from Strava API, Last Updated ${prettyDateTime(data.generated_at)}`;
  })
  .catch((error) => {
    console.error(error);
    document.getElementById("syncStatus").textContent = "Unable to load leaderboard data.";
    document.getElementById("emptyState").hidden = false;
    document.getElementById("emptyState").textContent = "Check that data/leaderboard.json exists and is valid JSON.";
  });
