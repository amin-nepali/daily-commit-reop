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

## Attribute scheduled commits to your profile

The scheduled workflow commits as the account owner so GitHub can include those
commits in the account's contribution graph. In the repository's **Settings →
Secrets and variables → Actions → Variables**, create a repository variable
named `CONTRIBUTION_EMAIL`. Set its value to an email address verified and
associated with your GitHub account. If you use GitHub's private email setting,
copy the no-reply address shown in **GitHub Settings → Emails**.

The workflow stops without making commits if this variable is missing. GitHub
may take some time to refresh the contribution graph, and existing commits
authored by `github-actions[bot]` are not changed.
chcjg
