"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { assistant } from "@/lib/content";
import type { Citation } from "@/lib/ai/types";

/**
 * The full-page chat.
 *
 * Streaming is the point: the first token appears in well under a second, so
 * there is never a spinner sitting between a question and its answer. Text is
 * appended into a live region as it arrives, and the composer stays put — the
 * transcript scrolls, not the page, so the input the visitor is typing into is
 * never pushed off screen by a long reply.
 */

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  notice?: string;
  failed?: boolean;
};

const SESSION_KEY = "arkan.assistant.session";

/**
 * A per-browser id, so a returning visitor keeps one identity in
 * unified_users without any account. sessionStorage rather than localStorage:
 * this is a conversation, not a profile, and it should not outlive the tab.
 *
 * Resolved on first send rather than on mount. Reading storage during render
 * would differ between server and client and break hydration, and reading it in
 * an effect would mean setting state from an effect for a value no render
 * actually depends on. By the time this is called we are in an event handler,
 * where touching the browser is simply allowed.
 */
function readSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, or storage blocked. A per-session id still works; the
    // visitor just starts a new conversation on reload.
    return crypto.randomUUID();
  }
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationRef = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessionRef = useRef<string>("");
  const inputId = useId();

  /**
   * Follows the answer as it streams, but only while the visitor is already at
   * the bottom. Yanking the view back down while someone is reading an earlier
   * message is worse than letting the new text arrive off screen.
   */
  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;

    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 120) node.scrollTop = node.scrollHeight;
  }, [turns]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      if (!sessionRef.current) sessionRef.current = readSessionId();

      setError(null);
      setDraft("");
      setStreaming(true);

      const answerId = crypto.randomUUID();

      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: trimmed },
        { id: answerId, role: "assistant", text: "" },
      ]);

      const update = (patch: Partial<Turn>) => {
        setTurns((current) =>
          current.map((turn) => (turn.id === answerId ? { ...turn, ...patch } : turn)),
        );
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            sessionId: sessionRef.current,
            channel: "web",
            conversationId: conversationRef.current,
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? assistant.errorMessage);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let text = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;

            let event: {
              type: string;
              value?: unknown;
              message?: string;
              conversationId?: string;
              handoff?: boolean;
              leadCaptured?: boolean;
            };

            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (event.type === "conversation" && event.conversationId) {
              conversationRef.current = event.conversationId;
            } else if (event.type === "text" && typeof event.value === "string") {
              text += event.value;
              update({ text });
            } else if (event.type === "citations") {
              update({ citations: event.value as Citation[] });
            } else if (event.type === "done") {
              update({
                notice: event.leadCaptured
                  ? assistant.leadNotice
                  : event.handoff
                    ? assistant.handoffNotice
                    : undefined,
              });
            } else if (event.type === "error") {
              update({ text: event.message ?? assistant.errorMessage, failed: true });
            }
          }
        }

        if (!text.trim()) {
          update({ text: assistant.errorMessage, failed: true });
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : assistant.errorMessage;
        update({ text: message, failed: true });
        setError(message);
      } finally {
        setStreaming(false);
        inputRef.current?.focus();
      }
    },
    [isStreaming],
  );

  const reset = () => {
    conversationRef.current = null;
    setTurns([]);
    setError(null);
    inputRef.current?.focus();
  };

  const isEmpty = turns.length === 0;

  return (
    <div className="flex h-[min(72vh,44rem)] flex-col overflow-hidden rounded-card border border-sand bg-white shadow-card">
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto px-5 py-6 sm:px-8"
        // Streamed text is appended here; polite so it is announced without
        // interrupting whatever the visitor is doing.
        aria-live="polite"
        aria-atomic="false"
        aria-busy={isStreaming}
      >
        {isEmpty ? (
          <div className="mx-auto max-w-xl py-6">
            <h3 className="text-h3 text-ink">{assistant.emptyHeading}</h3>
            <p className="mt-2 text-body text-slate">{assistant.emptyBody}</p>

            <ul className="mt-6 grid gap-3">
              {assistant.starters.map((starter) => (
                <li key={starter}>
                  <button
                    type="button"
                    onClick={() => ask(starter)}
                    disabled={isStreaming}
                    className="w-full rounded-btn border border-sand bg-bone px-4 py-3 text-left text-body text-ink transition-colors duration-200 ease-out-soft hover:border-pine/40 hover:bg-sand/60 disabled:opacity-60"
                  >
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="mx-auto flex max-w-2xl flex-col gap-6">
            {turns.map((turn) => (
              <li key={turn.id}>
                <Bubble turn={turn} streaming={isStreaming} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-sand bg-bone px-5 py-4 sm:px-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
          className="mx-auto max-w-2xl"
        >
          <label htmlFor={inputId} className="sr-only">
            {assistant.inputLabel}
          </label>

          <div className="flex items-end gap-3">
            <textarea
              id={inputId}
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — what every chat
                // does, and what the muscle memory expects.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(draft);
                }
              }}
              placeholder={assistant.placeholder}
              maxLength={2000}
              disabled={isStreaming}
              className="max-h-40 min-h-[3rem] w-full resize-y rounded-btn border border-slate/40 bg-white px-4 py-3 text-body text-ink placeholder:text-slate/70 focus-visible:border-brass disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={isStreaming || !draft.trim()}
              // 44px minimum touch target, per the accessibility floor.
              className="min-h-[3rem] shrink-0 rounded-btn bg-pine px-6 py-3 text-body font-semibold text-bone transition-colors duration-200 ease-out-soft hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStreaming ? assistant.sending : assistant.send}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-slate">{assistant.disclaimer}</p>

            {!isEmpty ? (
              <button
                type="button"
                onClick={reset}
                disabled={isStreaming}
                className="rounded-btn px-2 py-1 text-caption text-slate underline underline-offset-4 hover:text-ink disabled:opacity-50"
              >
                {assistant.resetLabel}
              </button>
            ) : null}
          </div>

          {error ? (
            // role=alert so a failure is announced, not only outlined.
            <p role="alert" className="mt-2 text-caption text-clay">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function Bubble({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-card bg-pine px-4 py-3 text-body text-bone">
          {turn.text}
        </p>
      </div>
    );
  }

  const waiting = !turn.text && streaming;

  return (
    <div className="max-w-[92%]">
      {waiting ? (
        <p className="text-body text-slate">
          <span className="inline-flex gap-1" aria-hidden="true">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
          <span className="sr-only">Thinking</span>
        </p>
      ) : (
        <p
          className={`whitespace-pre-wrap text-body ${turn.failed ? "text-clay" : "text-ink"}`}
        >
          {turn.text}
        </p>
      )}

      {turn.notice ? (
        <p className="mt-3 rounded-btn border border-brass/40 bg-sand/50 px-3 py-2 text-caption text-ink">
          {turn.notice}
        </p>
      ) : null}

      {turn.citations?.length ? (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-slate">
            {assistant.sourcesLabel}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {turn.citations.map((citation) => (
              <li key={citation.documentId} className="text-caption text-slate">
                {citation.sourceUrl ? (
                  <a
                    href={citation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    {citation.title}
                  </a>
                ) : (
                  citation.title
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate/60"
      style={{ animationDelay: delay }}
    />
  );
}
