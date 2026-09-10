/**
 * Splitting a document into retrievable pieces.
 *
 * Chunk boundaries decide what retrieval can find. A chunk that cuts a sentence
 * in half produces a vector for half an idea, so this splits on the largest
 * separator that still fits: paragraphs first, then sentences, then words, and
 * only mid-word as a last resort for text with no whitespace at all.
 *
 * Sizes are configured in tokens because that is what the admin panel and every
 * model API speak. There is no tokeniser in this project and adding one for
 * chunking alone is not worth the dependency, so `estimateTokens` approximates
 * — see its comment for why that is safe here.
 */

/**
 * ~4 characters per token is the standard rule of thumb for English text.
 *
 * Being approximate is acceptable because nothing downstream is a hard limit:
 * chunk size is a retrieval-quality knob, not a request-size constraint. It is
 * deliberately a slight over-estimate, so chunks come out a little small rather
 * than a little too large.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const SEPARATORS = [
  "\n\n", // paragraph
  "\n", // line
  ". ", // sentence
  "? ",
  "! ",
  "; ",
  ", ",
  " ", // word
] as const;

export type Chunk = {
  content: string;
  index: number;
  tokenCount: number;
};

/** Collapses the whitespace that PDF and Word extraction leave behind. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Soft hyphens and zero-width characters survive PDF extraction and split
    // words in the middle, which ruins both chunking and retrieval.
    .replace(/[­​‌‍﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Finds where to cut a piece of text that is too long.
 *
 * Returns the position just after the best separator inside the budget, or the
 * budget itself when the text contains no separator at all.
 */
function findSplit(text: string, budget: number): number {
  for (const separator of SEPARATORS) {
    // Search only the tail half of the budget: a separator very early in the
    // window would produce a chunk far smaller than asked for.
    const from = Math.floor(budget / 2);
    const at = text.lastIndexOf(separator, budget);
    if (at > from) return at + separator.length;
  }

  return budget;
}

/**
 * Nudges an overlap start forward off the middle of a word.
 *
 * Stepping back by a fixed number of characters lands wherever it lands, so a
 * chunk could begin "es that have stopped growing" — and that fragment is what
 * gets embedded, not just what gets displayed. Moving to the next word boundary
 * costs a few characters of overlap and buys a chunk that starts on a real word.
 *
 * `limit` stops the search from skipping past the end of the current chunk,
 * which would drop text entirely; if no boundary appears before it, the
 * original position stands.
 */
function snapToWordStart(text: string, from: number, limit: number): number {
  if (from <= 0 || from >= text.length) return from;
  if (/\s/.test(text[from - 1])) return from; // already at a word start

  for (let at = from; at < Math.min(limit, text.length); at++) {
    if (/\s/.test(text[at])) return at + 1;
  }

  return from;
}

export function chunkText(
  raw: string,
  chunkSize: number,
  chunkOverlap: number,
): Chunk[] {
  const text = cleanText(raw);
  if (!text) return [];

  // Overlap must leave forward progress, or the loop below never terminates.
  const overlap = Math.max(0, Math.min(chunkOverlap, Math.floor(chunkSize / 2)));

  const budget = Math.max(1, chunkSize) * 4; // tokens → characters
  const overlapChars = overlap * 4;

  const chunks: Chunk[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;

    if (remaining <= budget) {
      const content = text.slice(cursor).trim();
      if (content) {
        chunks.push({
          content,
          index: chunks.length,
          tokenCount: estimateTokens(content),
        });
      }
      break;
    }

    const window = text.slice(cursor, cursor + budget);
    const split = findSplit(window, budget);
    const content = window.slice(0, split).trim();

    if (content) {
      chunks.push({
        content,
        index: chunks.length,
        tokenCount: estimateTokens(content),
      });
    }

    // Step forward by the chunk minus the overlap, but never by zero.
    const step = Math.max(1, split - overlapChars);
    cursor = snapToWordStart(text, cursor + step, cursor + split);
  }

  return chunks;
}
