import { normalizeLangs } from './languages'
import type { Filter } from './imageops'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  lang: Lang
  theme: Theme
  ocrLangs: string[]
  filter: Filter
  autoCrop: boolean
  autoDeskew: boolean
  dehyphenate: boolean
  reflow: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  theme: 'auto',
  ocrLangs: ['eng'],
  filter: 'contrast',
  autoCrop: true,
  autoDeskew: true,
  dehyphenate: true,
  reflow: false,
}

export const STORAGE_KEY = 'offline-ocr-scanner:settings'

const FILTERS: Filter[] = ['none', 'gray', 'contrast', 'threshold']

/** Parses stored JSON defensively: unknown or ill-typed fields fall back to the defaults. */
export function parseSettings(raw: string | null): Settings {
  const d = DEFAULT_SETTINGS
  let o: Record<string, unknown> = {}
  try {
    const v: unknown = raw ? JSON.parse(raw) : {}
    if (v && typeof v === 'object') o = v as Record<string, unknown>
  } catch {
    // corrupt storage: use defaults
  }
  const bool = (k: keyof Settings, def: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : def)
  return {
    lang: o.lang === 'uk' || o.lang === 'en' ? o.lang : d.lang,
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'auto' ? o.theme : d.theme,
    ocrLangs: Array.isArray(o.ocrLangs) ? normalizeLangs(o.ocrLangs.filter((x): x is string => typeof x === 'string')) : d.ocrLangs,
    filter: FILTERS.includes(o.filter as Filter) ? (o.filter as Filter) : d.filter,
    autoCrop: bool('autoCrop', d.autoCrop),
    autoDeskew: bool('autoDeskew', d.autoDeskew),
    dehyphenate: bool('dehyphenate', d.dehyphenate),
    reflow: bool('reflow', d.reflow),
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable (private mode): settings just won't persist
  }
}
