export function retainContributionHistory(data, previous) {
  const prior = previous?.pastYearContributions;
  if (data.pastYearContributions !== 0 || !Number.isSafeInteger(prior) || prior <= 0)
    return { ...data, activityCheckedAt: data.checkedAt, activityPending: false };
  if (
    !Array.isArray(previous.days) ||
    previous.days.length !== 31 ||
    previous.days.some(
      (day) => !Number.isSafeInteger(day.contributions) || day.contributions < 0,
    ) ||
    !Number.isFinite(Date.parse(previous.activityCheckedAt || previous.checkedAt))
  )
    throw Error('Previous contribution snapshot is invalid.');
  // A sudden empty contribution calendar must not erase an already verified history.
  // Keep its original date; never present the old counts as a successful new collection.
  return {
    ...data,
    days: previous.days,
    pastYearContributions: prior,
    privateContributionsReported: previous.privateContributionsReported ?? null,
    hasSharedPrivateContributions: previous.hasSharedPrivateContributions ?? null,
    activityCheckedAt: previous.activityCheckedAt || previous.checkedAt,
    activityPending: true,
  };
}

export function contributionSnapshot(data) {
  return {
    checkedAt: data.checkedAt,
    activityCheckedAt: data.activityCheckedAt,
    pastYearContributions: data.pastYearContributions,
    privateContributionsReported: data.privateContributionsReported,
    hasSharedPrivateContributions: data.hasSharedPrivateContributions,
    days: data.days,
  };
}
