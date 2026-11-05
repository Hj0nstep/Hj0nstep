const owner = 'Hj0nstep';
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateInventory(value) {
  if (
    value?.version !== 1 ||
    value.login !== owner ||
    !['all-owned', 'public-owned'].includes(value.scope) ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    !validCount(value.repositoryCount) ||
    !validCount(value.privateRepositoryCount) ||
    value.includesForks !== true ||
    !value.languageBytes ||
    Array.isArray(value.languageBytes) ||
    Object.values(value.languageBytes).some((bytes) => !validCount(bytes))
  )
    throw Error('Invalid language inventory; existing charts preserved.');
  // Rebuild an allowlisted aggregate, excluding any unexpected repository fields.
  return {
    version: 1,
    login: owner,
    checkedAt: value.checkedAt,
    scope: value.scope,
    repositoryCount: value.repositoryCount,
    privateRepositoryCount: value.privateRepositoryCount,
    includesForks: true,
    languageBytes: { ...value.languageBytes },
  };
}

export async function collectLanguages(github, now, includePrivate = false) {
  if (includePrivate) {
    const viewer = await github('user');
    if (viewer.login?.toLowerCase() !== owner.toLowerCase())
      throw Error('Private inventory requires the profile owner.');
  }
  const repositories = new Map();
  for (let page = 1; page <= 100; page++) {
    const endpoint = includePrivate
      ? `user/repos?affiliation=owner&visibility=all&sort=full_name&per_page=100&page=${page}`
      : `users/${owner}/repos?type=owner&sort=full_name&per_page=100&page=${page}`;
    const batch = await github(endpoint);
    if (!Array.isArray(batch)) throw Error('Invalid repository inventory.');
    for (const repo of batch) {
      if (
        repo.owner?.login?.toLowerCase() !== owner.toLowerCase() ||
        (!includePrivate && repo.private !== false)
      )
        continue;
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo.full_name) || typeof repo.private !== 'boolean')
        throw Error('Invalid repository metadata.');
      repositories.set(repo.full_name, repo);
    }
    if (batch.length < 100) break;
    if (page === 100) throw Error('Repository inventory did not finish.');
  }
  const languageBytes = Object.create(null);
  for (const repo of repositories.values()) {
    const languages = await github(`repos/${repo.full_name}/languages`);
    if (!languages || typeof languages !== 'object' || Array.isArray(languages))
      throw Error('Invalid language response.');
    for (const [language, bytes] of Object.entries(languages)) {
      if (!validCount(bytes) || !validCount((languageBytes[language] || 0) + bytes))
        throw Error('Invalid language size.');
      if (bytes) languageBytes[language] = (languageBytes[language] || 0) + bytes;
    }
  }
  return validateInventory({
    version: 1,
    login: owner,
    checkedAt: now.toISOString(),
    scope: includePrivate ? 'all-owned' : 'public-owned',
    repositoryCount: repositories.size,
    privateRepositoryCount: [...repositories.values()].filter((repo) => repo.private).length,
    includesForks: true,
    languageBytes,
  });
}
