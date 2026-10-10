import { describe, expect, it } from 'vitest'
import { normalizeLangs } from './languages'
import { DEFAULT_SETTINGS, parseSettings } from './settings'

describe('parseSettings', () => {
  it('returns defaults for null or corrupt input', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS)
  })
  it('keeps valid fields and drops invalid ones', () => {
    const s = parseSettings(JSON.stringify({ lang: 'uk', theme: 'neon', filter: 'threshold', ocrLangs: ['ukr', 'xx', 'eng'], autoCrop: false, reflow: 'yes' }))
    expect(s.lang).toBe('uk')
    expect(s.theme).toBe('auto')
    expect(s.filter).toBe('threshold')
    expect(s.ocrLangs).toEqual(['eng', 'ukr'])
    expect(s.autoCrop).toBe(false)
    expect(s.reflow).toBe(DEFAULT_SETTINGS.reflow)
  })
})

describe('normalizeLangs', () => {
  it('falls back to English when nothing valid remains', () => {
    expect(normalizeLangs([])).toEqual(['eng'])
    expect(normalizeLangs(['zzz'])).toEqual(['eng'])
    expect(normalizeLangs(['deu', 'deu', 'fra'])).toEqual(['deu', 'fra'])
  })
})
