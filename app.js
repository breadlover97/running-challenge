const DATA_URL = "data/leaderboard.json";
const JOIN_WORKER_START_URL = "https://running-challenge-join.ngimtaizhi.workers.dev/start";
const DEFAULT_CHALLENGE_NAME = "2026 Run Challenge";

const formatDate = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

const formatShortDate = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short"
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

function shortDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? parseLocalDate(value) : parseDate(value);
  return date ? formatShortDate.format(date) : "-";
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

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(start, end) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(Math.round((end - start) / oneDay), 0);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dailyDistancesByTeam(data, team) {
  const dailyTotals = {};
  (data.leaderboard || [])
    .filter((runner) => teamName(runner.team) === team)
    .forEach((runner) => {
      Object.entries(runner.daily_distance_km || {}).forEach(([day, distance]) => {
        dailyTotals[day] = Number(dailyTotals[day] || 0) + Number(distance || 0);
      });
    });
  return dailyTotals;
}

function cumulativeSeries(data, team) {
  const start = parseLocalDate(data.challenge?.start_date);
  const end = parseLocalDate(data.challenge?.end_date);
  if (!start || !end) return [];

  const generated = parseLocalDate(String(data.generated_at || "").slice(0, 10)) || new Date();
  const windowEnd = generated < start ? start : generated > end ? end : generated;
  const visibleDays = Math.max(daysBetween(start, windowEnd), 1);
  const dailyTotals = dailyDistancesByTeam(data, team);

  const series = [];
  let cumulative = 0;
  const elapsedDays = daysBetween(start, windowEnd);
  for (let offset = 0; offset <= elapsedDays; offset += 1) {
    const day = dateKey(addDays(start, offset));
    cumulative += Number(dailyTotals[day] || 0);
    series.push({
      x: offset / visibleDays,
      y: cumulative,
      date: day,
    });
  }
  return series.length ? series : [{ x: 0, y: 0, date: dateKey(start) }];
}

function chartScale(value) {
  const max = Number(value || 0);
  if (max <= 5) return 5;
  if (max <= 20) return Math.ceil(max / 5) * 5;
  if (max <= 100) return Math.ceil(max / 10) * 10;
  return Math.ceil(max / 25) * 25;
}

