const OWNER = "amin-nepali";
const REPO = "daily-commit-reop";
const BRANCH = "main";
const MAX_FILE_BYTES = 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const expected = process.env.AUTOMATION_WEB_KEY;
  const supplied = req.headers["x-automation-key"];

  if (!expected || typeof supplied !== "string") return false;
  const crypto = require("node:crypto");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: ["Bearer", token].join(" "),
      "x-github-api-version": "2022-11-28",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      const error = new Error("Repository file or branch was not found.");
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`GitHub API request failed with HTTP ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  return response.json();
}

function safePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part && part !== "." && part !== "..") &&
    !path.split("/").some((part) => part.toLowerCase() === ".git")
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Method not allowed." });
  }

  if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });

  const token = process.env.SECRET;
  if (!token) return send(res, 500, { error: "Server is missing the GitHub SECRET." });

  try {
    const path = typeof req.query?.path === "string" ? req.query.path : "";
    if (path && !safePath(path)) return send(res, 400, { error: "Invalid file path." });

    if (!path) {
      const tree = await github(
        `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`,
        token,
      );
      if (tree.truncated) {
        return send(res, 502, { error: "Repository tree is too large to list completely." });
      }
      return send(
        res,
        200,
        tree.tree
          .filter((entry) => entry.type === "blob" && entry.path && safePath(entry.path))
          .map(({ path: filePath, size }) => ({ path: filePath, size })),
      );
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const file = await github(
      `/repos/${OWNER}/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`,
      token,
    );
    if (Array.isArray(file) || file.type !== "file" || typeof file.content !== "string") {
      return send(res, 400, { error: "The requested path is not a readable file." });
    }
    if (file.size > MAX_FILE_BYTES) {
      return send(res, 413, { error: "Files larger than 1 MiB cannot be edited here." });
    }

    const content = Buffer.from(file.content.replace(/\n/g, ""), "base64");
    if (content.length > MAX_FILE_BYTES) {
      return send(res, 413, { error: "Files larger than 1 MiB cannot be edited here." });
    }
    return send(res, 200, {
      path: file.path,
      sha: file.sha,
      content: content.toString("utf8"),
    });
  } catch (error) {
    console.error("Repository request failed:", error.message);
    return send(res, error.statusCode || 502, { error: error.message || "Repository request failed." });
  }
};