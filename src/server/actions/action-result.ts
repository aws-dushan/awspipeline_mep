import { ZodError } from 'zod'

import { AuthenticationError, AuthorizationError } from '@/lib/auth/session'

/**
 * Uniform result envelope for every server action.
 *
 * Actions never throw across the network boundary: they return a discriminated
 * union the client can render. Internal error details are logged server-side
 * and deliberately not sent to the browser.
 */
export type ActionSuccess<T> = { ok: true; data: T }
export type ActionFailure = {
  ok: false
  error: string
  /** Field-level messages, keyed by form field name. */
  fieldErrors?: Record<string, string>
  code?: 'unauthenticated' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'error'
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data }
}

export function fail(
  error: string,
  options: { fieldErrors?: Record<string, string>; code?: ActionFailure['code'] } = {},
): ActionFailure {
  return { ok: false, error, fieldErrors: options.fieldErrors, code: options.code ?? 'error' }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'The record could not be found.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * Wrap an action body so authorisation, validation and unexpected failures all
 * come back in the same shape.
 */
/** Has the body already produced a finished envelope? */
function isActionResult(value: unknown): value is ActionResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok: unknown }).ok === 'boolean'
  )
}

export async function runAction<T>(
  label: string,
  body: () => Promise<T | ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const result = await body()
    // A body may return `fail(...)` directly to report a domain failure with
    // field errors attached. Pass that through instead of wrapping it again.
    if (isActionResult(result)) return result as ActionResult<T>
    return ok(result as T)
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of error.issues) {
        const key = issue.path.join('.') || 'form'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      return fail('Please correct the highlighted fields.', { fieldErrors, code: 'validation' })
    }
    if (error instanceof AuthenticationError) {
      return fail('Your session has expired. Please sign in again.', { code: 'unauthenticated' })
    }
    if (error instanceof AuthorizationError) {
      return fail(error.message, { code: 'forbidden' })
    }
    if (error instanceof ConflictError) {
      return fail(error.message, { code: 'conflict' })
    }
    if (error instanceof NotFoundError) {
      return fail(error.message, { code: 'not_found' })
    }

    console.error(`[action:${label}]`, error)
    return fail('Something went wrong. Please try again.', { code: 'error' })
  }
}