function chartLinePoints(series, maxDistance, left, baseline, plotWidth, plotHeight) {
  return series.map((point) => {
    const x = left + point.x * plotWidth;
    const y = baseline - (point.y / maxDistance) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function renderTeamComparisonChart(data) {
  const container = document.getElementById("teamComparisonChart");
  if (!container) return;

  const teamA = cumulativeSeries(data, "Team A");
  const teamB = cumulativeSeries(data, "Team B");
  const width = 360;
  const height = 196;
  const left = 38;
  const right = 8;
  const top = 20;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const baseline = height - bottom;
  const maxDistance = chartScale(Math.max(...teamA.map((point) => point.y), ...teamB.map((point) => point.y), 0));
  const teamAPoints = chartLinePoints(teamA, maxDistance, left, baseline, plotWidth, plotHeight);
  const teamBPoints = chartLinePoints(teamB, maxDistance, left, baseline, plotWidth, plotHeight);
  const latestAPoint = teamAPoints.split(" ").pop()?.split(",") || [left, baseline];
  const latestBPoint = teamBPoints.split(" ").pop()?.split(",") || [left, baseline];
  const latest = teamA[teamA.length - 1] || teamB[teamB.length - 1] || { date: "" };
  const startLabel = shortDate(teamA[0]?.date || teamB[0]?.date);
  const endLabel = shortDate(latest.date);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Team A and Team B cumulative mileage">
      <line class="chart-grid" x1="${left}" y1="${top}" x2="${width - right}" y2="${top}"></line>
      <line class="chart-grid" x1="${left}" y1="${top + plotHeight / 2}" x2="${width - right}" y2="${top + plotHeight / 2}"></line>
      <line class="chart-today" x1="${width - right}" y1="${top}" x2="${width - right}" y2="${baseline}"></line>
      <line class="chart-axis" x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}"></line>
      <line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${baseline}"></line>
      <polyline class="chart-line team-a-line" points="${teamAPoints}"></polyline>
      <polyline class="chart-line team-b-line" points="${teamBPoints}"></polyline>
      <circle class="chart-dot team-a-dot" cx="${latestAPoint[0]}" cy="${latestAPoint[1]}" r="4.6"></circle>
      <circle class="chart-dot team-b-dot" cx="${latestBPoint[0]}" cy="${latestBPoint[1]}" r="4.6"></circle>
      <text class="chart-label chart-y-max" x="0" y="${top + 4}">${maxDistance.toFixed(maxDistance < 10 ? 1 : 0)} km</text>
      <text class="chart-label chart-y-zero" x="18" y="${baseline + 4}">0</text>
      <text class="chart-label chart-x-start" x="${left}" y="${height - 8}">${escapeHtml(startLabel)}</text>
      <text class="chart-label chart-x-end" x="${width - right}" y="${height - 8}">${escapeHtml(endLabel)}</text>
      <text class="chart-label chart-today-label" x="${width - right}" y="${top - 4}">Today</text>
    </svg>
  `;
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

function setupScrollEffects() {
  const navLinks = Array.from(document.querySelectorAll(".nav-tabs a[href^='#']"));
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const revealSections = Array.from(document.querySelectorAll("main > section"));

  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href")?.slice(1);
      if (id) setActiveLink(id);
    });
  });

  revealSections.forEach((section) => section.classList.add("scroll-reveal"));

  if (!("IntersectionObserver" in window)) {
    revealSections.forEach((section) => section.classList.add("is-visible"));
    if (sections[0]) setActiveLink(sections[0].id);
    return;
  }

  const activeObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveLink(visible.target.id);
    },
    {
      rootMargin: "-28% 0px -58% 0px",
      threshold: [0.1, 0.35, 0.6],
    },
  );

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.12,
    },
  );

  sections.forEach((section) => activeObserver.observe(section));
  revealSections.forEach((section) => revealObserver.observe(section));
  if (sections[0]) setActiveLink(sections[0].id);
}

function renderSummary(data) {
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
  renderTeamComparisonChart(data);
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

function challengeTiming(challenge, generatedAt) {
  const start = parseLocalDate(challenge?.start_date);
  const end = parseLocalDate(challenge?.end_date);
  if (!start || !end) return null;

  const generatedDay = String(generatedAt || "").slice(0, 10);
  const today = parseLocalDate(generatedDay) || new Date();
  const clampedToday = today < start ? start : today > end ? end : today;
  return {
    start,
    end,
    today: clampedToday,
    currentDay: daysBetween(start, clampedToday) + 1,
    totalDays: daysBetween(start, end) + 1,
  };
}

function projectedFinishDistance(team, timing) {
  if (!timing || timing.currentDay <= 0) return 0;
  return (Number(team.total_distance_km || 0) / timing.currentDay) * timing.totalDays;
}

function runningDayCount(runner) {
  return Object.values(runner.daily_distance_km || {}).filter((distance) => Number(distance || 0) > 0).length;
}

function biggestTeamDay(data) {
  return ["Team A", "Team B"].reduce((best, team) => {
    const dailyTotals = dailyDistancesByTeam(data, team);
    Object.entries(dailyTotals).forEach(([day, distance]) => {
      const value = Number(distance || 0);
      if (!best || value > best.distance) {
        best = { team, date: day, distance: value };
      }
    });
    return best;
  }, null);
}

function weekStart(date) {
  const start = new Date(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function activeRunnersThisWeek(leaderboard, timing, team) {
  if (!timing) return 0;
  const start = weekStart(timing.today);
  const end = timing.today;
  return leaderboard
    .filter((runner) => teamName(runner.team) === team)
    .filter((runner) => Object.entries(runner.daily_distance_km || {}).some(([day, distance]) => {
      const date = parseLocalDate(day);
      return date && date >= start && date <= end && Number(distance || 0) > 0;
    })).length;
}

function renderInsights(data) {
  const grid = document.getElementById("insightsGrid");
  if (!grid) return;

  const leaderboard = data.leaderboard || [];
  const teamA = data.team_summary?.["Team A"] || { total_distance_km: 0, total_runs: 0 };
  const teamB = data.team_summary?.["Team B"] || { total_distance_km: 0, total_runs: 0 };
  const timing = challengeTiming(data.challenge, data.generated_at);
  const teamGap = Math.abs(Number(teamA.total_distance_km || 0) - Number(teamB.total_distance_km || 0));
  const teamADistance = Number(teamA.total_distance_km || 0);
  const teamBDistance = Number(teamB.total_distance_km || 0);
  const leadingTeam = teamBDistance > teamADistance ? "Team B" : "Team A";
  const teamGapValue = teamGap === 0 ? "Teams are tied" : `${leadingTeam} +${km(teamGap)}`;
  const projectedA = projectedFinishDistance(teamA, timing);
  const projectedB = projectedFinishDistance(teamB, timing);
  const averageA = Number(teamA.participant_count || 0) ? teamADistance / Number(teamA.participant_count || 0) : 0;
  const averageB = Number(teamB.participant_count || 0) ? teamBDistance / Number(teamB.participant_count || 0) : 0;
  const topRunner = leaderboard[0];
  const mostConsistent = [...leaderboard].sort((a, b) => {
    const dayGap = runningDayCount(b) - runningDayCount(a);
    if (dayGap !== 0) return dayGap;
    return Number(b.total_distance_km || 0) - Number(a.total_distance_km || 0);
  })[0];
  const longestRun = leaderboard
    .map((runner) => ({ runner, run: runner.longest_run }))
    .filter((item) => item.run)
    .sort((a, b) => Number(b.run.distance_km || 0) - Number(a.run.distance_km || 0))[0];
  const bestTeamDay = biggestTeamDay(data);
  const activeA = activeRunnersThisWeek(leaderboard, timing, "Team A");
  const activeB = activeRunnersThisWeek(leaderboard, timing, "Team B");
  const totalDistance = leaderboard.reduce((sum, runner) => sum + Number(runner.total_distance_km || 0), 0);
  const totalActivities = leaderboard.reduce((sum, runner) => sum + Number(runner.total_runs || 0), 0);

  const cards = [
    insightCard(
      "Team gap",
      teamGapValue,
      `Team A: ${km(teamA.total_distance_km)} · Team B: ${km(teamB.total_distance_km)}`,
      teamGap === 0 ? "" : teamClass(leadingTeam),
    ),
    insightCard(
      "Projected finish distance",
      `A ${km(projectedA)} · B ${km(projectedB)}`,
      timing ? `Based on pace through day ${timing.currentDay} of ${timing.totalDays}.` : "Projection appears after challenge dates load.",
    ),
    insightCard(
      "Average km per runner",
      `A ${km(averageA)} · B ${km(averageB)}`,
      "Team distance divided by assigned runners.",
    ),
    insightCard("Run distance logged", km(totalDistance), "Combined counted distance from both teams."),
    insightCard("Activity count", String(totalActivities), "Counted Strava run activities in the challenge period."),
    topRunner
      ? insightCard("Top runner", topRunner.display_name, `${km(topRunner.total_distance_km)} across ${topRunner.total_runs} runs`)
      : insightCard("Top runner", "No runs yet", "The leaderboard will update after the first Strava sync."),
    mostConsistent
      ? insightCard("Most consistent", mostConsistent.display_name, `${runningDayCount(mostConsistent)} running day${runningDayCount(mostConsistent) === 1 ? "" : "s"} so far`)
      : insightCard("Most consistent", "No runs yet", "Running days will appear after activities sync."),
    longestRun
      ? insightCard("Longest run", longestRun.runner.display_name, `${km(longestRun.run.distance_km)} on ${prettyDate(longestRun.run.date)}`)
      : insightCard("Longest run", "No runs yet", "Longest run will appear after activities sync."),
    bestTeamDay
      ? insightCard("Biggest team day", `${bestTeamDay.team}: ${km(bestTeamDay.distance)}`, `${prettyDate(bestTeamDay.date)} had the biggest single-day team total.`)
      : insightCard("Biggest team day", "No runs yet", "The biggest team day will appear after activities sync."),
    insightCard(
      "Active runners this week",
      `A ${activeA} · B ${activeB}`,
      "Runners with at least one counted run this week.",
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
setupScrollEffects();

loadLeaderboard()
  .then((data) => {
    renderSummary(data);
    renderTeamBreakdown(data);
    renderLeaderboard(data);
    renderInsights(data);
    renderActivities(data);
    document.getElementById("syncStatus").textContent =
      `Last Synced with Strava API on ${prettyDateTime(data.generated_at)}`;
  })
  .catch((error) => {
    console.error(error);
    document.getElementById("syncStatus").textContent = "Unable to load leaderboard data.";
    document.getElementById("emptyState").hidden = false;
    document.getElementById("emptyState").textContent = "Check that data/leaderboard.json exists and is valid JSON.";
  });
