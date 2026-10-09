# Vercel repository editor setup

Deploy this repository as a Vercel project. The editor at `/editor.html` reads
files from `amin-nepali/daily-commit-reop` on `main`; its API functions are
under `/api`.

Configure these **server-side Vercel environment variables** for every
deployment environment where the editor should work:

- `SECRET`: a GitHub fine-grained token restricted to
  `amin-nepali/daily-commit-reop`, with **Contents: read and write** permission.
  The token must never be added to client-side code or returned by an API.
- `AUTOMATION_WEB_KEY`: a separate, randomly generated, high-entropy key used
  to authorize the editor's API requests. Do not reuse the GitHub token.

Enable Vercel Deployment Protection for the project as an additional access
control, then redeploy after setting the variables. Do not make this editor
publicly accessible: a person who can use its web key can commit a file to the
repository's `main` branch. Use GitHub branch protection to enforce any
required reviews; the editor does not bypass those rules.

The editor lets an operator browse the file list, load one file at a time, edit
it, and explicitly confirm a single-file commit. Files are limited to 1 MiB.
It does not run an AI model, generate code, audit source code, or automatically
fix findings. It is separate from the repository's existing scheduled GitHub
workflow.
