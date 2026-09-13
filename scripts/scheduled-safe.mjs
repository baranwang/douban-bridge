export const SCHEDULED_UNMAPPED_CAP = 5;

export function assertScheduledSafe(unmappedCount, cap = SCHEDULED_UNMAPPED_CAP) {
  if (!Number.isInteger(unmappedCount) || unmappedCount < 0) {
    throw new Error(`scheduled probe: invalid unmapped count ${unmappedCount}`);
  }
  if (unmappedCount > cap) {
    throw new Error(
      `scheduled probe skipped: ${unmappedCount} unmapped/uncalibrated douban_mapping rows exceed cap ${cap}; will not run full-history cron`,
    );
  }
  if (unmappedCount !== 0) {
    throw new Error(
      `scheduled probe skipped: ${unmappedCount} unmapped/uncalibrated rows remain (need 0-row fixture; cap ${cap})`,
    );
  }
}
