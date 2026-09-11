import assert from "node:assert/strict";
import { test } from "node:test";

import { formatContext, toCitations } from "@/lib/ai/retrieve";
import { htmlToText } from "@/lib/ai/extract";
import type { RetrievedChunk } from "@/lib/ai/types";

/**
 * The parts of retrieval and ingestion that do not need a network or a
 * database: what a visitor is shown as a source, and what a web page becomes
 * before it is chunked.
 */

function chunk(overrides: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    content: "…",
    similarity: 0.5,
    chunkIndex: 0,
    title: "A document",
    sourceUrl: null,
    ...overrides,
  };
}

test("three chunks of one document are cited once", () => {
  const citations = toCitations([
    chunk({ id: "a", documentId: "doc-1", similarity: 0.71 }),
    chunk({ id: "b", documentId: "doc-1", similarity: 0.83 }),
    chunk({ id: "c", documentId: "doc-1", similarity: 0.62 }),
  ]);

  assert.equal(citations.length, 1);
  // The document is credited with its best match, not its last or its worst.
  assert.equal(citations[0].similarity, 0.83);
});

test("sources are listed best first", () => {
  const citations = toCitations([
    chunk({ id: "a", documentId: "brief", title: "Brief", similarity: 0.4 }),
    chunk({ id: "b", documentId: "guide", title: "Guide", similarity: 0.9 }),
    chunk({ id: "c", documentId: "faq", title: "FAQ", similarity: 0.6 }),
  ]);

  assert.deepEqual(
    citations.map((citation) => citation.title),
    ["Guide", "FAQ", "Brief"],
  );
});

test("the context block numbers passages and names their source", () => {
  const context = formatContext([
    chunk({ id: "a", title: "Brief", content: "Arkan was founded in 2017." }),
    chunk({
      id: "b",
      documentId: "doc-2",
      title: "Guide",
      sourceUrl: "https://arkan.co/guide",
      content: "The four pillars.",
    }),
  ]);

  assert.match(context, /\[1\] Brief/);
  assert.match(context, /\[2\] Guide \(https:\/\/arkan\.co\/guide\)/);
  assert.match(context, /Arkan was founded in 2017\./);
});

test("an empty retrieval formats to an empty context, not to a stray heading", () => {
  assert.equal(formatContext([]), "");
});

test("page furniture is dropped before a page is indexed", () => {
  const text = htmlToText(`
    <html>
      <head><title>Arkan — Services</title><style>.a{color:red}</style></head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <h1>Growth Strategy</h1>
        <p>We help businesses that have stalled.</p>
        <script>console.log("tracking")</script>
        <footer>© 2026 Arkan</footer>
      </body>
    </html>
  `);

  assert.match(text, /Growth Strategy/);
  assert.match(text, /We help businesses that have stalled\./);

  // A site menu repeated across forty pages is forty chunks of noise competing
  // with the answer, which is why nav and footer go before chunking.
  assert.doesNotMatch(text, /About/);
  assert.doesNotMatch(text, /tracking/);
  assert.doesNotMatch(text, /color:red/);
  assert.doesNotMatch(text, /</, "no tags survive");
});

test("HTML entities are decoded rather than embedded as their escapes", () => {
  const text = htmlToText("<p>Strategy &amp; Growth &mdash; 24&nbsp;hours &#8212; done</p>");

  assert.match(text, /Strategy & Growth/);
  assert.match(text, /—/);
  assert.doesNotMatch(text, /&amp;|&mdash;|&nbsp;|&#8212;/);
});

test("block tags become paragraph breaks so the chunker still has structure", () => {
  const text = htmlToText("<p>One idea.</p><p>Another idea.</p>");

  assert.equal(text, "One idea.\n\nAnother idea.");
});
