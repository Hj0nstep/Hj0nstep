import { collectLanguages, validateInventory } from './language-inventory.mjs';
export const profileLogin = 'Hj0nstep';
export const profileTimeZone = 'America/Sao_Paulo';

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw Error(`Invalid ${label}; existing charts preserved.`);
  return value;
}

export async function collectProfile(github, now = new Date(), options = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profileTimeZone }).format(now);
  const response = await (options.profileGithub || github)('graphql', {
    query:
      'query($login:String!){user(login:$login){followers{totalCount} contributionsCollection{restrictedContributionsCount hasAnyRestrictedContributions contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}',
    variables: { login: profileLogin },
  });
  const user = response.data?.user;
  if (response.errors?.length || !user)
    throw Error('GitHub profile unavailable; existing charts preserved.');
  const calendar = user.contributionsCollection?.contributionCalendar;
  const recent = calendar?.weeks
    ?.flatMap((week) => week.contributionDays)
    .filter((day) => day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-31);
  if (!recent?.length || recent.at(-1).date !== today)
    throw Error('Contribution calendar is not current.');
  const days = recent.map((day) => ({
    date: day.date,
    contributions: count(day.contributionCount, 'daily contributions'),
  }));
  for (let i = 0; i < days.length; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(days[i].date)) throw Error('Invalid contribution date.');
    if (i && Date.parse(days[i].date) - Date.parse(days[i - 1].date) !== 86400000)
      throw Error('Contribution dates must be consecutive.');
  }
  if (days.length !== 31) throw Error('Expected a complete 31-day calendar.');

  const repositories = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await github(
      `users/${profileLogin}/repos?type=owner&sort=full_name&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) throw Error('Invalid repository page.');
    repositories.push(
      ...batch.filter(
        (repo) =>
          repo.private === false && repo.owner?.login?.toLowerCase() === profileLogin.toLowerCase(),
      ),
    );
    if (batch.length < 100) break;
    if (page === 100) throw Error('Repository pagination did not finish.');
  }
  const originalRepositories = repositories.filter((repo) => !repo.fork);
  const inventory = options.includePrivate
    ? await collectLanguages(options.languageGithub || github, now, true)
    : options.cachedLanguages
      ? validateInventory(options.cachedLanguages)
      : await collectLanguages(github, now, false);
  // Only aggregate data leaves this function; never publish repository identities.
  return {
    login: profileLogin,
    checkedAt: now.toISOString(),
    timeZone: profileTimeZone,
    repositoryScope:
      'Public repository count; stars exclude forks; language scope recorded separately',
    languageInventory: inventory,
    contributionScope:
      'Contribution counts returned by GitHub, subject to GitHub visibility and indexing',
    publicRepositories: repositories.length,
    originalPublicRepositories: originalRepositories.length,
    stars: originalRepositories.reduce(
      (total, repo) => total + count(repo.stargazers_count, 'stars'),
      0,
    ),
    followers: count(user.followers?.totalCount, 'followers'),
    privateContributionsReported: user.contributionsCollection.restrictedContributionsCount ?? null,
    hasSharedPrivateContributions:
      user.contributionsCollection.hasAnyRestrictedContributions ?? null,
    pastYearContributions: count(calendar.totalContributions, 'past-year contributions'),
    days,
    languageBytes: inventory.languageBytes,
  };
}
