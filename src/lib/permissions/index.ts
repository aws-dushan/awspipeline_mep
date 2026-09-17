import { Role } from '@prisma/client'

/**
 * Centralised permission catalogue.
 *
 * Every capability in the application is named here and mapped to roles. Code
 * must never branch on `role === 'ADMIN'` directly - it asks `can(user, ...)`
 * instead, so adding a role or moving a capability is a one-line change.
 */
export const PERMISSIONS = [
  // Pipeline
  'pipeline:view',
  'pipeline:create',
  'pipeline:edit:any',
  'pipeline:edit:own',
  'pipeline:export',

  // Deletion workflow
  'delete:request',
  'delete:review',
  'delete:review:any',
  'delete:restore',

  // Administration
  'company:view',
  'company:manage',
  'user:view',
  'user:manage',
  'dropdown:view',
  'dropdown:manage',
  'audit:view',
  'audit:view:all',
  'enquiry:view:deleted',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    'pipeline:view',
    'pipeline:create',
    'pipeline:edit:any',
    'pipeline:edit:own',
    'pipeline:export',
    'delete:request',
    'delete:review',
    'delete:review:any',
    'delete:restore',
    'company:view',
    'company:manage',
    'user:view',
    'user:manage',
    'dropdown:view',
    'dropdown:manage',
    'audit:view',
    'audit:view:all',
    'enquiry:view:deleted',
  ],
  SUPERVISOR: [
    'pipeline:view',
    'pipeline:create',
    'pipeline:edit:any',
    'pipeline:edit:own',
    'pipeline:export',
    'delete:request',
    'delete:review',
    'dropdown:view',
    // Supervisors own the day-to-day vocabulary of their pipeline - the
    // statuses, locations, materials and the Status/Probability linkage - so
    // they do not have to wait on an administrator to add a value.
    'dropdown:manage',
    'user:view',
    'audit:view',
  ],
  USER: [
    'pipeline:view',
    'pipeline:create',
    'pipeline:edit:own',
    'pipeline:export',
    'delete:request',
    'dropdown:view',
  ],
}

export type PermissionSubject = { role: Role }

export function can(subject: PermissionSubject, permission: Permission): boolean {
  return ROLE_PERMISSIONS[subject.role].includes(permission)
}

export function canAny(subject: PermissionSubject, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(subject, permission))
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

/**
 * Can this subject edit a specific enquiry?
 * Users may edit rows they created or are the sales owner of; supervisors and
 * admins may edit anything inside a company they can access.
 */
export function canEditEnquiry(
  subject: PermissionSubject & { id: string },
  enquiry: { createdById: string | null; salesResponsibleId: string | null },
): boolean {
  if (can(subject, 'pipeline:edit:any')) return true
  if (!can(subject, 'pipeline:edit:own')) return false
  return enquiry.createdById === subject.id || enquiry.salesResponsibleId === subject.id
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  SUPERVISOR: 'Supervisor',
  USER: 'User',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Full control over companies, users, dropdowns and audit history.',
  SUPERVISOR:
    'Works the pipeline, approves deletion requests from their team, and configures dropdown values and automation rules.',
  USER: 'Works the pipeline and submits deletion requests for approval.',
}
