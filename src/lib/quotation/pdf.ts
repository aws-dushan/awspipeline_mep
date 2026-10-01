import 'server-only'

import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'

import { formatCalendarDate } from '@/lib/format'
import {
  AFRA_LOGO,
  AWS_LOGO,
  BRAND_3,
  BRAND_4,
  BRAND_5,
  BRAND_6,
  BRAND_7,
  BRAND_8,
  BRAND_9,
} from '@/lib/quotation/logos'
import {
  lineTotal,
  quotationTotal,
  revisionLabel,
  type QuotationFormValues,
  type QuotationSettingsValues,
} from '@/lib/quotation/quotation'

/**
 * Quotation PDF.
 *
 * Laid out after the quotation the sales team issued by hand - letterhead,
 * the peach section bars, the two-column header, the item table, the terms
 * and the brand strip - so a customer cannot tell a generated quotation from
 * the ones they have been receiving.
 *
 * Fonts are the Roboto files pdfmake ships as base64 in a JS module, rather
 * than the PDF standard fonts: those are read from disk at run time, and a
 * file the standalone build did not trace is a quotation that fails to
 * download in production only.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsModule = require('pdfmake/build/vfs_fonts') as
  | Record<string, string>
  | { pdfMake: { vfs: Record<string, string> } }
const vfs: Record<string, string> =
  'pdfMake' in vfsModule ? (vfsModule as { pdfMake: { vfs: Record<string, string> } }).pdfMake.vfs : (vfsModule as Record<string, string>)

const font = (name: string) => Buffer.from(vfs[name], 'base64')

/**
 * pdfmake 0.2's server entry is a printer class. `@types/pdfmake` describes
 * the 0.3 browser-style API instead, so the little that is used is typed here.
 */
type PdfKitDocument = NodeJS.ReadableStream & { end(): void }
type PdfPrinterClass = new (fonts: Record<string, Record<string, Buffer>>) => {
  createPdfKitDocument(definition: TDocumentDefinitions): PdfKitDocument
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as PdfPrinterClass

const printer = new PdfPrinter({
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
})

const BAR_FILL = '#FAE2D6'
const LINE = '#4b5563'
const MUTED = '#6b7280'

export type QuotationDocumentInput = {
  referenceNo: string
  revision: number
  currency: string
  values: QuotationFormValues
  settings: QuotationSettingsValues
}

const amount = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

function date(value: string | null): string {
  return value ? formatCalendarDate(value) : ''
}

/** A thin grid on every edge, as the template draws it. */
const gridLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => LINE,
  vLineColor: () => LINE,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
}

function bar(label: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: label, bold: true, alignment: 'center', fillColor: BAR_FILL, fontSize: 10 }]],
    },
    layout: gridLayout,
    margin: [0, 0, 0, 0],
  }
}

function headerBlock(input: QuotationDocumentInput): Content {
  const { values, settings, referenceNo, revision } = input

  const left: [string, string][] = [
    ['Date', date(values.quotationDate)],
    ['Sales Responsible', values.salesName],
    ['Contact Number', values.salesPhone],
    ['Email', values.salesEmail],
    ['Address', settings.address],
  ]
  if (values.validUntil) left.push(['Valid Until', date(values.validUntil)])

  const attention = [values.attention, values.attentionPhone ? `PH: ${values.attentionPhone}` : '']
    .filter(Boolean)
    .join('   ')

  const right: [string, string][] = [
    ['Reference Number', `${referenceNo}   ${revisionLabel(revision)}`],
    ['Customer Name', values.customerName],
    ['Attention', attention],
    ['Address', values.customerAddress],
    ['E-mail Address', values.customerEmail],
    ['Customer Ref.', values.customerRef],
    ['Enquiry Date', date(values.enquiryDate)],
  ]

  const rows = Math.max(left.length, right.length)
  const body: TableCell[][] = []
  for (let index = 0; index < rows; index += 1) {
    const [leftLabel, leftValue] = left[index] ?? ['', '']
    const [rightLabel, rightValue] = right[index] ?? ['', '']
    body.push([
      { text: leftLabel, bold: true },
      { text: leftValue },
      { text: rightLabel, bold: true, fillColor: rightLabel ? '#f8f8f8' : undefined },
      { text: rightValue, bold: index < 2 },
    ])
  }

  return {
    table: { widths: [78, '*', 82, '*'], body },
    layout: gridLayout,
    fontSize: 8.5,
  }
}

