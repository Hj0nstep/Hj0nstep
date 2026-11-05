import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProfile } from './profile-data.mjs';
import { renderCharts, updateReadme, escapeXml } from './profile-svg.mjs';

const now = new Date('2026-11-05T15:00:00Z');
function fixture() {
  const contributionDays = Array.from({ length: 31 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 6 + index)).toISOString().slice(0, 10),
    contributionCount: index % 3,
  }));
  return {
    data: {
      user: {
        followers: { totalCount: 2 },
        contributionsCollection: {
          contributionCalendar: { totalContributions: 120, weeks: [{ contributionDays }] },
        },
      },
    },
  };
}
function fakeGithub(calendar = fixture()) {
  const requested = [];
  return {
    requested,
    github: (endpoint) => {
      requested.push(endpoint);
      if (endpoint === 'graphql') return calendar;
      if (endpoint.startsWith('users/'))
        return [
          {
            private: false,
            fork: false,
            owner: { login: 'Hj0nstep' },
            full_name: 'Hj0nstep/public-fictional',
            stargazers_count: 3,
          },
          {
            private: false,
            fork: true,
            owner: { login: 'Hj0nstep' },
            full_name: 'Hj0nstep/fork-fictional',
            stargazers_count: 99,
          },
          {
            private: true,
            fork: false,
            owner: { login: 'Hj0nstep' },
            full_name: 'Hj0nstep/private-fictional',
            stargazers_count: 50,
          },
        ];
      if (endpoint === 'repos/Hj0nstep/public-fictional/languages')
        return { TypeScript: 80, Python: 20 };
      throw Error('Unexpected API request');
    },
  };
}

test('metrics aggregate public data and exclude private/fork code without leaking repository identifiers', async () => {
  const fake = fakeGithub();
  const data = await collectProfile(fake.github, now);
  assert.equal(data.days.length, 31);
  assert.equal(data.days.at(-1).date, '2026-11-05');
  assert.equal(data.publicRepositories, 2);
  assert.equal(data.originalPublicRepositories, 1);
  assert.equal(data.stars, 3);
  assert.deepEqual(data.languageBytes, { TypeScript: 80, Python: 20 });
  assert.equal(JSON.stringify(data).includes('fictional'), false);
  assert.equal(
    fake.requested.some((endpoint) => endpoint.includes('/private-')),
    false,
  );
  assert.equal(
    fake.requested.some((endpoint) => endpoint.includes('/fork-')),
    false,
  );
});

test('São Paulo day boundary does not advance at UTC midnight', async () => {
  const data = await collectProfile(fakeGithub().github, new Date('2026-11-06T01:00:00Z'));
  assert.equal(data.days.at(-1).date, '2026-11-05');
});

test('API failures, invalid counts and incomplete dates reject instead of inventing zeros', async () => {
  await assert.rejects(
    collectProfile(() => {
      throw Error('API offline');
    }, now),
    /API offline/,
  );
  await assert.rejects(
    collectProfile(fakeGithub({ errors: [{ message: 'Denied' }] }).github, now),
    /unavailable/,
  );
  const bad = fixture();
  bad.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays[0].contributionCount =
    -1;
  await assert.rejects(collectProfile(fakeGithub(bad).github, now), /Invalid/);
  const stale = fixture();
  stale.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays.pop();
  await assert.rejects(collectProfile(fakeGithub(stale).github, now), /not current/);
});

test('all charts share collection time, render zero safely, and language labels are escaped', async () => {
  const data = await collectProfile(fakeGithub().github, now);
  data.languageBytes = { 'X<script>': 1 };
  data.days.forEach((day) => {
    day.contributions = 0;
  });
  const charts = renderCharts(data);
  assert.equal(Object.keys(charts).length, 3);
  for (const content of Object.values(charts)) {
    assert.ok(content.includes('05/11/2026'));
    assert.equal(/NaN|Infinity|<script>/.test(content), false);
  }
  assert.ok(charts['top-langs.svg'].includes('X&lt;script&gt;'));
  assert.equal(escapeXml('"<&'), '&quot;&lt;&amp;');
});

test('cache keys refresh when data changes and edits preserve content outside managed charts', async () => {
  const data = await collectProfile(fakeGithub().github, now);
  const readme =
    '# Biography\n<!-- profile-metrics:start -->old<!-- profile-metrics:end -->\nContact unchanged';
  const output = updateReadme(readme, renderCharts(data));
  assert.ok(output.startsWith('# Biography\n'));
  assert.ok(output.endsWith('Contact unchanged'));
  assert.equal((output.match(/\?v=/g) || []).length, 3);
  assert.equal(updateReadme(output, renderCharts(data)), output);
  data.followers++;
  assert.notEqual(updateReadme(output, renderCharts(data)), output);
  assert.throws(() => updateReadme('No managed region', {}), /missing/);
});
