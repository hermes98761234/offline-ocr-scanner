/** OCR languages offered in the UI (Tesseract codes) with their native names. */
export interface OcrLang {
  code: string
  name: string
}

export const OCR_LANGS: readonly OcrLang[] = [
  { code: 'eng', name: 'English' },
  { code: 'ukr', name: 'Українська' },
  { code: 'rus', name: 'Русский' },
  { code: 'deu', name: 'Deutsch' },
  { code: 'fra', name: 'Français' },
  { code: 'spa', name: 'Español' },
  { code: 'pol', name: 'Polski' },
  { code: 'ita', name: 'Italiano' },
  { code: 'por', name: 'Português' },
  { code: 'nld', name: 'Nederlands' },
  { code: 'ces', name: 'Čeština' },
  { code: 'tur', name: 'Türkçe' },
  { code: 'ron', name: 'Română' },
  { code: 'swe', name: 'Svenska' },
  { code: 'bul', name: 'Български' },
]

const KNOWN = new Set(OCR_LANGS.map((l) => l.code))

/** Keeps known codes, de-duplicated in UI order; falls back to English when nothing is left. */
export function normalizeLangs(codes: readonly string[]): string[] {
  const want = new Set(codes)
  const out = OCR_LANGS.filter((l) => want.has(l.code)).map((l) => l.code)
  return out.length ? out : ['eng']
}

export const isKnownLang = (c: string) => KNOWN.has(c)
