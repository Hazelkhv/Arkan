/**
 * Turning a document into the pieces that get embedded.
 *
 * Two properties matter more than the exact size of a chunk, and both are what
 * the tests in tests/chunking.test.ts pin down:
 *
 *   1. Nothing is lost. Concatenating the chunks of a document, before overlap
 *      is applied, reproduces the document exactly — separators included. A
 *      splitter that quietly drops the newlines it split on will lose a
 *      sentence eventually, and the symptom is an answer that is merely
 *      incomplete rather than obviously broken.
 *
 *   2. Splits land on separators, never inside a word. A chunk that starts
 *      mid-word embeds badly, and the retriever's failure is silent.
 *
 * There is no tokenizer dependency here. Chunk sizes are configured in tokens
 * because that is the unit an operator thinks in, and converted to characters
 * with the usual four-characters-per-token approximation for English. Real
 * token counts come back from the provider on every call and are what the cost
 * reporting uses; this estimate only has to be good enough to size a chunk.
 */

const CHARS_PER_TOKEN = 4;

/** Longest first: a paragraph break is a better split than a comma. */
const RECURSIVE_SEPARATORS = [
  "\n\n",
  "\n",
  ". ",
  "? ",
  "! ",
  "; ",
  ": ",
  ", ",
  " ",
];

export type Chunk = {
  index: number;
  content: string;
  tokenCount: number;
};

export type ChunkOptions = {
  /** Target chunk size in tokens. */
  chunkSize: number;
  /** Tokens of the previous chunk repeated at the start of the next. */
  chunkOverlap: number;
  strategy?: "recursive" | "paragraph" | "fixed";
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Collapses the whitespace that PDF and HTML extraction leave behind.
 *
 * Runs of blank lines become one paragraph break and trailing spaces go, so the
 * separator hierarchy above means what it says. Single newlines are kept: in an
 * extracted document they are usually a list item or a heading, and flattening
 * them would merge two ideas into one chunk.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // PDF extraction is a reliable source of non-breaking spaces, which the
    // \s in the separator hierarchy below does not match. Escaped rather
    // than written literally: an invisible character in a regex is a trap.
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    // Both sides of a line break. Extracted HTML in particular arrives with a
    // space where every tag used to be, so a paragraph break that only had its
    // trailing spaces trimmed still leaves the next line starting with one.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string, options: ChunkOptions): Chunk[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const maxChars = Math.max(1, Math.trunc(options.chunkSize * CHARS_PER_TOKEN));
  const overlapChars = Math.max(
    0,
    Math.trunc(options.chunkOverlap * CHARS_PER_TOKEN),
  );

  const strategy = options.strategy ?? "recursive";
  const separators =
    strategy === "paragraph"
      ? ["\n\n", "\n", " "]
      : strategy === "fixed"
        ? [" "]
        : RECURSIVE_SEPARATORS;

  const pieces = absorbBlanks(split(cleaned, maxChars, separators));

  return applyOverlap(pieces, overlapChars, maxChars).map((content, index) => ({
    index,
    content,
    tokenCount: estimateTokens(content),
  }));
}

/**
 * Splits on the first separator that helps, recursing on anything still too
 * long. Every separator stays attached to the piece it followed, which is what
 * keeps the concatenation lossless.
 */
function split(text: string, maxChars: number, separators: string[]): string[] {
  if (text.length <= maxChars) return [text];

  const [separator, ...rest] = separators;

  // Out of separators: a single "word" longer than a whole chunk, which in
  // practice is a URL or a base64 blob. Cutting it is the only option left, and
  // it is the one case where a split can land inside a word.
  if (separator === undefined) return hardSplit(text, maxChars);

  const pieces = splitKeepingSeparator(text, separator);
  if (pieces.length === 1) return split(text, maxChars, rest);

  const out: string[] = [];
  let buffer = "";

  for (const piece of pieces) {
    if (piece.length > maxChars) {
      if (buffer) {
        out.push(buffer);
        buffer = "";
      }
      out.push(...split(piece, maxChars, rest));
      continue;
    }

    if (buffer.length + piece.length <= maxChars) {
      buffer += piece;
    } else {
      if (buffer) out.push(buffer);
      buffer = piece;
    }
  }

  if (buffer) out.push(buffer);
  return out;
}

/**
 * Folds whitespace-only pieces back into their neighbour.
 *
 * Splitting "…working.\n\nThe methodology…" on paragraph breaks and then on
 * single newlines can leave a piece that is one "\n" and nothing else. Left
 * alone it becomes a chunk: a row in the index, a vector, and a passage the
 * retriever can return, all carrying no information at all. It also breaks the
 * overlap chain, because there is no word in it for the next chunk to repeat.
 *
 * The whitespace is kept rather than discarded, so the concatenation of the
 * chunks still reproduces the document exactly.
 */
function absorbBlanks(pieces: string[]): string[] {
  const out: string[] = [];

  for (const piece of pieces) {
    if (piece.trim() === "" && out.length > 0) {
      out[out.length - 1] += piece;
      continue;
    }
    out.push(piece);
  }

  // A leading blank has nothing before it to join, so it joins what follows.
  if (out.length > 1 && out[0].trim() === "") {
    const [blank, ...rest] = out;
    rest[0] = blank + rest[0];
    return rest;
  }

  return out;
}

function splitKeepingSeparator(text: string, separator: string): string[] {
  const parts = text.split(separator);

  return parts
    .map((part, i) => (i < parts.length - 1 ? part + separator : part))
    .filter((part) => part !== "");
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}

/**
 * Repeats the tail of each chunk at the head of the next.
 *
 * Overlap is what stops a fact that straddles a boundary from being retrievable
 * from neither side. The repeated text is snapped forward to a word boundary,
 * so an overlap never begins in the middle of a word, and it is capped well
 * below the chunk size so a chunk cannot become mostly repetition.
 */
function applyOverlap(
  chunks: string[],
  overlapChars: number,
  maxChars: number,
): string[] {
  if (overlapChars <= 0 || chunks.length < 2) return chunks;

  const cap = Math.min(overlapChars, Math.floor(maxChars / 2));

  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;

    const previous = chunks[i - 1];
    let tail = previous.slice(Math.max(0, previous.length - cap));

    // Drop the partial word the slice almost certainly starts inside.
    const boundary = tail.search(/\s/);
    if (boundary === -1) return chunk;
    tail = tail.slice(boundary + 1);
    if (!tail.trim()) return chunk;

    return /\s$/.test(tail) ? tail + chunk : `${tail} ${chunk}`;
  });
}
