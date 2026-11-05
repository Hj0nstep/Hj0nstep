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
      if (endpoint === 'user') return { login: 'Hj0nstep' };
      if (endpoint.startsWith('users/') || endpoint.startsWith('user/repos'))
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
      if (endpoint === 'repos/Hj0nstep/fork-fictional/languages') return { Rust: 5 };
      if (endpoint === 'repos/Hj0nstep/private-fictional/languages') return { Java: 100 };
      throw Error('Unexpected API request');
    },
  };
}

test('public mode excludes private code but includes all owned forks without leaking identifiers', async () => {
  const fake = fakeGithub();
  const data = await collectProfile(fake.github, now);
  assert.equal(data.days.length, 31);
  assert.equal(data.days.at(-1).date, '2026-11-05');
  assert.equal(data.publicRepositories, 2);
  assert.equal(data.originalPublicRepositories, 1);
  assert.equal(data.stars, 3);
  assert.deepEqual(data.languageBytes, { TypeScript: 80, Python: 20, Rust: 5 });
  assert.equal(JSON.stringify(data).includes('fictional'), false);
  assert.equal(
    fake.requested.some((endpoint) => endpoint.includes('/private-')),
    false,
  );
  assert.equal(
    fake.requested.some((endpoint) => endpoint.includes('/fork-')),
    true,
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

test('owner-authorized inventory includes private languages and caches only anonymous aggregate data', async () => {
  const fake = fakeGithub();
  const full = await collectProfile(fake.github, now, { includePrivate: true });
  assert.equal(full.languageInventory.scope, 'all-owned');
  assert.equal(full.languageInventory.repositoryCount, 3);
  assert.equal(full.languageInventory.privateRepositoryCount, 1);
  assert.deepEqual(full.languageBytes, { TypeScript: 80, Python: 20, Rust: 5, Java: 100 });
  assert.equal(JSON.stringify(full).includes('private-fictional'), false);
  const publicOnly = fakeGithub();
  const refreshed = await collectProfile(publicOnly.github, new Date('2026-11-05T16:00:00Z'), {
    cachedLanguages: full.languageInventory,
  });
  assert.deepEqual(refreshed.languageBytes, full.languageBytes);
  assert.equal(refreshed.languageInventory.checkedAt, full.languageInventory.checkedAt);
  assert.equal(
    publicOnly.requested.some((url) => url.endsWith('/languages')),
    false,
  );
});

test('private mode rejects a different authenticated account', async () => {
  const fake = fakeGithub();
  await assert.rejects(
    collectProfile(
      (endpoint) => (endpoint === 'user' ? { login: 'someone-else' } : fake.github(endpoint)),
      now,
      { includePrivate: true },
    ),
    /profile owner/,
  );
});

test('language chart renders every language beyond eight with enough room and preserves independent inventory date', async () => {
  const data = await collectProfile(fakeGithub().github, now);
  data.languageBytes = Object.fromEntries(
    Array.from({ length: 14 }, (_, n) => [`Language${n}`, n + 1]),
  );
  data.languageInventory.checkedAt = '2026-11-04T15:00:00Z';
  const output = renderCharts(data)['top-langs.svg'];
  for (let n = 0; n < 14; n++) assert.ok(output.includes(`>Language${n}<`));
  assert.ok(output.includes('height="448"'));
  assert.ok(output.includes('04/11/2026'));
});

test('sudden zero calendar preserves original verified timestamp without preventing language refresh', async () => {
  const { retainContributionHistory } = await import('./contribution-snapshot.mjs');
  const previous = await collectProfile(fakeGithub().github, now);
  const empty = {
    ...previous,
    checkedAt: '2026-11-05T18:00:00Z',
    pastYearContributions: 0,
    days: previous.days.map((day) => ({ ...day, contributions: 0 })),
    languageBytes: { Java: 999 },
  };
  const preserved = retainContributionHistory(empty, previous);
  assert.equal(preserved.activityPending, true);
  assert.equal(preserved.activityCheckedAt, previous.checkedAt);
  assert.deepEqual(preserved.days, previous.days);
  assert.deepEqual(preserved.languageBytes, { Java: 999 });
  assert.ok(renderCharts(preserved)['activity.svg'].includes('rechecking GitHub calendar'));
  const recovered = retainContributionHistory(
    { ...previous, checkedAt: '2026-11-05T19:00:00Z' },
    preserved,
  );
  assert.equal(recovered.activityPending, false);
  assert.equal(recovered.activityCheckedAt, '2026-11-05T19:00:00Z');
});
