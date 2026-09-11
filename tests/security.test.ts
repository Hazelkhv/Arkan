import assert from "node:assert/strict";
import { test } from "node:test";

import { isAllowed } from "@/lib/ai/origins";
import { toTelegramHtml } from "@/lib/ai/telegram";

/**
 * The two pure functions where being wrong is a vulnerability rather than a bug.
 *
 * Both fail in the same quiet way if they are written carelessly: the widget
 * still loads and Telegram still delivers, and the only difference is that
 * somebody else's site can use Arkan's assistant, or that text from the
 * knowledge base has become markup in a chat message.
 */

test("an empty allowlist refuses every origin", () => {
  // A list nobody has filled in must not mean "any site at all". This is the
  // default state of a fresh install, and it has to fail closed.
  assert.equal(isAllowed("https://arkan.co", []), false);
});

test("a listed domain is allowed, with or without www", () => {
  assert.equal(isAllowed("https://arkan.co", ["arkan.co"]), true);
  assert.equal(isAllowed("https://www.arkan.co", ["arkan.co"]), true);
});

test("a domain that merely contains the listed one is refused", () => {
  // The substring check that would allow these is the usual way an allowlist
  // quietly stops being one.
  assert.equal(isAllowed("https://arkan.co.attacker.test", ["arkan.co"]), false);
  assert.equal(isAllowed("https://notarkan.co", ["arkan.co"]), false);
  assert.equal(isAllowed("https://arkan.co.uk", ["arkan.co"]), false);
});

test("a subdomain is not the domain", () => {
  assert.equal(isAllowed("https://staging.arkan.co", ["arkan.co"]), false);
  assert.equal(isAllowed("https://staging.arkan.co", ["staging.arkan.co"]), true);
});

test("entries are normalised, so a pasted URL still works", () => {
  assert.equal(isAllowed("https://arkan.co", ["https://arkan.co/"]), true);
  assert.equal(isAllowed("https://arkan.co", ["  ARKAN.CO  "]), true);
});

test("a malformed origin is refused rather than throwing", () => {
  assert.equal(isAllowed("not a url", ["arkan.co"]), false);
  assert.equal(isAllowed("", ["arkan.co"]), false);
});

test("a port makes it a different origin", () => {
  assert.equal(isAllowed("http://localhost:3000", ["localhost"]), false);
  assert.equal(isAllowed("http://localhost:3000", ["localhost:3000"]), true);
});

test("text from a model cannot become markup in a Telegram message", () => {
  const html = toTelegramHtml('A source containing <script>alert("x")</script> & an ampersand');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp; an ampersand/);
});

test("the markdown a model writes becomes the tags Telegram renders", () => {
  const html = toTelegramHtml("**Bold** and `code` and [a link](https://arkan.co)");

  assert.match(html, /<b>Bold<\/b>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/arkan\.co">a link<\/a>/);
});

test("escaping happens before formatting, not after", () => {
  // Written the other way round, the < inside the bold text would be escaped
  // after the <b> tags were added — or, worse, the tags would be escaped too.
  const html = toTelegramHtml("**a < b** and plain > text");

  assert.match(html, /<b>a &lt; b<\/b>/);
  assert.match(html, /plain &gt; text/);
});

test("bullets and headings survive as readable text", () => {
  const html = toTelegramHtml("## Heading\n- one\n- two");

  assert.doesNotMatch(html, /##/);
  assert.match(html, /Heading/);
  assert.match(html, /• one/);
  assert.match(html, /• two/);
});

test("an over-long answer is trimmed at a boundary, never mid-tag", () => {
  const long = `${"A sentence that goes on. ".repeat(400)}`;
  const html = toTelegramHtml(long);

  // Telegram rejects a message over 4096 characters outright, so the trim has
  // to happen here rather than being discovered as a message that never sent.
  assert.ok(html.length <= 4096, `trimmed to ${html.length}`);
  assert.match(html, /\[…\]$/);
});
