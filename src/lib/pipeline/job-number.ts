/**
 * How a job number is written.
 *
 * `<prefix><number>_<suffix>` - for example `J1000_DXB`. Both the prefix and
 * the suffix are per-company settings and either may be empty, so a company
 * that sets neither still gets a plain `1000`.
 *
 * The separator belongs to the suffix, not to the number: without a suffix
 * there is nothing to separate, and a trailing underscore would end up in
 * every job number the company ever issues.
 *
 * Shared by the allocator and by the admin screen's preview, so what an
 * administrator is shown while typing is what the next request will carry.
 */
export function formatJobNo(prefix: string, serial: number | string, suffix: string): string {
  const tail = suffix.trim() ? `_${suffix.trim()}` : ''
  return `${prefix.trim()}${serial}${tail}`
}
