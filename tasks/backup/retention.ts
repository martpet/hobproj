export type RetentionPolicy = {
  daily: number;
  weekly: number;
  monthly: number;
};

export const DEFAULT_RETENTION: RetentionPolicy = {
  daily: 7,
  weekly: 4,
  monthly: 6,
};

/**
 * Timestamps are directory names produced by the backup task, e.g.
 * `2026-09-10T16-48-12.273Z`. Only the time separators are replaced, so
 * restoring the colons yields a parsable ISO string.
 */
export function parseBackupTimestamp(name: string): Date | undefined {
  const restored = name.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/,
    "$1T$2:$3:$4",
  );
  const date = new Date(restored);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dailyBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weeklyBucket(date: Date): string {
  // Shift to the preceding Monday so a bucket is a calendar week.
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function monthlyBucket(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Returns the backup names that may be deleted. The newest backup in each
 * bucket is kept, so a backup survives if it is the most recent of its day,
 * week or month and that bucket is still within the policy's limit.
 */
export function selectExpiredBackups(
  names: string[],
  policy: RetentionPolicy = DEFAULT_RETENTION,
): string[] {
  const dated = names
    .map((name) => ({ name, date: parseBackupTimestamp(name) }))
    .filter((entry): entry is { name: string; date: Date } =>
      entry.date !== undefined
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const kept = new Set<string>();
  const buckets: [(date: Date) => string, number][] = [
    [dailyBucket, policy.daily],
    [weeklyBucket, policy.weekly],
    [monthlyBucket, policy.monthly],
  ];

  for (const [bucketOf, limit] of buckets) {
    const seen = new Set<string>();
    for (const entry of dated) {
      const bucket = bucketOf(entry.date);
      if (seen.has(bucket)) continue;
      if (seen.size >= limit) break;
      seen.add(bucket);
      kept.add(entry.name);
    }
  }

  return dated
    .filter((entry) => !kept.has(entry.name))
    .map((entry) => entry.name);
}
