import { z } from 'zod'

/**
 * The username an administrator assigned to the account. Usernames are stored
 * lower-cased, so signing in is case-insensitive.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(40, 'Username must be 40 characters or fewer')
  .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, underscore or hyphen only')
  .transform((value) => value.toLowerCase())

/** Sign-in is by username - the email address is contact detail only. */
export const loginSchema = z.object({
  username: z
    .string({ required_error: 'Enter your username' })
    .trim()
    .min(1, 'Enter your username')
    .max(40, 'That is too long to be a username')
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[0-9]/, 'Include at least one number')

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
