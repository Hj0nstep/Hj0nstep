import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const login = 'Hj0nstep';
const today = new Date().toISOString().slice(0, 10);
const theme = {
  background: '#101012',
  border: '#303034',
  accent: '#FF6B1C',
  text: '#E8E8E5',
  muted: '#A8A8AD',
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
function github(endpoint, body) {
  const result = spawnSync('gh', ['api', endpoint, ...(body ? ['--input', '-'] : [])], {
    input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw Error('GitHub did not return the requested data; existing charts were preserved.');
  return JSON.parse(result.stdout);
}
const svg = (width, height, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="Segoe UI,Arial,sans-serif"><title>${escape(title)}</title><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14" fill="${theme.background}" stroke="${theme.border}"/>${body}</svg>\n`;
const text = (x, y, value, size = 12, color = theme.text) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escape(value)}</text>`;
await mkdir(resolve(root, 'assets'), { recursive: true });
const calendar = github('graphql', {
  query:
    'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}',
  variables: { login },
});
const days = calendar.data?.user?.contributionsCollection?.contributionCalendar?.weeks
  ?.flatMap((w) => w.contributionDays)
  .filter((day) => day.date <= today)
  .slice(-31);
if (
  !days?.length ||
  days.some((day) => !Number.isInteger(day.contributionCount) || day.contributionCount < 0)
)
  throw Error('Invalid contribution calendar.');
const max = Math.max(1, ...days.map((day) => day.contributionCount));
const points = days.map((day, i) => `${36 + i * 25},${180 - (day.contributionCount / max) * 105}`).join(' ');
const graph = svg(
  840,
  255,
  `Activity for ${login}: ${days.length} days, checked on ${today}`,
  [
    text(28, 32, 'GitHub activity', 19, theme.accent),
    text(28, 54, 'Daily contributions from the GitHub API', 12, theme.muted),
    `<path d="M36 180H800" stroke="${theme.border}"/>`,
    `<polyline points="${points}" stroke="${theme.accent}" stroke-width="3" fill="none"/>`,
    ...days.map(
      (day, i) =>
        `<circle cx="${36 + i * 25}" cy="${180 - (day.contributionCount / max) * 105}" r="3" fill="${theme.accent}"><title>${escape(day.date)}: ${day.contributionCount}</title></circle>`,
    ),
    text(
      28,
      209,
      `${days[0].date} to ${days.at(-1).date} · ${days.reduce((sum, day) => sum + day.contributionCount, 0)} contributions in this period`,
    ),
    text(28, 234, `Updated ${today} · totals only; private repository names are not shown`, 11, theme.muted),
  ].join(''),
);
await writeFile(resolve(root, 'assets/activity.svg'), graph);

if (process.argv.includes('--languages')) {
  const repositories = [];
  for (let page = 1; ; page++) {
    const result = github(`user/repos?affiliation=owner&per_page=100&page=${page}`);
    repositories.push(...result.filter((repo) => !repo.fork));
    if (result.length < 100) break;
  }
  const totals = {};
  for (const repo of repositories) {
    for (const [language, bytes] of Object.entries(github(`repos/${repo.full_name}/languages`))) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Invalid language metric.');
      totals[language] = (totals[language] || 0) + bytes;
    }
  }
  const entries = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const total = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  if (!total || !entries.length) throw Error('No language data; the existing image was preserved.');
  const colors = {
    TypeScript: '#FF985C',
    JavaScript: '#FFB181',
    Python: theme.accent,
    HTML: '#F5823C',
    CSS: '#C2A092',
    Java: '#D9AD96',
    PowerShell: '#A8A8AD',
  };
  const height = 94 + entries.length * 24;
  const body = [
    text(20, 30, 'My programming languages', 17, theme.accent),
    text(20, 51, 'By code size · accessible repos, no forks', 11, theme.muted),
  ];
  entries.forEach(([language, bytes], index) => {
    const y = 80 + index * 24;
    body.push(
      `<circle cx="24" cy="${y - 4}" r="5" fill="${colors[language] || theme.muted}"/>`,
      text(38, y, language),
      text(235, y, `${((bytes / total) * 100).toFixed(1)}%`),
    );
  });
  body.push(
    text(
      20,
      height - 12,
      `GitHub API · ${repositories.length} repositories · ${today}`,
      10,
      theme.muted,
    ),
  );
  await writeFile(
    resolve(root, 'assets/top-langs.svg'),
    svg(340, height, 'Languages in the included repositories', body.join('')),
  );
}

console.log(`Local chart updated: ${days.length} days of GitHub contribution data.`);
