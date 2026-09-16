import assert from "node:assert/strict";
import { test } from "node:test";

import { historyMessages } from "@/lib/ai/engine";
import { recentWindow, toolNote } from "@/lib/ai/memory";
import { leadConfirmation } from "@/lib/ai/tools";
import type { StoredMessage } from "@/lib/ai/types";

/**
 * The assistant's short-term memory.
 *
 * Tested here rather than left to the build because every one of these
 * functions fails silently. Nothing throws when the window is a turn too short
 * or the history never reaches the prompt — the assistant simply tells a
 * visitor who introduced themselves two messages ago that it has no record of
 * their name, which is precisely the bug this file was written for.
 */

let counter = 0;

function said(
  role: "user" | "assistant",
  content: string,
  toolCalls: unknown = null,
): StoredMessage {
  counter += 1;

  return {
    id: `m${counter}`,
    role,
    content,
    createdAt: new Date(counter * 1000).toISOString(),
    provider: null,
    toolCalls,
  };
}

function leadCall(args: Record<string, string>) {
  return [
    {
      id: "call_1",
      type: "function",
      function: { name: "capture_lead", arguments: JSON.stringify(args) },
    },
  ];
}

test("a name given earlier is still in the window the model is shown", () => {
  const history: StoredMessage[] = [
    said("user", "سلام"),
    said("assistant", "سلام، چطور می‌توانم کمک کنم؟"),
    said("user", "اسم من سیاوش است"),
    said("assistant", "خوشوقتم سیاوش."),
    said("user", "درباره خدمات بگویید"),
    said("assistant", "آرکان در چهار حوزه کار می‌کند…"),
    said("user", "اسم من چه بود؟"),
  ];

  const messages = historyMessages(recentWindow(history), "اسم من چه بود؟");
  const text = messages.map((message) => message.content).join("\n");

  assert.ok(
    text.includes("سیاوش"),
    "the visitor's name never reached the prompt, so the model cannot know it",
  );
});

test("a name survives more turns than a visitor takes to ask about it", () => {
  // Eight messages of small talk is under four exchanges, and it used to be
  // exactly enough to push the introduction out of the window.
  const history: StoredMessage[] = [said("user", "My name is Siavash")];

  for (let i = 0; i < 8; i += 1) {
    history.push(said("assistant", `Answer ${i}`));
    history.push(said("user", `Question ${i}`));
  }

  const text = historyMessages(recentWindow(history), "What was my name?")
    .map((message) => message.content)
    .join("\n");

  assert.ok(text.includes("Siavash"));
});

test("the whole conversation is sent, not only the last message", () => {
  const history: StoredMessage[] = [
    said("user", "First question"),
    said("assistant", "First answer"),
    said("user", "Second question"),
    said("assistant", "Second answer"),
    said("user", "Third question"),
  ];

  const messages = historyMessages(recentWindow(history), "Third question");

  // Four, not five: the trailing copy of the question being asked is dropped,
  // because the engine appends it itself immediately after these.
  assert.equal(messages.length, 4);
  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "assistant", "user", "assistant"],
  );
});

test("the question is not doubled, and is not lost when it was never stored", () => {
  const stored = [said("user", "Only question")];
  assert.equal(historyMessages(stored, "Only question").length, 0);

  // recordMessage swallows a write failure and returns null. The window then
  // does not end with the question, and dropping a message unconditionally
  // would drop the wrong one.
  const unstored = [said("user", "Earlier"), said("assistant", "Reply")];
  assert.equal(historyMessages(unstored, "Only question").length, 2);
});

test("a captured lead stays in the history as something already done", () => {
  const message = said("assistant", "Perfect — that is all sent over.", leadCall({
    fullName: "Siavash Rad",
    businessName: "Rad Trading",
    phone: "+98 912 000 0000",
    stage: "Growing",
    challenge: "Sales have plateaued",
  }));

  const note = toolNote(message);

  assert.ok(note);
  assert.ok(note!.includes("Siavash Rad"), "the note does not say whose request");
  assert.ok(note!.includes("Rad Trading"));
  assert.match(note!, /do not ask for them again/i);
});

test("the lead note reaches the prompt beside the answer it belongs to", () => {
  const history = [
    said("user", "Yes please, go ahead"),
    said("assistant", "Done.", leadCall({ fullName: "Siavash", businessName: "Rad" })),
    said("user", "Thanks"),
  ];

  const messages = historyMessages(history, "Something else");

  assert.equal(messages.length, 4);
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[2].role, "system");
  assert.ok(String(messages[2].content).includes("Siavash"));
});

test("an ordinary turn carries no note", () => {
  assert.equal(toolNote(said("assistant", "Arkan works in four areas.")), null);
  assert.equal(toolNote(said("user", "Hello")), null);
});

test("a malformed tool call does not take the turn down with it", () => {
  const truncated = said("assistant", "…", [
    { id: "c", type: "function", function: { name: "capture_lead", arguments: "{\"fullName\":" } },
  ]);

  // The arguments are unparseable, so there are no details to name — but the
  // fact that a request was filed is still worth carrying.
  assert.ok(toolNote(truncated));
  assert.doesNotThrow(() => historyMessages([truncated], "next"));
});

test("the confirmation promises one business day, in either language", () => {
  for (const language of ["en", "fa"] as const) {
    const text = leadConfirmation(language);

    assert.match(text, /within one business day/);
    // The wording the client brief uses and the site does not. Shown to a
    // visitor it reads as a different, more precise promise than the one the
    // Process section and the form's success message make.
    assert.doesNotMatch(text, /24/);
    assert.doesNotMatch(text, /hours/i);
  }

  assert.match(leadConfirmation("fa"), /entirely in Persian/);
  assert.match(leadConfirmation("en"), /entirely in English/);
});
