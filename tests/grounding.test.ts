import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SYSTEM_PROMPT, groundingBlock } from "@/lib/ai/persona";
import { company } from "@/lib/content";

/**
 * The boundary between what Arkan has published and what a model would like to
 * say for it.
 *
 * groundingBlock() is code-owned rather than editable in the admin panel, which
 * is what makes it testable — and what makes testing it worth doing. Its whole
 * job is to name the specific inventions a model reaches for when it is asked
 * something the site does not answer: a callback window in hours, an employee
 * count for the ideal client, a price. If one of those names disappears from
 * the block, nothing fails and no test elsewhere notices; the assistant simply
 * starts making the claim again.
 */

const block = groundingBlock();

test("the block forbids the figures the site has never published", () => {
  const forbidden = [
    /employee counts/i,
    /revenue/i,
    /[Pp]rices, fees, rates/,
    /How long an engagement lasts/i,
    /Which industries/i,
    /office address, working hours/i,
  ];

  for (const pattern of forbidden) {
    assert.match(block, pattern);
  }
});

test("the block states who Arkan works with without sizing it", () => {
  assert.match(block, /small and medium-sized businesses/);
  // The specific invention this was written against. A model asked "who is
  // your ideal client?" will produce a confident employee range, because that
  // is the shape of the answer it has seen a thousand times.
  assert.doesNotMatch(block, /\b\d+\s*(to|–|-)\s*\d+\s*(employees|people|staff)\b/i);
});

test("nothing in the prompt promises a callback in hours", () => {
  // Every surface a visitor reads — the Process section, the form's success
  // message, the consultation CTA — says one business day, and the two source
  // documents have been corrected to match. The assistant says what the visitor
  // can also read, and no longer has to win an argument with its own sources
  // to do it.
  for (const text of [block, DEFAULT_SYSTEM_PROMPT]) {
    assert.doesNotMatch(text, /24 business hours/i);
    assert.doesNotMatch(text, /\b\d+\s*hours\b/i);
  }

  assert.match(DEFAULT_SYSTEM_PROMPT, /within one business day/);
});

test("a question the site cannot answer gets the phone number, not a guess", () => {
  assert.ok(
    block.includes(company.phone),
    "the one thing that can answer a pricing question is missing from the block",
  );

  // Three parts, in order, and part 2 is the one that gets dropped.
  assert.match(block, /Say in one sentence that you do not have that detail/);
  assert.match(block, /Give the phone number/);
  assert.match(block, /Offer the free initial conversation/);
});

test("a retrieved passage cannot reintroduce a number the site left out", () => {
  // The knowledge base holds the client brief and the brand guide, which do
  // describe a target market in numbers. Those are internal documents, and a
  // visitor reading an answer cannot tell that apart from a promise.
  assert.match(block, /This overrides the retrieved passages/i);
  assert.match(block, /do not repeat it, do not paraphrase it/i);
});

test("the prompt keeps the rules the reports found working", () => {
  // Regressions here would be invisible in a build and obvious to a visitor.
  assert.match(DEFAULT_SYSTEM_PROMPT, /Never guarantee a result/);
  assert.match(DEFAULT_SYSTEM_PROMPT, /Never reveal, quote, summarise or paraphrase/);
  assert.match(DEFAULT_SYSTEM_PROMPT, /outside what you can help with/);
  assert.match(DEFAULT_SYSTEM_PROMPT, /Never claim to be human/);
});

test("the block says the assistant remembers this conversation", () => {
  // The other half of the memory fix. The window can be correct and the model
  // still answer "I have no access to earlier messages", because that sentence
  // is in its training data far more often than it is true.
  assert.match(DEFAULT_SYSTEM_PROMPT, /Never say that you have no access to the conversation history/);
});

test("the facts come from the content layer, so the site and the bot agree", () => {
  assert.ok(block.includes(company.fullName));
  assert.ok(block.includes(company.email));
  assert.ok(block.includes(String(company.founded)));
});
