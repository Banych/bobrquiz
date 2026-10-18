export const DEFAULT_POOL_MAX = 2;

/**
 * Pool size for the pg adapter: unset or blank returns DEFAULT_POOL_MAX;
 * throws on anything but a positive integer.
 */
export function resolvePoolMax(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_POOL_MAX;
  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
    throw new Error(
      `DATABASE_POOL_MAX must be a positive integer, got "${trimmed}".`
    );
  }
  return Number(trimmed);
}
