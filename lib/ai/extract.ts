/**
 * Getting readable text out of whatever an operator uploaded.
 *
 * Four sources, one output: plain text, ready to be chunked. Everything after
 * this point in the pipeline is identical whether the words came from a PDF, a
 * Word file, a paste, or a page on the web.
 *
 * The heavy parsers are imported inside the functions that need them. An
 * install that never ingests a PDF never loads a PDF engine, and — more to the
 * point — a page render never pays for one.
 */

import { cleanText } from "@/lib/ai/chunking";
import { company } from "@/lib/content";

export type SourceType = "pdf" | "docx" | "text" | "url";

export type Extraction = {
  text: string;
  /** Filled in when the source names itself and the operator did not. */
  title: string | null;
};

/** Refuses a file large enough to exhaust a serverless function's memory. */
const MAX_BYTES = 20 * 1024 * 1024;

export async function extractFromFile(
  file: { name: string; type: string; bytes: ArrayBuffer },
): Promise<Extraction> {
  if (file.bytes.byteLength > MAX_BYTES) {
    throw new Error(
      `${file.name} is ${(file.bytes.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`,
    );
  }

  const kind = sourceTypeOf(file.name, file.type);

  if (kind === "pdf") return extractFromPdf(file.bytes, file.name);
  if (kind === "docx") return extractFromDocx(file.bytes, file.name);

  return {
    text: cleanText(new TextDecoder().decode(file.bytes)),
    title: stripExtension(file.name),
  };
}

export function sourceTypeOf(name: string, mime: string): SourceType {
  const lower = name.toLowerCase();

  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx";
  }

  return "text";
}

async function extractFromPdf(
  bytes: ArrayBuffer,
  name: string,
): Promise<Extraction> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(document, { mergePages: true });

  const cleaned = cleanText(text);

  if (!cleaned) {
    // A PDF of scanned pages has no text layer at all. Saying so is worth more
    // than an empty document that silently answers nothing.
    throw new Error(
      `${name} has no extractable text. If it is a scan, it needs to be run through OCR first.`,
    );
  }

  return { text: cleaned, title: stripExtension(name) };
}

async function extractFromDocx(
  bytes: ArrayBuffer,
  name: string,
): Promise<Extraction> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });

  return { text: cleanText(value), title: stripExtension(name) };
}

/**
 * A page from the web, as text.
 *
 * Deliberately not a crawler: it reads the one URL it is given. Following links
 * would put the knowledge base — and the answers a visitor is given — outside
 * the operator's sight, which for a firm whose brand rests on being accurate is
 * a worse trade than a little manual work.
 */
export async function extractFromUrl(url: string): Promise<Extraction> {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs can be read.");
  }

  const response = await fetch(parsed, {
    headers: { "user-agent": `ArkanAssistant/1.0 (+${company.url})` },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}.`);
  }

  const html = await response.text();

  return { text: htmlToText(html), title: titleOf(html) };
}

/**
 * HTML to text without a parser dependency.
 *
 * Script, style, nav and footer content is dropped first — a site's menu
 * repeated on forty pages is forty chunks of noise competing with the answer —
 * then tags go, then entities, then the whitespace HTML leaves everywhere.
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, " ")
    // Block-level tags become paragraph breaks so the chunker still has
    // structure to split on.
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return cleanText(decodeEntities(stripped));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return ENTITIES[name.toLowerCase()] ?? match;
    });
}

function titleOf(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match ? cleanText(decodeEntities(match[1])) : "";
  return title || null;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name;
}
