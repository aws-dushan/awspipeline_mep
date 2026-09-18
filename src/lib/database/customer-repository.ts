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

/**
 * Resolve the customer for an enquiry.
 *
 * Accepts either an existing customer id or a new name typed into the picker.
 * Matching on a case-insensitive exact name prevents "Arifco" and "arifco "
 * silently becoming two customers.
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
  },
): Promise<{ id: string; name: string; created: boolean }> {
  const trimmedName = options.customerName.trim()

  if (options.customerId) {
    const existing = await tx.customer.findFirst({
      // companyId in the predicate: a customer id from another company must
      // not resolve here.
      where: { id: options.customerId, companyId: options.companyId },
      select: { id: true, name: true },
    })
    if (existing) return { ...existing, created: false }
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
  if (byName) return { ...byName, created: false }

  const created = await tx.customer.create({
    data: {
      companyId: options.companyId,
      name: trimmedName,
      email: options.email ?? null,
      contactPerson: options.contactPerson ?? null,
      phone: options.phone ?? null,
      createdById: options.actorId,
    },
    select: { id: true, name: true },
  })
  return { ...created, created: true }
}

export async function getCustomerById(companyId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { id: true, name: true, email: true, contactPerson: true, phone: true, isActive: true },
  })
}
