/**
 * Central branding configuration.
 *
 * Everything visual that is company-specific lives here. To rebrand the
 * application, drop a new logo into `public/brand/` and edit this file only.
 */
import { withBasePath } from '@/lib/base-path'


export type BrandConfig = {
  /** Company name shown next to the logo and used in export filenames. */
  name: string
  /** Short product name shown under the logo on the login screen. */
  productName: string
  /** Mark for dark/gradient surfaces - the navy wordmark lifted to white. */
  logoLight: string
  /** Logo used on light surfaces (app shell top bar). */
  logoDark: string
  /** Square mark used for favicons / compact spaces. */
  mark: string
  /** Browser tab title suffix. */
  titleSuffix: string
  /** Primary brand colour. Must stay in sync with `--brand-*` in globals.css. */
  primary: string
  /** Secondary accent used in gradients and glows. */
  accent: string
  /** Default currency used when a company does not override it. */
  defaultCurrency: string
  /** Support contact surfaced in error states. */
  supportEmail: string
}

export const brand: BrandConfig = {
  name: 'AWS Distribution',
  productName: 'Pipeline Management System',
  logoLight: withBasePath('/brand/mark-light.svg'),
  logoDark: withBasePath('/brand/mark.svg'),
  mark: withBasePath('/brand/mark.svg'),
  titleSuffix: 'Pipeline',
  primary: '#302078',
  accent: '#E8681A',
  defaultCurrency: 'AED',
  supportEmail: 'it@awsdistribution.ae',
}

/**
 * Deterministic palette used for company cards, avatars and any other place
 * that needs a stable colour derived from an id/name.
 */
export const ACCENT_PALETTE = [
  '#302078',
  '#E8681A',
  '#7C3AED',
  '#E0691A',
  '#0E7490',
  '#BE185D',
  '#4D7C0F',
  '#B45309',
] as const

export function accentFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length]
}
