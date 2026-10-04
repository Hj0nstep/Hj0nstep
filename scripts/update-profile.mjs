import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const login = 'Hj0nstep';
const today = new Date().toISOString().slice(0, 10);
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
    throw Error('GitHub não respondeu à consulta; os gráficos anteriores foram preservados.');
  return JSON.parse(result.stdout);
}
const svg = (width, height, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="Segoe UI,Arial,sans-serif"><title>${escape(title)}</title><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14" fill="#0D0D0F" stroke="#303038"/>${body}</svg>\n`;
const text = (x, y, value, size = 12, color = '#C9C9CF') =>
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
  throw Error('Calendário inválido.');
const max = Math.max(1, ...days.map((day) => day.contributionCount));
const points = days.map((day, i) => `${36 + i * 25},${180 - (day.contributionCount / max) * 105}`).join(' ');
const graph = svg(
  840,
  255,
  `Atividade de ${login}: ${days.length} dias, consultada em ${today}`,
  [
    text(28, 32, 'Atividade no GitHub', 19, '#E5E5EA'),
    text(28, 54, 'Contribuições por dia · dados consultados na API GitHub', 12, '#9A9AA2'),
    `<path d="M36 180H800" stroke="#303038"/>`,
    `<polyline points="${points}" stroke="#E0AA3E" stroke-width="3" fill="none"/>`,
    ...days.map(
      (day, i) =>
        `<circle cx="${36 + i * 25}" cy="${180 - (day.contributionCount / max) * 105}" r="3" fill="#E0AA3E"><title>${escape(day.date)}: ${day.contributionCount}</title></circle>`,
    ),
    text(
      28,
      209,
      `${days[0].date} — ${days.at(-1).date} · ${days.reduce((sum, day) => sum + day.contributionCount, 0)} contribuições no período`,
    ),
    text(28, 234, `Atualizado em ${today} · agregado, sem nomes de repositórios privados`, 11, '#9A9AA2'),
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
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Métrica de linguagens inválida.');
      totals[language] = (totals[language] || 0) + bytes;
    }
  }
  const entries = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const total = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  if (!total || !entries.length) throw Error('Linguagens sem dados; imagem anterior preservada.');
  const colors = {
    TypeScript: '#3178C6',
    JavaScript: '#F1E05A',
    Python: '#3572A5',
    HTML: '#E34C26',
    CSS: '#8064BD',
    Java: '#B07219',
    PowerShell: '#5391FE',
  };
  const height = 94 + entries.length * 24;
  const body = [
    text(20, 30, 'My Programming Languages', 17, '#E5E5EA'),
    text(20, 51, 'Por bytes de código · repositórios acessíveis sem forks', 11, '#9A9AA2'),
  ];
  entries.forEach(([language, bytes], index) => {
    const y = 80 + index * 24;
    body.push(
      `<circle cx="24" cy="${y - 4}" r="5" fill="${colors[language] || '#9A9AA2'}"/>`,
      text(38, y, language),
      text(235, y, `${((bytes / total) * 100).toFixed(1)}%`),
    );
  });
  body.push(
    text(
      20,
      height - 12,
      `Fonte: API GitHub · ${repositories.length} repositórios · ${today}`,
      10,
      '#9A9AA2',
    ),
  );
  await writeFile(
    resolve(root, 'assets/top-langs.svg'),
    svg(340, height, 'Linguagens dos repositórios consultados', body.join('')),
  );
}

console.log(`Gráfico local atualizado: ${days.length} dias com dados GitHub reais.`);
