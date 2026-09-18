/** Development helper: add a few pipeline rows so the grid can be eyeballed. */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const company = await prisma.company.findUnique({
    where: { name: process.argv[2] ?? 'AWS Distribution' },
    select: { id: true, counter: { select: { nextSerialNo: true, nextJobNo: true } } },
  })
  if (!company) throw new Error('Company not found')

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, name: true } })
  const values = await prisma.dropdownValue.findMany({
    where: { companyId: company.id },
    select: { id: true, typeKey: true, label: true },
  })
  const v = (type: string, label: string) =>
    values.find((x) => x.typeKey === type && x.label === label)?.id ?? null

  const samples = [
    { customer: 'Arifco Building Contracting', project: 'Villa G+1, Al Barsha', status: 'Quoted', loc: 'DXB', mat: 'PPR', prob: '50%', quote: 154000, details: 'PPR piping package', email: 'muhsin@arifcouae.com', phone: '+971 55 506 3525' },
    { customer: 'STG Contracting', project: 'Khor Khuwair site', status: 'Won', loc: 'RAK', mat: 'AC', prob: '100%', quote: 30455, details: 'Split AC supply and install', email: 'harikrishnan@stgeng.ae', phone: '+971 52 309 5884' },
    { customer: 'Al Hoson Group', project: null, status: 'Lost', loc: 'AJM', mat: 'AC', prob: '0%', quote: 2938, details: '1.5 and 2 ton AC', email: 'procurement@alhosongroup.com', phone: '+971 56 800 7399', remarks: 'Client can only accept one approved brand.' },
    { customer: 'Moduluxe Modular Rental', project: 'Labour accommodation', status: 'Pending', loc: 'SHJ', mat: 'LED Lights', prob: '25%', quote: null, details: 'LED fittings, quantities to confirm', email: 'sales@moduluxegroup.com', phone: '+971 56 536 5123' },
    { customer: 'Riaz and Tariq Trading', project: 'Bulk supply', status: 'Negotiation', loc: 'SHJ', mat: 'AC', prob: '75%', quote: 100500, details: '1.5 ton window AC, bulk', email: 'muhammadzarif1985@gmail.com', phone: '+971 50 118 2244', remarks: 'Asking for a further discount.' },
  ]

  let serialNo = company.counter?.nextSerialNo ?? 1
  let jobNo = company.counter?.nextJobNo ?? 1000

  for (const [index, s] of samples.entries()) {
    const customer = await prisma.customer.upsert({
      where: { companyId_name: { companyId: company.id, name: s.customer } },
      create: { companyId: company.id, name: s.customer, email: s.email, phone: s.phone, createdById: admin?.id },
      update: {},
      select: { id: true, name: true },
    })

    const enquiry = await prisma.enquiry.create({
      data: {
        companyId: company.id,
        serialNo: serialNo++,
        jobNo: String(jobNo++),
        enquiryDate: new Date(Date.UTC(2026, 8, 16 - index)),
        customerId: customer.id,
        customerName: customer.name,
        projectName: s.project,
        salesResponsibleId: admin?.id ?? null,
        statusValueId: v('STATUS', s.status),
        locations: { create: [{ valueId: v('LOCATION', s.loc)! }] },
        materials: { create: [{ valueId: v('MATERIAL', s.mat)! }] },
        probabilityValueId: v('PROBABILITY', s.prob),
        enquiryDetails: s.details,
        quoteValue: s.quote,
        email: s.email,
        phoneNumber: s.phone,
        remarks: s.remarks ?? null,
        createdById: admin?.id ?? null,
        updatedById: admin?.id ?? null,
        createdAt: new Date(Date.now() - index * 3600_000),
      },
      select: { id: true, jobNo: true, customerName: true },
    })

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: admin?.id ?? null,
        action: 'ENQUIRY_CREATED',
        entity: 'ENQUIRY',
        entityId: enquiry.id,
        enquiryId: enquiry.id,
        summary: `${admin?.name ?? 'System'} created Job ${enquiry.jobNo} for ${enquiry.customerName}`,
      },
    })
  }

  await prisma.companyCounter.update({
    where: { companyId: company.id },
    data: { nextSerialNo: serialNo, nextJobNo: jobNo },
  })

  console.log(`Added ${samples.length} sample rows`)
}

main().finally(() => prisma.$disconnect())