function itemsBlock(input: QuotationDocumentInput): Content {
  const { values, currency } = input
  const head = (text: string, alignment: 'left' | 'center' | 'right' = 'center'): TableCell => ({
    text,
    bold: true,
    alignment,
    fillColor: BAR_FILL,
  })

  const body: TableCell[][] = [
    [
      head('S.No.'),
      head('Description'),
      head('Make'),
      head('Qty'),
      head(`Unit Price\n(${currency})`),
      head(`Total Price\n(${currency})`),
    ],
  ]

  values.items.forEach((item, index) => {
    body.push([
      { text: String(index + 1), alignment: 'center' },
      { text: item.description, bold: true },
      { text: item.make, alignment: 'center' },
      { text: quantity.format(item.qty), alignment: 'center' },
      { text: amount.format(item.unitPrice), alignment: 'right' },
      { text: amount.format(lineTotal(item)), alignment: 'right' },
    ])
  })

  if (values.scopeOfWork) {
    body.push([
      { text: '' },
      { text: `SCOPE OF WORK : ${values.scopeOfWork}`, bold: true, colSpan: 5 },
      {},
      {},
      {},
      {},
    ])
  }

  body.push([
    {
      text: values.vatNote ? `(${values.vatNote})` : '',
      italics: true,
      colSpan: 3,
      fillColor: BAR_FILL,
      fontSize: 8,
    },
    {},
    {},
    {
      text: `Total Price in ${currency}`,
      bold: true,
      alignment: 'right',
      colSpan: 2,
      fillColor: BAR_FILL,
    },
    {},
    {
      text: amount.format(quotationTotal(values.items)),
      bold: true,
      alignment: 'right',
      fillColor: BAR_FILL,
    },
  ])

  return {
    table: {
      // The header row repeats on every page a long item list runs onto.
      headerRows: 1,
      dontBreakRows: true,
      widths: [30, '*', 70, 36, 64, 72],
      body,
    },
    layout: gridLayout,
    fontSize: 8.5,
  }
}

function termsBlock(input: QuotationDocumentInput): Content {
  const terms = input.values.terms.filter((term) => term.text.trim())
  if (terms.length === 0) return { text: '' }

  const body: TableCell[][] = terms.map(
    (term): TableCell[] =>
      term.label
        ? [{ text: term.label, bold: true }, { text: term.text }]
        : [{ text: term.text, bold: true, colSpan: 2 }, {}],
  )

  return {
    stack: [
      { text: 'TERMS & CONDITIONS', bold: true, fontSize: 10, margin: [0, 8, 0, 3] },
      {
        // Set a touch smaller than the items: the standard terms run to eight
        // entries, and at full size the last one alone spills onto page two.
        table: { widths: [110, '*'], body, dontBreakRows: true },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 8,
          paddingTop: () => 1.5,
          paddingBottom: () => 1.5,
        },
        fontSize: 8,
        lineHeight: 1.1,
      },
    ],
  }
}

/**
 * The letterhead foot: company details and the brand strip.
 *
 * Printed in the page footer rather than after the terms, so it sits at the
 * bottom of every page the way it does on printed letterhead - as a block at
 * the end it was taller than the space left under the terms and pushed a
 * three-line quotation onto a second page of its own.
 */
function letterheadFooter(input: QuotationDocumentInput, currentPage: number, pageCount: number): Content {
  const { settings, referenceNo, revision } = input
  const logo = (image: string, width: number): Content => ({ image, width, margin: [4, 0, 4, 3] })

  return {
    margin: [30, 0, 30, 0],
    stack: [
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 535, y2: 0, lineWidth: 0.6, lineColor: LINE }],
        margin: [0, 0, 0, 5],
      },
      {
        columns: [
          {
            width: 215,
            fontSize: 6.5,
            lineHeight: 1.1,
            color: '#1f2937',
            stack: [
              { text: settings.letterheadName, bold: true, margin: [0, 0, 0, 2] },
              ...(settings.footerText
                ? [{ text: settings.footerText, margin: [0, 0, 0, 2] } as Content]
                : []),
              { text: settings.address },
            ],
          },
          {
            width: '*',
            stack: [
              {
                columns: [logo(AFRA_LOGO, 46), logo(BRAND_5, 54), logo(BRAND_8, 52), logo(BRAND_6, 56)],
                columnGap: 0,
              },
              {
                columns: [logo(BRAND_9, 70), logo(BRAND_7, 28), logo(BRAND_4, 50), logo(BRAND_3, 26)],
                columnGap: 0,
              },
            ],
          },
        ],
      },
      {
        margin: [0, 2, 0, 0],
        fontSize: 6.5,
        color: MUTED,
        columns: [
          { text: `${referenceNo} ${revisionLabel(revision)}` },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right' },
        ],
      },
    ],
  }
}

export function buildQuotationDocument(input: QuotationDocumentInput): TDocumentDefinitions {
  const { settings, referenceNo, revision } = input

  return {
    pageSize: 'A4',
    // The bottom margin is the room the letterhead footer takes.
    pageMargins: [30, 24, 30, 96],
    info: {
      title: `Quotation ${referenceNo} ${revisionLabel(revision)}`,
      author: settings.letterheadName,
      subject: `Quotation for ${input.values.customerName}`,
    },
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15, color: '#111827' },
    footer: (currentPage, pageCount) => letterheadFooter(input, currentPage, pageCount),
    content: [
      {
        columns: [
          { image: AWS_LOGO, width: 70 },
          {
            width: '*',
            text: settings.letterheadName,
            bold: true,
            fontSize: 11,
            alignment: 'center',
            margin: [8, 16, 8, 0],
          },
          { image: AFRA_LOGO, width: 104, margin: [0, 10, 0, 0] },
        ],
        margin: [0, 0, 0, 8],
      },
      bar('QUOTATION'),
      headerBlock(input),
      { text: '', margin: [0, 0, 0, 6] },
      bar('Quotation for the supply of the following items'),
      itemsBlock(input),
      termsBlock(input),
    ],
  }
}

/** Render a quotation to PDF bytes. */
export function renderQuotationPdf(input: QuotationDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = printer.createPdfKitDocument(buildQuotationDocument(input))
    const chunks: Buffer[] = []
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.end()
  })
}
