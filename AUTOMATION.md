# Automatic profile data

The three profile cards update together through `.github/workflows/profile-assets.yml`:

- Scheduled every four hours, at minute17; GitHub may queue scheduled runs.
- When profile source, README, or workflow changes on main.
- Manual “Run workflow” remains available for an immediate refresh.

All cards are built from the official GitHub API with the workflow-provided GITHUB_TOKEN. No additional personal token, paid service or external statistics server is required. Node24 and GitHub CLI are the existing runner tools. Tests run before collection. A source/API/validation failure fails the job and preserves the previous published cards. Only after all metrics validate are outputs saved and committed together.

Activity is the last31 days of contribution counts returned by GitHub; it is not a count of all Git activity or every local edit. GitHub decides which contributions qualify and may index changes later. Private contribution visibility is an account setting; this workflow does not change it. The timestamp says when the API was checked, in America/Sao_Paulo. Calendar values keep GitHub's own dates.

Languages are measured by code bytes in owned PUBLIC repositories, excluding forks. They do not measure skill, work time or private project activity. The former chart was a manually generated snapshot of repositories accessible to its generator; automatic results now have an explicit public scope and do not depend on an owner's token. Public repository count includes forks; stars and language totals exclude forks. The summary shows the API's past-year contributions rather than claiming all-time commits.

Only aggregate metrics, chart images and the managed README chart region are generated. No private repository identities, code or credentials enter the outputs. Biography and featured project descriptions remain editorial content. The image cache key changes with generated content so GitHub can request the new version. The update-status badge points to the real workflow.

Verification: `node --test scripts/*.test.mjs`; `node scripts/update-profile.mjs`. The latter makes read-only GitHub API calls and rewrites only the managed README section and generated metrics/cards. Do not print tokens, add them to source, or copy personal authentication into repository secrets. GitHub can pause schedules in inactive public repositories; inspect the update-status badge if freshness stops advancing.

Sources: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ; https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference ; https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user .
