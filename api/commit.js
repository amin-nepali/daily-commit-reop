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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }
  if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });

  const token = process.env.SECRET;
  if (!token) return send(res, 500, { error: "Server is missing the GitHub SECRET." });

  const { path, content, sha, message } = req.body || {};
  if (!safePath(path)) return send(res, 400, { error: "Invalid file path." });
  if (typeof content !== "string") return send(res, 400, { error: "File content must be text." });
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return send(res, 413, { error: "Files larger than 1 MiB cannot be committed here." });
  }
  if (sha !== undefined && (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha))) {
    return send(res, 400, { error: "Invalid file revision." });
  }
  if (
    typeof message !== "string" ||
    message.trim().length < 3 ||
    message.trim().length > 120 ||
    /[\r\n]/.test(message)
  ) {
    return send(res, 400, { error: "Commit message must be one line, 3 to 120 characters." });
  }

  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`,
      {
        method: "PUT",
        headers: {
          accept: "application/vnd.github+json",
          authorization: ["Bearer", token].join(" "),
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({
          message: message.trim(),
          content: Buffer.from(content, "utf8").toString("base64"),
          branch: BRANCH,
          ...(sha ? { sha } : {}),
        }),
      },
    );
    if (!response.ok) {
      const status = response.status === 404 ? 404 : 502;
      throw Object.assign(
        new Error(
          response.status === 409 || response.status === 422
            ? "GitHub rejected the update; the file may have changed. Reload it and try again."
            : `GitHub commit request failed with HTTP ${response.status}.`,
        ),
        { statusCode: status },
      );
    }

    const result = await response.json();
    return send(res, 200, {
      path: result.content.path,
      sha: result.content.sha,
      commitUrl: result.commit.html_url,
    });
  } catch (error) {
    console.error("Repository commit failed:", error.message);
    return send(res, error.statusCode || 502, { error: error.message || "Commit failed." });
  }
};