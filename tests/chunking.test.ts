import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkText, cleanText, estimateTokens } from "@/lib/ai/chunking";

/**
 * The two invariants that matter, and one that only looks like it does.
 *
 * Chunk size is the property everyone checks and the least important: a chunk
 * ten per cent over target retrieves fine. Losing a sentence at a boundary, or
 * starting a chunk mid-word, degrades retrieval silently — the search still
 * runs, the answers just get worse — so those are what these pin down.
 */

const SAMPLE = [
  "Arkan helps small and medium-sized businesses that have reached a certain level of success but have become stuck in their growth journey.",
  "Sales may have plateaued. The team may lack structure. The existing business model may no longer be working.",
  "",
  "The methodology rests on four pillars. Strategy sets direction and decides where to compete. Structure is the organisation and the processes needed to execute it.",
  "Market covers brand, marketing and the sales strategies that attract customers. Execution turns plans into measurable results.",
  "",
  "Arkan does not stop at recommendations. The team stays alongside clients through implementation, which is what the first brand value means in practice.",
].join("\n");

test("without overlap, the chunks reproduce the document exactly", () => {
  const chunks = chunkText(SAMPLE, { chunkSize: 20, chunkOverlap: 0 });

  assert.ok(chunks.length > 3, "the sample should split into several chunks");
  assert.equal(chunks.map((chunk) => chunk.content).join(""), cleanText(SAMPLE));
});

test("no chunk begins or ends inside a word", () => {
  const chunks = chunkText(SAMPLE, { chunkSize: 15, chunkOverlap: 3 });
  const source = cleanText(SAMPLE);

  for (const chunk of chunks) {
    const trimmed = chunk.content.trim();
    assert.ok(trimmed.length > 0, "no empty chunks");

    // Every chunk's first and last words must be whole words of the source.
    const first = trimmed.split(/\s+/)[0].replace(/[.,;:!?]+$/, "");
    const last = trimmed.split(/\s+/).at(-1)!.replace(/[.,;:!?]+$/, "");

    assert.ok(
      new RegExp(`(^|\\s)${escape(first)}`).test(source),
      `chunk starts mid-word: "${trimmed.slice(0, 40)}"`,
    );
    assert.ok(
      new RegExp(`${escape(last)}($|[\\s.,;:!?])`).test(source),
      `chunk ends mid-word: "${trimmed.slice(-40)}"`,
    );
  }
});

test("each chunk after the first repeats the tail of the one before it", () => {
  const chunks = chunkText(SAMPLE, { chunkSize: 25, chunkOverlap: 8 });

  assert.ok(chunks.length > 2, "need several chunks to have overlaps");

  for (let i = 1; i < chunks.length; i += 1) {
    const previous = chunks[i - 1].content.trim();
    const opening = chunks[i].content.trim().split(/\s+/)[0];

    assert.ok(
      previous.includes(opening),
      `chunk ${i} does not overlap chunk ${i - 1}: opened with "${opening}"`,
    );
  }
});

test("paragraph breaks are preferred to mid-sentence splits", () => {
  // A size large enough to hold a whole paragraph should split on the blank
  // lines rather than anywhere inside one.
  const chunks = chunkText(SAMPLE, { chunkSize: 60, chunkOverlap: 0 });

  for (const chunk of chunks) {
    assert.ok(
      /[.!?]["')\]]?\s*$/.test(chunk.content.trim()),
      `chunk does not end at a sentence: "${chunk.content.trim().slice(-50)}"`,
    );
  }
});

test("a single word longer than a whole chunk is cut rather than dropped", () => {
  const long = `start ${"x".repeat(500)} end`;
  const chunks = chunkText(long, { chunkSize: 20, chunkOverlap: 0 });

  assert.equal(chunks.map((chunk) => chunk.content).join(""), cleanText(long));
});

test("empty and whitespace-only sources produce no chunks", () => {
  assert.deepEqual(chunkText("", { chunkSize: 100, chunkOverlap: 10 }), []);
  assert.deepEqual(chunkText("   \n\n  ", { chunkSize: 100, chunkOverlap: 10 }), []);
});

test("cleanText collapses blank runs but keeps single newlines", () => {
  assert.equal(cleanText("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
  assert.equal(cleanText("a\nb"), "a\nb");
  assert.equal(cleanText("a   b"), "a b");
});

test("token estimates rise with length", () => {
  assert.ok(estimateTokens("hello world") < estimateTokens("hello world again"));
  assert.equal(estimateTokens(""), 0);
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
