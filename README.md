# Commit Tracker Pro

The single-repository tracker is available at `/`. The **Go to main tracker**
button opens `/main-tracker.html`, which shows the account-wide yearly GitHub
contribution calendar, public repository list, and a selectable repository
branch view.

## Vercel configuration

Set `SECRET` in the Vercel project environment variables to a GitHub token
allowed to query the GitHub GraphQL API for the `amin-nepali` profile and its
public repositories. Keep this token server-side; it is only read by
`/api/tracker` and is never included in the page response. Redeploy after
changing environment variables.

The profile overview only lists public repositories. GitHub may include private
contributions in the account-wide calendar without exposing private repository
names. A selected repository branch view counts commits from the selected year;
for performance, it displays at most the first 1,000 commits if a branch
exceeds that limit.
