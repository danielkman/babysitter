let snapshotCache = { data: null, timestamp: 0, org: null };
export const CACHE_TTL_MS = Number(process.env.KRATE_SNAPSHOT_CACHE_TTL_MS || 10_000);

export function getSnapshotCache() {
  return snapshotCache;
}

export function setSnapshotCache(data, org) {
  snapshotCache = { data, timestamp: Date.now(), org };
}

export function clearSnapshotCache() {
  snapshotCache = { data: null, timestamp: 0, org: null };
}
