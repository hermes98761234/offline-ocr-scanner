import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { mergePdfs } from './pdfmerge'

async function makePdf(sizes: [number, number][]): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  for (const [w, h] of sizes) d.addPage([w, h])
  return d.save()
}

describe('mergePdfs', () => {
  it('concatenates pages in order and keeps their sizes', async () => {
    const merged = await mergePdfs([await makePdf([[100, 200]]), await makePdf([[300, 400], [50, 60]])], 'Scan')
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getSize()).toEqual({ width: 100, height: 200 })
    expect(doc.getPage(2).getSize()).toEqual({ width: 50, height: 60 })
    expect(doc.getTitle()).toBe('Scan')
  })
})
