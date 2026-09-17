import { format, isValid, parseISO } from 'date-fns'

export const DISPLAY_DATE_FORMAT = 'dd MMM yyyy'
export const DISPLAY_DATETIME_FORMAT = 'dd MMM yyyy, HH:mm'

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : parseISO(value)
  return isValid(date) ? date : null
}

export function formatDate(value: Date | string | null | undefined, fallback = ''): string {
  const date = toDate(value)
  return date ? format(date, DISPLAY_DATE_FORMAT) : fallback
}

export function formatDateTime(value: Date | string | null | undefined, fallback = ''): string {
  const date = toDate(value)
  return date ? format(date, DISPLAY_DATETIME_FORMAT) : fallback
}

/** `2026-09-16` - the wire format used in filter query strings. */
export function toISODate(value: Date | string | null | undefined): string | null {
  const date = toDate(value)
  return date ? format(date, 'yyyy-MM-dd') : null
}

/**
 * Parse a `yyyy-MM-dd` string into a UTC-midnight Date.
 *
 * Enquiry dates are calendar dates, not instants. Storing them at UTC midnight
 * keeps them stable no matter which timezone the browser is in - otherwise a
 * user in GST (UTC+4) entering "16 Sep" can read it back as "15 Sep".
 */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    const parsed = toDate(value)
    if (!parsed) return null
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
  }
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Render a calendar date without letting the timezone move it.
 *
 * Two shapes arrive here and they need opposite treatment:
 *   - a `yyyy-MM-dd` string (a filter value) is already a calendar date, so it
 *     is formatted from its parts with no conversion at all;
 *   - a Date from the database is stored at UTC midnight, so it is shifted by
 *     the local offset first.
 *
 * Getting this wrong is how "1 Sep" renders as "31 Aug" east of UTC.
 */
export function formatCalendarDate(
  value: Date | string | null | undefined,
  fallback = '',
): string {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value.trim())
    if (match) {
      const [, year, month, day] = match
      return format(new Date(Number(year), Number(month) - 1, Number(day)), DISPLAY_DATE_FORMAT)
    }
  }

  const date = toDate(value)
  if (!date) return fallback
  const utc = new Date(date.getTime() + date.getTimezoneOffset() * 60_000)
  return format(utc, DISPLAY_DATE_FORMAT)
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'AED',
  options: { compact?: boolean; withSymbol?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return ''
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return ''

  const formatter = new Intl.NumberFormat('en-AE', {
    style: options.withSymbol === false ? 'decimal' : 'currency',
    currency,
    minimumFractionDigits: options.compact ? 0 : 2,
    maximumFractionDigits: options.compact ? 1 : 2,
    notation: options.compact ? 'compact' : 'standard',
  })
  return formatter.format(numeric)
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return ''
  return new Intl.NumberFormat('en-AE').format(numeric)
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return ''
  return `${numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(1)}%`
}

/** "2 minutes ago", "3 days ago" - used by the audit feed. */
export function formatRelative(value: Date | string | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(date)
}

/** Digits-only comparison so "+971 50 123 4567" matches a search for "501234". */
export function normalizePhone(value: string): string {
  return value.replace(/[^\d]/g, '')
}
