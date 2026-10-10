/** Post-processing of raw OCR text. */

const HYPHEN = /[-­‐‑]$/u
const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' }

/** Replaces typographic ligature glyphs with their letters. */
export function expandLigatures(text: string): string {
  return text.replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c])
}

/**
 * Rejoins words split by a hyphen at the end of a line: "inter-\nnational text" becomes
 * "international\ntext". A line is only joined when the hyphen follows a letter and the next line
 * continues in lower case, so "well-\nKnown", "2020-\n2021" and a dash after a space are left alone.
 * Blank lines (paragraph breaks) are never crossed.
 */
export function dehyphenate(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const next = lines[i + 1]
    const trimmed = line.replace(/[ \t]+$/, '')
    if (next !== undefined && HYPHEN.test(trimmed) && /\p{L}.$/u.test(trimmed) && /^\s*\p{Ll}/u.test(next)) {
      const m = /^\s*(\p{L}+)([^\n]*)$/u.exec(next)
      if (m) {
        line = trimmed.slice(0, -1) + m[1]
        const rest = m[2].replace(/^[ \t]+/, '')
        if (/^[-\u00AD\u2010\u2011]$/.test(rest)) {
          // The fragment is itself hyphenated ("sive-" / "ly"): fold it in and look at this line again.
          lines[i] = line + rest
          lines.splice(i + 1, 1)
          i--
          continue
        }
        if (rest) lines[i + 1] = rest
        else lines.splice(i + 1, 1)
        out.push(line)
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

/** Trims line ends, squeezes runs of spaces and caps blank lines at one. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Joins the hard-wrapped lines of each paragraph (separated by blank lines) into one line. */
export function reflowParagraphs(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n\n')
}

export interface CleanOptions {
  dehyphenate: boolean
  reflow: boolean
}

export function cleanText(text: string, opts: CleanOptions): string {
  let t = expandLigatures(text)
  if (opts.dehyphenate) t = dehyphenate(t)
  if (opts.reflow) t = reflowParagraphs(t)
  return normalizeWhitespace(t)
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}
