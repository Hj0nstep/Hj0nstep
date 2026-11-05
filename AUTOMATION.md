# Automatic profile data

The three profile cards update together through `.github/workflows/profile-assets.yml`:

- Scheduled every four hours, at minute17; GitHub may queue scheduled runs.
- When profile source, README, or workflow changes on main.
- Manual “Run workflow” remains available for an immediate refresh.

All cards are built from the official GitHub API. GITHUB_TOKEN writes the generated files only to this profile repository. PROFILE_READ_TOKEN, configured by the owner as an encrypted Actions secret, has read-only Metadata access to all owned repositories so private languages can refresh without the PC. No paid service or external statistics server is required. Node24 and GitHub CLI are the existing runner tools. Tests run before collection. A source/API/validation failure fails the job and preserves the previous published cards. Only after all metrics validate are outputs saved and committed together.

Activity is the last31 days of contribution counts returned by GitHub; it is not a count of all Git activity or every local edit. GitHub decides which contributions qualify and may index changes later. Private contribution visibility is an account setting; this workflow does not change it. The timestamp says when the API was checked, in America/Sao_Paulo. Calendar values keep GitHub's own dates.

Languages are measured by code bytes in ALL owned repositories accessible to the dedicated read credential: public, private and forks, as requested by the owner. Every detected nonzero language is displayed; there is no top-eight limit. Fork code can include third-party work, so this is a repository inventory, not a claim of authorship or skill. The chart grows to fit the list. If the secret is absent, the last full aggregate is preserved with its original inventory timestamp and a workflow warning, rather than silently replacing it with public-only data. Invalid or expired configured credentials fail the update instead of inventing zeros.

The read token must target Hj0nstep and All repositories with only Metadata: Read-only. Never print its value or request it in chat. This includes future owned repositories. Its expiration must be renewed in the same secret. Private contribution totals remain subject to GitHub's profile visibility setting and indexing; a Metadata credential does not change those settings. Public repository count and public stars keep their explicit labels.

Only aggregate metrics, chart images and the managed README chart region are generated. No private repository identities, code or credentials enter the outputs. Biography and featured project descriptions remain editorial content. The image cache key changes with generated content so GitHub can request the new version. The update-status badge points to the real workflow.

Verification: `node --test scripts/*.test.mjs`; `node scripts/update-profile.mjs`. The latter makes read-only GitHub API calls and rewrites only the managed README section and generated metrics/cards. Do not print tokens or add them to source. Use only the dedicated read credential explicitly configured by the owner; never copy the local CLI session into repository secrets. GitHub can pause schedules in inactive public repositories; inspect the update-status badge if freshness stops advancing.

Sources: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ; https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference ; https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user .
