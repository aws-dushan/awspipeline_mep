import 'server-only'

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'

export type CustomerOption = {
  id: string
  name: string
  email: string | null
  contactPerson: string | null
  phone: string | null
  isActive: boolean
  enquiryCount: number
  lastEnquiryAt: string | null
}

/**
 * Customer book for one company.
 *
 * Ordered by how recently the customer was used, so the people a sales user
 * works with every day sit at the top of the picker rather than whoever
 * happens to start with "A".
 */
export async function listCustomers(
  companyId: string,
  options: { search?: string; includeInactive?: boolean; take?: number } = {},
): Promise<CustomerOption[]> {
  const where: Prisma.CustomerWhereInput = {
    companyId,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } },
            { contactPerson: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const customers = await prisma.customer.findMany({
    relationLoadStrategy: 'join',
    where,
    take: options.take ?? 500,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      contactPerson: true,
      phone: true,
      isActive: true,
      _count: { select: { enquiries: true } },
      enquiries: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  })

  return customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      isActive: customer.isActive,
      enquiryCount: customer._count.enquiries,
      lastEnquiryAt: customer.enquiries[0]?.createdAt.toISOString() ?? null,
    }))
    .sort((a, b) => {
      if (a.lastEnquiryAt && b.lastEnquiryAt) {
        return b.lastEnquiryAt.localeCompare(a.lastEnquiryAt)
      }
      if (a.lastEnquiryAt) return -1
      if (b.lastEnquiryAt) return 1
      return a.name.localeCompare(b.name)
    })
}

/** Contact fields a request can teach the customer book. */
export type ContactGap = 'email' | 'contactPerson' | 'phone'

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Fill in contact details the customer record does not have yet.
 *
 * Only blanks are written. A request is allowed to name a site contact of its
 * own - that is what the field is for - so treating every saved request as the
 * customer's current details would let one job's site foreman overwrite the
 * office number that everyone else dials.
 *
 * Blanks are different: there is nothing to lose and the detail was typed by
 * someone who had it in front of them. This is the case that kept happening -
 * a customer added from the picker with just a name, then a request logged
 * against it minutes later carrying the email, the contact and the phone,
 * none of which reached the customer area.
 */
async function fillContactGaps(
  tx: Prisma.TransactionClient,
  customerId: string,
  offered: { email?: string | null; contactPerson?: string | null; phone?: string | null },
): Promise<ContactGap[]> {
  const email = clean(offered.email)
  const contactPerson = clean(offered.contactPerson)
  const phone = clean(offered.phone)
  if (!email && !contactPerson && !phone) return []

  const current = await tx.customer.findUnique({
    where: { id: customerId },
    select: { email: true, contactPerson: true, phone: true },
  })
  if (!current) return []

  const data: Prisma.CustomerUpdateInput = {}
  const filled: ContactGap[] = []
  if (email && !clean(current.email)) {
    data.email = email
    filled.push('email')
  }
  if (contactPerson && !clean(current.contactPerson)) {
    data.contactPerson = contactPerson
    filled.push('contactPerson')
  }
  if (phone && !clean(current.phone)) {
    data.phone = phone
    filled.push('phone')
  }

  if (filled.length === 0) return []
  await tx.customer.update({ where: { id: customerId }, data })
  return filled
}

/**
 * Resolve the customer for an enquiry.
 *
 * Accepts either an existing customer id or a new name typed into the picker.
 * Matching on a case-insensitive exact name prevents "Arifco" and "arifco "
 * silently becoming two customers.
 *
 * An existing customer also learns from the request: any contact detail it is
 * missing is filled from what was typed, and `filled` names what changed so
 * the caller can record it.
 */
export async function resolveCustomer(
  tx: Prisma.TransactionClient,
  options: {
    companyId: string
    customerId: string | null
    customerName: string
    actorId: string
    email?: string | null
    contactPerson?: string | null
    phone?: string | null
    /** Off for the customer admin screen, which edits these fields directly. */
    fillGaps?: boolean
  },
): Promise<{ id: string; name: string; created: boolean; filled: ContactGap[] }> {
  const trimmedName = options.customerName.trim()

  const fillGaps = options.fillGaps ?? true

  if (options.customerId) {
    const existing = await tx.customer.findFirst({
      // companyId in the predicate: a customer id from another company must
      // not resolve here.
      where: { id: options.customerId, companyId: options.companyId },
      select: { id: true, name: true },
    })
    if (existing) {
      const filled = fillGaps ? await fillContactGaps(tx, existing.id, options) : []
      return { ...existing, created: false, filled }
    }
  }

  if (!trimmedName) {
    throw new Error('A customer is required.')
  }

  const byName = await tx.customer.findFirst({
    where: {
      companyId: options.companyId,
      name: { equals: trimmedName, mode: 'insensitive' },
    },
    select: { id: true, name: true },
  })
  if (byName) {
    const filled = fillGaps ? await fillContactGaps(tx, byName.id, options) : []
    return { ...byName, created: false, filled }
  }

  const created = await tx.customer.create({
    data: {
      companyId: options.companyId,
      name: trimmedName,
      email: clean(options.email),
      contactPerson: clean(options.contactPerson),
      phone: clean(options.phone),
      createdById: options.actorId,
    },
    select: { id: true, name: true },
  })
  return { ...created, created: true, filled: [] }
}

export async function getCustomerById(companyId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { id: true, name: true, email: true, contactPerson: true, phone: true, isActive: true },
  })
}
