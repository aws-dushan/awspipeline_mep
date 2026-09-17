import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/** Hash a plaintext password. Plaintext is never persisted anywhere. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Compare against a throwaway hash so a login attempt for an unknown user
 * costs roughly the same as one for a known user. Without this, response time
 * leaks which email addresses exist.
 */
const DUMMY_HASH = '$2a$12$K5wQ4hZzR1Lh9pXG3sYbMOJ0zrhUqkY2dJ3S0gBfC1nYlWqVeH8Wm'

export async function fakeVerify(): Promise<void> {
  await bcrypt.compare('not-a-real-password', DUMMY_HASH)
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  issues: string[]
}

export function assessPassword(value: string): PasswordStrength {
  const issues: string[] = []
  if (value.length < 8) issues.push('Use at least 8 characters')
  if (!/[a-z]/.test(value)) issues.push('Add a lowercase letter')
  if (!/[A-Z]/.test(value)) issues.push('Add an uppercase letter')
  if (!/[0-9]/.test(value)) issues.push('Add a number')

  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent']
  return {
    score: Math.min(score, 4) as PasswordStrength['score'],
    label: labels[Math.min(score, 4)],
    issues,
  }
}
