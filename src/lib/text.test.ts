import { describe, expect, it } from 'vitest'
import { cleanText, countWords, dehyphenate, expandLigatures, normalizeWhitespace, reflowParagraphs } from './text'

describe('dehyphenate', () => {
  it('joins a word split across lines and keeps the rest of the next line', () => {
    expect(dehyphenate('This is an inter-\nnational text that\ncontinues')).toBe('This is an international\ntext that\ncontinues')
  })
  it('drops the next line when the fragment was the only word on it', () => {
    expect(dehyphenate('con-\ntinued\nnext line')).toBe('continued\nnext line')
  })
  it('handles soft hyphens, Unicode hyphens and CRLF', () => {
    expect(dehyphenate('infor­\r\nmation here')).toBe('information\nhere')
    expect(dehyphenate('infor‐\nmation')).toBe('information')
  })
  it('works for Cyrillic and accented letters', () => {
    expect(dehyphenate('міжнарод-\nний розвиток')).toBe('міжнародний\nрозвиток')
    expect(dehyphenate('Straßen-\nbahn fährt')).toBe('Straßenbahn\nfährt')
  })
  it('keeps real compounds: capital, digit or paragraph break after the hyphen', () => {
    expect(dehyphenate('Anglo-\nSaxon')).toBe('Anglo-\nSaxon')
    expect(dehyphenate('2020-\n2021')).toBe('2020-\n2021')
    expect(dehyphenate('end-\n\nnext paragraph')).toBe('end-\n\nnext paragraph')
  })
  it('does not touch a dash that follows a space or a lone hyphen', () => {
    expect(dehyphenate('a -\nword')).toBe('a -\nword')
    expect(dehyphenate('well-known\nthing')).toBe('well-known\nthing')
  })
  it('chains across several consecutive broken lines', () => {
    expect(dehyphenate('a very exten-\nsive-\nly broken word')).toBe('a very extensively\nbroken word')
  })
})

describe('normalizeWhitespace', () => {
  it('collapses spaces and blank lines', () => {
    expect(normalizeWhitespace('  a   b  \n\n\n\n c\t d \n')).toBe('a b\n\nc d')
  })
})

describe('reflowParagraphs', () => {
  it('joins wrapped lines within a paragraph', () => {
    expect(reflowParagraphs('one two\nthree four\n\nfive\nsix')).toBe('one two three four\n\nfive six')
  })
})

describe('expandLigatures', () => {
  it('expands fi/fl/ffi', () => {
    expect(expandLigatures('ﬁnd oﬃce ﬂow')).toBe('find office flow')
  })
})

describe('cleanText', () => {
  it('applies options independently', () => {
    const raw = 'The inter-\nnational  rule\nis simple.\n\nNext   one.'
    expect(cleanText(raw, { dehyphenate: false, reflow: false })).toBe('The inter-\nnational rule\nis simple.\n\nNext one.')
    expect(cleanText(raw, { dehyphenate: true, reflow: false })).toBe('The international\nrule\nis simple.\n\nNext one.')
    expect(cleanText(raw, { dehyphenate: true, reflow: true })).toBe('The international rule is simple.\n\nNext one.')
  })
})

describe('countWords', () => {
  it('counts words, numbers and contractions', () => {
    expect(countWords("Hello, world! It's 2026 — well-known.")).toBe(5)
    expect(countWords('')).toBe(0)
    expect(countWords('Привіт світе')).toBe(2)
  })
})
