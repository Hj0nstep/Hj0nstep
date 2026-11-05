import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectProfile } from './profile-data.mjs';
import { renderCharts, updateReadme } from './profile-svg.mjs';

const root = resolve(import.meta.dirname, '..');
function github(endpoint, body, token = undefined) {
  const result = spawnSync('gh', ['api', endpoint, ...(body ? ['--input', '-'] : [])], {
    input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60000,
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  });
  if (result.status !== 0) throw Error('GitHub data unavailable; existing charts preserved.');
  return JSON.parse(result.stdout);
}
let cachedLanguages;
try {
  cachedLanguages = JSON.parse(
    await readFile(resolve(root, 'assets/language-inventory.json'), 'utf8'),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const includePrivate =
  process.env.PROFILE_INCLUDE_PRIVATE === 'true' || Boolean(process.env.PROFILE_READ_TOKEN);
const data = await collectProfile(github, new Date(), {
  includePrivate,
  cachedLanguages,
  profileGithub: (endpoint, body) => github(endpoint, body, process.env.PROFILE_READ_TOKEN),
  languageGithub: (endpoint, body) => github(endpoint, body, process.env.PROFILE_READ_TOKEN),
});
if (!includePrivate && data.languageInventory.scope === 'all-owned')
  console.log(
    '::warning::Private language inventory preserved at its original check time; configure PROFILE_READ_TOKEN to refresh it remotely.',
  );
const charts = renderCharts(data);
const readme = updateReadme(await readFile(resolve(root, 'README.md'), 'utf8'), charts);
// Finish all API calls and validation before changing any published output.
await mkdir(resolve(root, 'assets'), { recursive: true });
for (const [name, content] of Object.entries(charts))
  await writeFile(resolve(root, 'assets', name), content);
await writeFile(resolve(root, 'assets/profile-metrics.json'), JSON.stringify(data, null, 2) + '\n');
await writeFile(
  resolve(root, 'assets/language-inventory.json'),
  JSON.stringify(data.languageInventory, null, 2) + '\n',
);
await writeFile(resolve(root, 'README.md'), readme);
console.log(
  JSON.stringify({
    checkedAt: data.checkedAt,
    days: data.days.length,
    publicRepositories: data.publicRepositories,
    languageCount: Object.keys(data.languageBytes).length,
    languageScope: data.languageInventory.scope,
    charts: Object.keys(charts),
  }),
);
