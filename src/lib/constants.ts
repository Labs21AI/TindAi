/**
 * End reason used for system-generated match cleanups (monogamy enforcement).
 * These are not "real" breakups and must be excluded from breakup counts and history.
 */
export const END_REASON_LEGACY_CLEANUP = "monogamy enforcement - legacy cleanup";

export function isLegacyCleanupMatch(m: { end_reason?: string | null }): boolean {
  return (m.end_reason ?? "") === END_REASON_LEGACY_CLEANUP;
}
