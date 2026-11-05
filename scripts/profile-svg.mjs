import { createHash } from 'node:crypto';

const theme = {
  background: '#101012',
  border: '#303034',
  accent: '#FF6B1C',
  text: '#E8E8E5',
  muted: '#A8A8AD',
};
export const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const text = (x, y, value, size = 12, color = theme.text) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeXml(value)}</text>`;
const svg = (width, height, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="Segoe UI,Arial,sans-serif"><title>${escapeXml(title)}</title><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14" fill="${theme.background}" stroke="${theme.border}"/>${body}</svg>\n`;
function checkedLabel(data) {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: data.timeZone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(data.checkedAt)) + ' BRT'
  );
}

export function renderCharts(data) {
  const max = Math.max(1, ...data.days.map((day) => day.contributions));
  const position = (day, index) => [
    36 + index * (750 / (data.days.length - 1)),
    180 - (day.contributions / max) * 105,
  ];
  const points = data.days.map((day, index) => position(day, index).join(',')).join(' ');
  const activity = svg(
    840,
    255,
    `Activity for ${data.login}, checked ${checkedLabel(data)}`,
    [
      text(28, 32, 'GitHub activity', 19, theme.accent),
      text(28, 54, 'GitHub contributions · public + shared private activity', 12, theme.muted),
      `<path d="M36 180H800" stroke="${theme.border}"/>`,
      `<polyline points="${points}" stroke="${theme.accent}" stroke-width="3" fill="none"/>`,
      ...data.days.map((day, index) => {
        const [x, y] = position(day, index);
        return `<circle cx="${x}" cy="${y}" r="3" fill="${theme.accent}"><title>${escapeXml(day.date)}: ${day.contributions}</title></circle>`;
      }),
      text(
        28,
        209,
        `${data.days[0].date} to ${data.days.at(-1).date} · ${data.days.reduce((total, day) => total + day.contributions, 0)} contributions`,
      ),
      text(
        28,
        234,
        `Checked ${checkedLabel(data)} · GitHub may index contributions later`,
        11,
        theme.muted,
      ),
    ].join(''),
  );

  const entries = Object.entries(data.languageBytes).sort((a, b) => b[1] - a[1]);
  const languageHeight = Math.max(286, 112 + entries.length * 24);
  const allOwned = data.languageInventory.scope === 'all-owned';
  const total = Object.values(data.languageBytes).reduce((sum, bytes) => sum + bytes, 0);
  const languagesBody = [
    text(20, 30, 'My programming languages', 17, theme.accent),
    text(
      20,
      51,
      allOwned
        ? 'All owned repos · public + private + forks'
        : 'Public owned repositories · including forks',
      11,
      theme.muted,
    ),
  ];
  if (!total) languagesBody.push(text(20, 90, 'No language data available.', 12, theme.muted));
  entries.forEach(([language, bytes], index) => {
    const y = 80 + index * 24;
    languagesBody.push(
      `<circle cx="24" cy="${y - 4}" r="5" fill="${theme.accent}"/>`,
      text(38, y, language),
      text(255, y, `${(bytes / total) * 100 < 0.1 ? '<0.1' : ((bytes / total) * 100).toFixed(1)}%`),
    );
  });
  languagesBody.push(
    text(
      20,
      languageHeight - 16,
      `Inventory: ${checkedLabel({ ...data, checkedAt: data.languageInventory.checkedAt })}`,
      10,
      theme.muted,
    ),
  );
  const languages = svg(
    340,
    languageHeight,
    'All languages detected by GitHub in the included owned repositories',
    languagesBody.join(''),
  );
  const summaryRows = [
    ['Contributions · past year', data.pastYearContributions],
    ['Public repositories', data.publicRepositories],
    ['Stars · public originals', data.stars],
    ['Followers', data.followers],
  ];
  const summary = svg(
    480,
    286,
    'GitHub profile overview',
    [
      text(24, 32, 'GitHub overview', 19, theme.accent),
      text(24, 56, 'Official GitHub API · no third-party stats service', 11, theme.muted),
      ...summaryRows.flatMap(([label, value], index) => [
        text(24, 96 + index * 38, label, 14),
        text(395, 96 + index * 38, value, 18, theme.accent),
      ]),
      text(24, 265, `Checked ${checkedLabel(data)}`, 10, theme.muted),
    ].join(''),
  );
  return { 'activity.svg': activity, 'top-langs.svg': languages, 'stats.svg': summary };
}

export function updateReadme(readme, charts) {
  const hash = createHash('sha256')
    .update(Object.values(charts).join(''))
    .digest('hex')
    .slice(0, 16);
  const block = `<!-- profile-metrics:start -->\n<img width="480" src="assets/stats.svg?v=${hash}" alt="GitHub overview from the official API" />\n<img width="340" src="assets/top-langs.svg?v=${hash}" alt="All detected languages by code size; repository scope and inventory check time shown in chart" />\n\n<img width="100%" src="assets/activity.svg?v=${hash}" alt="Daily contributions returned by GitHub, with the last check time" />\n<!-- profile-metrics:end -->`;
  if (
    !readme.includes('<!-- profile-metrics:start -->') ||
    !readme.includes('<!-- profile-metrics:end -->')
  )
    throw Error('Managed README region missing; README preserved.');
  return readme.replace(
    /<!-- profile-metrics:start -->[\s\S]*?<!-- profile-metrics:end -->/,
    block,
  );
}
