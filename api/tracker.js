const OWNER = "amin-nepali";
const MAX_COMMIT_PAGES = 10;

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader(
    "Cache-Control",
    status === 200
      ? "public, max-age=60, stale-while-revalidate=300"
      : "no-store",
  );
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function graphql(query, variables, token) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: ["Bearer", token].join(" "),
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}.`);
  }

  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.data;
}

function makeDays(year) {
  const days = new Map();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  for (let time = start; time < end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    days.set(date, { date, contributionCount: 0 });
  }
  return days;
}

function makeWeeks(days, year) {
  const firstDay = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const weeks = [];
  let week = [];
  for (let index = 0; index < firstDay; index += 1) week.push(null);

  for (const day of days.values()) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function parseYear(value) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  const currentYear = new Date().getUTCFullYear();
  return year >= 2008 && year <= currentYear ? year : null;
}

async function getProfile(login, year, token) {
  const query = `query ProfileContributions($login: String!, $from: DateTime!, $to: DateTime!, $after: String) {
    user(login: $login) {
      login
      name
      avatarUrl
      url
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date contributionCount }
          }
        }
      }
      repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: NAME, direction: ASC }) {
        nodes {
          name
          nameWithOwner
          url
          description
          isPrivate
          updatedAt
          defaultBranchRef { name }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;

  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;
  const days = makeDays(year);
  const repositories = [];
  let cursor = null;
  let profile = null;

  do {
    const data = await graphql(query, { login, from, to, after: cursor }, token);
    if (!data.user) {
      const error = new Error(`GitHub user "${login}" was not found.`);
      error.statusCode = 404;
      throw error;
    }

    profile = {
      login: data.user.login,
      name: data.user.name,
      avatarUrl: data.user.avatarUrl,
      url: data.user.url,
    };
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        days.set(day.date, {
          date: day.date,
          contributionCount: day.contributionCount,
        });
      }
    }

    repositories.push(...data.user.repositories.nodes);
    cursor = data.user.repositories.pageInfo.hasNextPage
      ? data.user.repositories.pageInfo.endCursor
      : null;
  } while (cursor);

  const total = [...days.values()].reduce((sum, day) => sum + day.contributionCount, 0);
  return { profile, days, repositories, total, weeks: makeWeeks(days, year) };
}

async function getRepositoryDays(repository, branch, year, token) {
  if (!/^[A-Za-z0-9._/-]{1,255}$/.test(branch) || branch.includes("..") || branch.startsWith("-")) {
    const error = new Error("Invalid branch name.");
    error.statusCode = 400;
    throw error;
  }

  const query = `query RepositoryCommits($owner: String!, $name: String!, $ref: String!, $from: DateTime!, $to: DateTime!, $after: String) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $ref) {
        target {
          ... on Commit {
            history(first: 100, after: $after, since: $from, until: $to) {
              nodes { committedDate }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    }
  }`;

  const days = makeDays(year);
  let cursor = null;
  let total = 0;
  let pages = 0;
  let hasMore = false;
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year + 1}-01-01T00:00:00Z`;

  do {
    const data = await graphql(
      query,
      {
        owner: OWNER,
        name: repository.name,
        ref: `refs/heads/${branch}`,
        from,
        to,
        after: cursor,
      },
      token,
    );
    const history = data.repository?.ref?.target?.history;
    if (!history) {
      const error = new Error(`Branch "${branch}" was not found or is not readable.`);
      error.statusCode = 404;
      throw error;
    }

    for (const commit of history.nodes) {
      const date = commit.committedDate.slice(0, 10);
      const day = days.get(date);
      if (day) {
        day.contributionCount += 1;
        total += 1;
      }
    }

    pages += 1;
    hasMore = history.pageInfo.hasNextPage;
    cursor = hasMore ? history.pageInfo.endCursor : null;
  } while (cursor && pages < MAX_COMMIT_PAGES);

  return {
    days,
    total,
    truncated: hasMore,
    weeks: makeWeeks(days, year),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return respond(res, 405, { error: "Method not allowed." });
  }

  const token = process.env.SECRET;
  if (!token) {
    return respond(res, 500, {
      error: "Server is missing the GitHub SECRET environment variable.",
    });
  }

  const year = parseYear(req.query?.year);
  if (!year) {
    return respond(res, 400, {
      error: `Year must be a four-digit year from 2008 through ${new Date().getUTCFullYear()}.`,
    });
  }

  try {
    const data = await getProfile(OWNER, year, token);
    const repoName = req.query?.repo;
    if (repoName !== undefined && repoName !== "") {
      if (typeof repoName !== "string" || repoName.includes("/") || repoName.length > 100) {
        return respond(res, 400, { error: "Select a repository from the list." });
      }

      const repository = data.repositories.find((item) => item.name === repoName);
      if (!repository) {
        return respond(res, 404, {
          error: "Repository not found among this account's public repositories.",
        });
      }
      const branch = typeof req.query?.branch === "string"
        ? req.query.branch
        : repository.defaultBranchRef?.name;
      if (!branch) {
        return respond(res, 404, { error: "This repository has no default branch." });
      }

      const result = await getRepositoryDays(repository, branch, year, token);
      return respond(res, 200, {
        profile: data.profile,
        year,
        scope: "repository",
        repository: {
          name: repository.name,
          nameWithOwner: repository.nameWithOwner,
          url: repository.url,
          branch,
        },
        total: result.total,
        weeks: result.weeks,
        truncated: result.truncated,
      });
    }

    return respond(res, 200, {
      profile: data.profile,
      year,
      scope: "profile",
      total: data.total,
      weeks: data.weeks,
      repositories: data.repositories.map((repository) => ({
        name: repository.name,
        nameWithOwner: repository.nameWithOwner,
        url: repository.url,
        description: repository.description,
        updatedAt: repository.updatedAt,
        defaultBranch: repository.defaultBranchRef?.name ?? null,
      })),
      privateContributionsMayBeIncluded: true,
    });
  } catch (error) {
    console.error("Profile tracker request failed:", error.message);
    return respond(res, error.statusCode || 502, {
      error: error.message || "Could not load GitHub contribution data.",
    });
  }
};
