import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Narrow an unknown error into a user-safe message. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Stable initials for avatars. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const INK = '#0F172A'
const PAPER = '#FFFFFF'

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const channel = (start: number) => {
    const c = parseInt(full.slice(start, start + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Whichever of ink or paper reads better on this colour.
 *
 * Decided by comparing the two contrast ratios rather than by a luminance
 * cutoff. A cutoff has to guess where the crossover is, and the guess was too
 * high: amber came out as "dark enough for white text" at a ratio of 2.1:1,
 * when black on the same amber gives 7.7:1. Comparing the ratios cannot be
 * wrong about which of two options is more readable.
 */
export function readableForeground(hex: string): string {
  return contrast(hex, INK) >= contrast(hex, PAPER) ? INK : PAPER
}

/** `#1E4FD8` -> `30 79 216`, for use in `rgb(var(--x) / <alpha>)`. */
export function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

export function hexWithAlpha(hex: string, alpha: number): string {
  return `rgb(${hexToRgbChannels(hex).split(' ').join(', ')}, ${alpha})`
}
