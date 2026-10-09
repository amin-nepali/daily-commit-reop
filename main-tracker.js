const OWNER = "amin-nepali";
const currentYear = new Date().getUTCFullYear();
const repositorySelect = document.querySelector("#repository-select");
const branchField = document.querySelector("#branch-field");
const branchInput = document.querySelector("#branch-input");
const viewBranchButton = document.querySelector("#view-branch");
const yearSelect = document.querySelector("#year-select");
const dataStatus = document.querySelector("#data-status");
const contributionGrid = document.querySelector("#contribution-grid");
const monthLabels = document.querySelector("#month-labels");
const dayDetail = document.querySelector("#day-detail");
const repositoryList = document.querySelector("#repository-list");
const repositories = new Map();
let selectedDateButton = null;
let activeRequest = null;

function setStatus(message, state = "") {
  dataStatus.textContent = message;
  dataStatus.dataset.state = state;
}

function initializeYears() {
  for (let year = currentYear; year >= Math.max(2008, currentYear - 10); year -= 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.append(option);
  }
}

function contributionLevel(count, maxCount) {
  if (count === 0) return 0;
  const threshold = maxCount / 4;
  return Math.min(4, Math.max(1, Math.ceil(count / threshold)));
}

function renderCalendar(weeks, total, scope, truncated) {
  const days = weeks.flat();
  const activeDays = days.filter((day) => day && day.contributionCount > 0).length;
  const maxCount = Math.max(1, ...days.map((day) => day?.contributionCount ?? 0));
  const year = Number(yearSelect.value);
  document.querySelector("#total-count").textContent = total.toLocaleString();
  document.querySelector("#repository-count").textContent = repositories.size.toLocaleString();
  document.querySelector("#active-days").textContent = activeDays.toLocaleString();
  document.querySelector("#total-label").textContent =
    scope === "repository" ? "Branch commits this year" : "Contributions this year";
  document.querySelector("#contribution-year").textContent = String(year);
  document.querySelector("#chart-description").textContent =
    scope === "repository"
      ? `Commits to ${activeRequest?.repo ?? ""} on ${activeRequest?.branch ?? ""}.`
      : "Every contribution across amin-nepali’s GitHub profile.";
  document.querySelector("#truncation-note").hidden = !truncated;

  contributionGrid.replaceChildren();
  monthLabels.replaceChildren();
  contributionGrid.style.setProperty("--week-count", String(weeks.length));
  monthLabels.style.setProperty("--week-count", String(weeks.length));
  selectedDateButton = null;

  let previousMonth = -1;
  let monthStartWeek = 0;
  const monthSpans = [];
  weeks.forEach((week, weekIndex) => {
    const firstRealDay = week.find(Boolean);
    const month = firstRealDay ? Number(firstRealDay.date.slice(5, 7)) - 1 : previousMonth;
    if (previousMonth !== -1 && month !== previousMonth) {
      monthSpans.push({ month: previousMonth, start: monthStartWeek, span: weekIndex - monthStartWeek });
      monthStartWeek = weekIndex;
    }
    if (month !== -1) previousMonth = month;

    const weekElement = document.createElement("div");
    weekElement.className = "contribution-week";
    for (const day of week) {
      if (!day) {
        const blank = document.createElement("span");
        blank.className = "contribution-cell level-0";
        blank.setAttribute("aria-hidden", "true");
        weekElement.append(blank);
        continue;
      }

      const cell = document.createElement("button");
      const count = day.contributionCount;
      cell.type = "button";
      cell.className = `contribution-cell level-${contributionLevel(count, maxCount)}`;
      cell.title = `${count} contribution${count === 1 ? "" : "s"} on ${day.date}`;
      cell.setAttribute("aria-label", cell.title);
      cell.setAttribute("aria-pressed", "false");
      cell.addEventListener("click", () => {
        selectedDateButton?.classList.remove("is-selected");
        selectedDateButton?.setAttribute("aria-pressed", "false");
        selectedDateButton = cell;
        cell.classList.add("is-selected");
        cell.setAttribute("aria-pressed", "true");
        dayDetail.textContent = `${day.date} · ${count} contribution${count === 1 ? "" : "s"}`;
      });
      weekElement.append(cell);
    }
    contributionGrid.append(weekElement);
  });

  if (previousMonth !== -1) {
    monthSpans.push({
      month: previousMonth,
      start: monthStartWeek,
      span: weeks.length - monthStartWeek,
    });
  }

  for (const entry of monthSpans) {
    const label = document.createElement("span");
    label.textContent = new Date(Date.UTC(year, entry.month, 1)).toLocaleString("en", {
      month: "short",
      timeZone: "UTC",
    });
    label.style.gridColumn = `${entry.start + 1} / span ${Math.max(1, entry.span)}`;
    monthLabels.append(label);
  }
  dayDetail.textContent =
    scope === "repository" ? "Select a day to inspect branch commits." : "Select a day to inspect profile contributions.";
}

