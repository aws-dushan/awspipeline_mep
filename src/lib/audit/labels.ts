import type { AuditAction, AuditEntity } from '@prisma/client'

/**
 * Presentation half of the audit module.
 *
 * Deliberately free of `server-only` and of any database import, because the
 * audit timeline is a client component and needs these labels. The querying
 * and writing side lives in `./index.ts`, which stays server-only.
 */

export type FieldChange = {
  field: string
  /** Human label, e.g. "Quote Value". */
  label: string
  from: string | null
  to: string | null
}

export type AuditFeedEntry = {
  id: string
  action: AuditAction
  entity: AuditEntity
  entityId: string
  summary: string
  changes: FieldChange[]
  metadata: Record<string, unknown> | null
  createdAt: Date
  actor: { id: string; name: string; avatarColor: string } | null
  enquiry: { id: string; jobNo: string; customerName: string } | null
}

export type AuditTone = 'positive' | 'negative' | 'warning' | 'neutral' | 'info'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  ENQUIRY_CREATED: 'Request created',
  ENQUIRY_UPDATED: 'Request updated',
  ENQUIRY_DELETE_REQUESTED: 'Deletion requested',
  ENQUIRY_DELETE_APPROVED: 'Deletion approved',
  ENQUIRY_DELETE_REJECTED: 'Deletion rejected',
  ENQUIRY_RESTORED: 'Request restored',
  DROPDOWN_VALUE_CREATED: 'Dropdown value added',
  DROPDOWN_VALUE_UPDATED: 'Dropdown value updated',
  DROPDOWN_VALUE_DEACTIVATED: 'Dropdown value deactivated',
  DROPDOWN_VALUE_REACTIVATED: 'Dropdown value reactivated',
  REQUIRED_FIELDS_CHANGED: 'Mandatory fields changed',
  AUTOMATION_RULE_CREATED: 'Automation rule added',
  AUTOMATION_RULE_UPDATED: 'Automation rule updated',
  AUTOMATION_RULE_DELETED: 'Automation rule removed',
  COMPANY_CREATED: 'Company created',
  COMPANY_UPDATED: 'Company updated',
  CUSTOMER_CREATED: 'Customer added',
  CUSTOMER_UPDATED: 'Customer updated',
  CUSTOMER_MERGED: 'Customers merged',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_DEACTIVATED: 'User deactivated',
  USER_REACTIVATED: 'User reactivated',
  USER_PASSWORD_RESET: 'Password reset',
  USER_COMPANY_ASSIGNED: 'Company assigned',
  USER_COMPANY_REVOKED: 'Company access revoked',
  SUPERVISOR_ASSIGNED: 'Supervisor assigned',
  SUPERVISOR_REMOVED: 'Supervisor removed',
  DATA_EXPORTED: 'Data exported',
}

/** Colour family per action, used by the audit timeline. */
export const AUDIT_ACTION_TONE: Record<AuditAction, AuditTone> = {
  ENQUIRY_CREATED: 'positive',
  ENQUIRY_UPDATED: 'info',
  ENQUIRY_DELETE_REQUESTED: 'warning',
  ENQUIRY_DELETE_APPROVED: 'negative',
  ENQUIRY_DELETE_REJECTED: 'neutral',
  ENQUIRY_RESTORED: 'positive',
  DROPDOWN_VALUE_CREATED: 'positive',
  DROPDOWN_VALUE_UPDATED: 'info',
  DROPDOWN_VALUE_DEACTIVATED: 'warning',
  DROPDOWN_VALUE_REACTIVATED: 'positive',
  REQUIRED_FIELDS_CHANGED: 'info',
  AUTOMATION_RULE_CREATED: 'positive',
  AUTOMATION_RULE_UPDATED: 'info',
  AUTOMATION_RULE_DELETED: 'warning',
  COMPANY_CREATED: 'positive',
  COMPANY_UPDATED: 'info',
  CUSTOMER_CREATED: 'positive',
  CUSTOMER_UPDATED: 'info',
  CUSTOMER_MERGED: 'info',
  USER_CREATED: 'positive',
  USER_UPDATED: 'info',
  USER_DEACTIVATED: 'warning',
  USER_REACTIVATED: 'positive',
  USER_PASSWORD_RESET: 'warning',
  USER_COMPANY_ASSIGNED: 'info',
  USER_COMPANY_REVOKED: 'warning',
  SUPERVISOR_ASSIGNED: 'info',
  SUPERVISOR_REMOVED: 'warning',
  DATA_EXPORTED: 'neutral',
}
