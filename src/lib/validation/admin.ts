import { DropdownTypeKey, Role } from '@prisma/client'
import { z } from 'zod'

import { passwordSchema, usernameSchema } from '@/lib/validation/auth'

/**
 * An optional reference that may arrive as "", null or undefined.
 *
 * A cleared picker can send any of the three depending on the control, and
 * `z.string().optional().or(z.literal(''))` rejects null with a bare
 * "Invalid input" - so normalise all three to null here instead.
 */
const optionalRef = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Enter a hex colour such as #1E4FD8')

const optionalHexColor = z
  .union([hexColor, z.literal(''), z.null(), z.undefined()])
  .transform((value) => (value === '' || value === null || value === undefined ? null : value))

// -----------------------------------------------------------------------------
//  Dropdown values
// -----------------------------------------------------------------------------

export const dropdownValueSchema = z.object({
  companyId: z.string().min(1),
  typeKey: z.nativeEnum(DropdownTypeKey),
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(60, 'Label must be 60 characters or fewer'),
  color: optionalHexColor,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.coerce.boolean().default(true),
  /** Only meaningful for PROBABILITY; drives the weighted pipeline value. */
  numericValue: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') return null
      const numeric = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(numeric) ? numeric : Number.NaN
    })
    .refine((value) => value === null || !Number.isNaN(value), { message: 'Enter a number' })
    .refine((value) => value === null || (value >= 0 && value <= 100), {
      message: 'Must be between 0 and 100',
    }),
})

export const createDropdownValueSchema = dropdownValueSchema
export const updateDropdownValueSchema = dropdownValueSchema.extend({
  valueId: z.string().min(1),
})

export const toggleDropdownValueSchema = z.object({
  companyId: z.string().min(1),
  valueId: z.string().min(1),
  isActive: z.coerce.boolean(),
})

export const reorderDropdownSchema = z.object({
  companyId: z.string().min(1),
  typeKey: z.nativeEnum(DropdownTypeKey),
  orderedIds: z.array(z.string().min(1)).min(1),
})

export type DropdownValueInput = z.infer<typeof dropdownValueSchema>

// -----------------------------------------------------------------------------
//  Companies
// -----------------------------------------------------------------------------

export const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(120),
  color: hexColor.default('#302078'),
  currency: z
    .string()
    .trim()
    .length(3, 'Use a 3-letter currency code')
    .transform((value) => value.toUpperCase())
    .default('AED'),
  isActive: z.coerce.boolean().default(true),
  /** Job numbers start here for a brand-new company. */
  jobNoStart: z.coerce.number().int().min(1).max(9_999_999).default(1000),
  jobNoPrefix: z.string().trim().max(8).default(''),
  /** Country or branch code appended after an underscore, e.g. DXB. */
  jobNoSuffix: z
    .string()
    .trim()
    .max(8, 'Use 8 characters or fewer')
    .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and hyphens only')
    .transform((value) => value.toUpperCase())
    .default(''),
})

export const createCompanySchema = companySchema
export const updateCompanySchema = companySchema.extend({
  companyId: z.string().min(1),
})

// -----------------------------------------------------------------------------
//  Users
// -----------------------------------------------------------------------------

const baseUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  /** What the person types to sign in. */
  username: usernameSchema,
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address')
    .transform((value) => value.toLowerCase()),
  role: z.nativeEnum(Role),
  isActive: z.coerce.boolean().default(true),
  companyIds: z.array(z.string().min(1)).default([]),
  defaultCompanyId: optionalRef,
  supervisorId: optionalRef,
})

/**
 * The rules that span more than one field, applied to every shape of the user
 * form so the create form, the edit form and the server cannot drift apart.
 */
type UserRuleFields = {
  role: Role
  companyIds: string[]
  defaultCompanyId?: string | null
}

/**
 * The three fields the cross-field rules read. Every variant of the user form
 * carries them; the generic above keeps each variant's own full shape, which a
 * constraint on the whole schema would flatten away.
 */
const ruleFields = (data: unknown) => data as UserRuleFields

function withUserRules<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  return schema
    .refine(
      (data) => {
        const { role, companyIds } = ruleFields(data)
        return role === 'ADMIN' || companyIds.length > 0
      },
      { message: 'Assign at least one company', path: ['companyIds'] },
    )
    .refine(
      (data) => {
        const { companyIds, defaultCompanyId } = ruleFields(data)
        return !defaultCompanyId || companyIds.includes(defaultCompanyId)
      },
      {
        message: 'The default company must be one of the assigned companies',
        path: ['defaultCompanyId'],
      },
    )
}

export const createUserSchema = withUserRules(
  baseUserSchema.extend({
    password: passwordSchema,
  }),
)

/**
 * What the *server* validates when updating a user: the account's fields plus
 * which account it is.
 */
export const updateUserSchema = withUserRules(
  baseUserSchema.extend({
    userId: z.string().min(1),
  }),
)

/**
 * What the *edit form* validates: the same fields, without the id.
 *
 * The id identifies the record and is supplied by the screen, not typed into
 * it. Validating the form against the server's schema meant every save failed
 * on a missing `userId` - and since no control is bound to that field, the
 * error had nowhere to appear, so the dialog simply sat there doing nothing.
 */
export const updateUserFormSchema = withUserRules(baseUserSchema)

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordSchema,
})

export const toggleUserSchema = z.object({
  userId: z.string().min(1),
  isActive: z.coerce.boolean(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CompanyInput = z.infer<typeof companySchema>