function renderRepositories(items) {
  repositories.clear();
  repositorySelect.replaceChildren(new Option("All repositories", ""));
  repositoryList.replaceChildren();

  for (const repository of items) {
    repositories.set(repository.name, repository);
    const option = new Option(
      `${repository.nameWithOwner} · ${repository.defaultBranch ?? "no default branch"}`,
      repository.name,
    );
    repositorySelect.append(option);

    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const link = document.createElement("a");
    link.className = "repository-name";
    link.href = repository.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = repository.nameWithOwner;
    nameCell.append(link);

    const branchCell = document.createElement("td");
    const branchBadge = document.createElement("span");
    branchBadge.className = "branch-badge";
    const branchIcon = document.createElement("i");
    branchIcon.dataset.lucide = "git-branch";
    branchIcon.setAttribute("aria-hidden", "true");
    branchBadge.append(branchIcon, document.createTextNode(repository.defaultBranch ?? "—"));
    branchCell.append(branchBadge);

    const updatedCell = document.createElement("td");
    updatedCell.textContent = repository.updatedAt
      ? new Date(repository.updatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";
    const activityCell = document.createElement("td");
    const inspectButton = document.createElement("button");
    inspectButton.type = "button";
    inspectButton.className = "repository-name";
    inspectButton.textContent = "View activity";
    inspectButton.addEventListener("click", () => {
      repositorySelect.value = repository.name;
      branchInput.value = repository.defaultBranch ?? "main";
      branchField.hidden = false;
      viewBranchButton.hidden = false;
      loadTracker(repository.name, branchInput.value);
      document.querySelector("#contribution-title").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    activityCell.append(inspectButton);
    row.append(nameCell, branchCell, updatedCell, activityCell);
    repositoryList.append(row);
  }

  if (items.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "table-empty";
    cell.textContent = "No public repositories found.";
    row.append(cell);
    repositoryList.append(row);
  }

  document.querySelector("#repository-count").textContent = items.length.toLocaleString();
  document.querySelector("#private-note").hidden = false;
  if (window.lucide) window.lucide.createIcons();
}

async function loadTracker(repo = "", branch = "") {
  activeRequest = repo ? { repo, branch } : null;
  const controller = new AbortController();
  window.currentTrackerController?.abort();
  window.currentTrackerController = controller;
  setStatus(repo ? `Loading ${OWNER}/${repo}/${branch}…` : "Loading profile contributions…");

  const query = new URLSearchParams({ year: yearSelect.value });
  if (repo) {
    query.set("repo", repo);
    query.set("branch", branch);
  }

  try {
    const response = await fetch(`/api/tracker?${query}`, { signal: controller.signal });
    const responseBody = await response.text();
    let result;
    try {
      result = JSON.parse(responseBody);
    } catch {
      throw new Error(`The tracker API returned an unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(result.error || `GitHub request failed (${response.status}).`);

    if (result.repositories) renderRepositories(result.repositories);
    document.querySelector("#profile-name").textContent =
      result.profile.name || result.profile.login;
    document.querySelector("#profile-login").textContent = `@${result.profile.login}`;
    document.querySelector("#profile-login").href = result.profile.url;
    const avatar = document.querySelector("#profile-avatar");
    avatar.src = result.profile.avatarUrl;
    avatar.alt = `${result.profile.login} profile avatar`;
    renderCalendar(result.weeks, result.total, result.scope, result.truncated);
    setStatus(
      result.scope === "repository"
        ? `Showing ${result.repository.nameWithOwner}/${result.repository.branch}`
        : `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      "success",
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    setStatus(error.message, "error");
    if (!repositories.size) {
      repositoryList.replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "table-empty";
      cell.textContent = error.message;
      row.append(cell);
      repositoryList.append(row);
    }
  }
}

initializeYears();
yearSelect.addEventListener("change", () => {
  const repo = repositorySelect.value;
  loadTracker(repo, repo ? branchInput.value.trim() : "");
});
repositorySelect.addEventListener("change", () => {
  const repository = repositories.get(repositorySelect.value);
  const selected = Boolean(repository);
  branchField.hidden = !selected;
  viewBranchButton.hidden = !selected;
  if (!selected) {
    loadTracker();
    return;
  }
  branchInput.value = repository.defaultBranch ?? "main";
  loadTracker(repository.name, branchInput.value);
});
document.querySelector("#repository-filter").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!repositorySelect.value) return loadTracker();
  loadTracker(repositorySelect.value, branchInput.value.trim());
});
document.querySelector("#refresh-profile").addEventListener("click", () => {
  loadTracker(repositorySelect.value, repositorySelect.value ? branchInput.value.trim() : "");
});

loadTracker();
if (window.lucide) window.lucide.createIcons();
