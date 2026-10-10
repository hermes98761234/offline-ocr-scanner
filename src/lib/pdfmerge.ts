import { PDFDocument } from 'pdf-lib'

/** Concatenates single- or multi-page PDFs into one document. */
export async function mergePdfs(parts: readonly Uint8Array[], title?: string): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  if (title) out.setTitle(title)
  out.setProducer('Offline OCR Scanner')
  return out.save()
}
