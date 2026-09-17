import 'server-only'

import type { AuditAction, AuditEntity, Prisma } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'
import type { AuditFeedEntry, FieldChange } from '@/lib/audit/labels'

export type { AuditFeedEntry, FieldChange } from '@/lib/audit/labels'
export { AUDIT_ACTION_LABELS, AUDIT_ACTION_TONE } from '@/lib/audit/labels'

/**
 * Structured audit trail.
 *
 * Every entry stores a pre-rendered `summary` for fast listing *and* a
 * machine-readable `changes` array, so the history can be filtered, diffed and
 * reported on later without parsing prose.
 */

export type AuditContext = {
  actorId: string | null
  companyId: string | null
}

export type WriteAuditInput = AuditContext & {
  action: AuditAction
  entity: AuditEntity
  entityId: string
  summary: string
  changes?: FieldChange[]
  metadata?: Prisma.InputJsonValue
  enquiryId?: string | null
}

/**
 * Persist an audit entry.
 *
 * Auditing must never take down the operation it is recording, so failures are
 * swallowed and logged. Pass a transaction client to make the entry atomic
 * with the change it describes.
 */
export async function writeAudit(
  input: WriteAuditInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary,
        changes: input.changes && input.changes.length > 0 ? (input.changes as unknown as Prisma.InputJsonValue) : undefined,
        metadata: input.metadata,
        enquiryId: input.enquiryId ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to write entry', {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      error,
    })
  }
}

type DiffField<T> = {
  field: keyof T & string
  label: string
  /** Render a stored value into the string shown in the history. */
  render?: (value: unknown) => string | null
}

/**
 * Compute a field-level diff between two versions of a record.
 *
 * Only fields listed in `fields` are considered, so internal bookkeeping
 * columns never leak into the user-facing history.
 */
export function diffRecords<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: DiffField<T>[],
): FieldChange[] {
  const changes: FieldChange[] = []

  for (const { field, label, render } of fields) {
    const previous = normalize(before[field], render)
    const next = normalize(after[field], render)
    if (previous === next) continue
    changes.push({ field, label, from: previous, to: next })
  }

  return changes
}

function normalize(value: unknown, render?: (value: unknown) => string | null): string | null {
  if (render) return render(value)
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return String(value)
  }
  return String(value)
}

/** One-line description used as the audit `summary`. */
export function summarizeChanges(actorName: string, subject: string, changes: FieldChange[]): string {
  if (changes.length === 0) return `${actorName} saved ${subject} with no changes`
  if (changes.length === 1) {
    const change = changes[0]
    return `${actorName} changed ${change.label} on ${subject}`
  }
  return `${actorName} updated ${changes.length} fields on ${subject}`
}

export async function getAuditFeed(options: {
  companyId: string
  enquiryId?: string
  actorId?: string
  action?: AuditAction
  take?: number
  cursor?: string
}): Promise<{ entries: AuditFeedEntry[]; nextCursor: string | null }> {
  const take = options.take ?? 50

  const rows = await prisma.auditLog.findMany({
    where: {
      companyId: options.companyId,
      ...(options.enquiryId ? { enquiryId: options.enquiryId } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
      ...(options.action ? { action: options.action } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      changes: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true, avatarColor: true } },
      enquiry: { select: { id: true, jobNo: true, customerName: true } },
    },
  })

  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows

  return {
    entries: page.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      summary: row.summary,
      changes: (row.changes as unknown as FieldChange[] | null) ?? [],
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
      actor: row.actor,
      enquiry: row.enquiry,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  }
}
