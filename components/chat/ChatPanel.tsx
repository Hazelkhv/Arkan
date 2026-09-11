"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Prose } from "@/components/chat/Prose";
import {
  loadHistory,
  sendFeedback,
  streamTurn,
  type LoadedMessage,
} from "@/lib/chat-client";
import type { Channel, Citation, TurnEvent } from "@/lib/ai/types";
import { assistant, services } from "@/lib/content";

/**
 * The conversation, as a visitor experiences it.
 *
 * Three decisions here are accessibility decisions rather than visual ones, and
 * each of them looks like an odd structure until you use a screen reader:
 *
 *   1. The message being streamed is NOT inside the live region. A live region
 *      that receives text token by token is read out token by token, which is
 *      unusable. The finished message is appended to the log instead, so the
 *      answer is announced once, whole.
 *   2. "You" and "Arkan's assistant" are written labels, not just an alignment
 *      and a colour. The brand guide's rule that nothing is conveyed by colour
 *      alone applies to the shape of a conversation too.
 *   3. Auto-scroll stops the moment the visitor scrolls up. Dragging somebody
 *      back to the bottom while they are reading is the single most common way
 *      a chat interface becomes hostile.
 *
 * The opening is a sequence, not a screen. See `Stage` below.
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  /** Set once the turn finishes, which is what enables the rating buttons. */
  serverId?: string;
  /** True for a reply written by a person during a takeover. */
  fromOperator?: boolean;
};

/**
 * How often the panel checks for an operator's reply while a person is
 * answering — and only then.
 *
 * The web channels have no socket to be pushed down. Polling this narrowly is
 * what avoids one: it runs during a takeover and at no other time, so a normal
 * conversation makes no extra requests at all, and it needs no read policy on
 * `messages` — which is the thing a live subscription would have required, and
 * the thing that keeps every visitor's transcript unreachable from the browser.
 */
const TAKEOVER_POLL_MS = 5000;

/**
 * How a conversation opens.
 *
 * Everything the panel can offer at the start — a greeting, the service areas,
 * example questions, a composer, the disclaimer and the consultation CTA — used
 * to arrive in a single frame. In the 24rem launcher that is a wall of controls
 * before the visitor has been told anything, and the composer ends up below the
 * fold of a panel that is meant to be inviting.
 *
 * So the panel introduces itself instead: it greets, then it says what it can
 * talk about, and the composer appears once the visitor has seen both — or the
 * moment they say none of this is what they came for. Each screen carries one
 * idea and one list.
 *
 *   greeting → the welcome message, alone
 *   menu     → what Arkan works on, as pickable areas
 *   open     → the composer, with the example questions beside it
 *
 * Anything that starts a real conversation jumps straight to `open`: asking a
 * question, picking an area, or a reload that finds history. The sequence is
 * for a visitor who has not said anything yet, and it is never in the way of
 * one who has.
 *
 * `sequenced={false}` starts at `open` instead, which is what /consultant does:
 * that page introduces the assistant in its own heading, and somebody who
 * navigated to the chat has already chosen to have one.
 */
type Stage = "greeting" | "menu" | "open";

/**
 * Long enough that the greeting is read as its own beat, short enough that
 * nobody waits for it. A visitor who picks something is not held by it at all.
 */
const GREETING_MS = 700;

/** How far the composer grows with the question before it starts scrolling. */
const COMPOSER_MAX_PX = 160;

type Props = {
  channel?: Channel;
  starters?: string[];
  welcome?: string | null;
  /** The widget passes an absolute URL; the full-page chat uses same-origin. */
  endpoint?: string;
  sessionId?: string;
  /** The widget is already inside a small panel and provides its own CTA. */
  showCta?: boolean;
  /**
   * Focus the composer on mount. True inside the widget, where the panel has
   * just been opened deliberately; false on the full page, where it would
   * scroll the heading out of view before the visitor has read it.
   */
  autoFocus?: boolean;
  /**
   * True in the launcher and the widget. The composer there is a few inches
   * wide, where the full page's placeholder wraps onto a second line and is
   * clipped by a one-row textarea; the short one fits.
   */
  compact?: boolean;
  /**
   * Introduce the conversation a step at a time. See `Stage`.
   *
   * True where the panel is a small box a visitor has just opened and has to be
   * told what it is for. False on /consultant, which is a page whose heading and
   * introduction have already done that job above the panel, and where somebody
   * who arrived on purpose should find the composer waiting rather than a
   * sequence to sit through.
   */
  sequenced?: boolean;
  className?: string;
};

const STORAGE_KEY = "arkan.chat.conversation";

export function ChatPanel({
  channel = "web",
  starters,
  welcome,
  endpoint,
  sessionId,
  showCta = true,
  autoFocus = false,
  compact = false,
  sequenced = true,
  className = "",
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [rated, setRated] = useState<Record<string, 1 | -1>>({});
  const [withOperator, setWithOperator] = useState(false);
  const [stage, setStage] = useState<Stage>(sequenced ? "greeting" : "open");

  const conversationId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pinnedToBottom = useRef(true);
  const inputId = useId();

  /**
   * Set only when the visitor asked for the composer. The full page deliberately
   * does not autofocus — focusing it on load scrolls the heading away before it
   * has been read — but somebody who has just pressed "I'll type my question"
   * means exactly that, and should not have to click again.
   */
  const focusComposerNext = useRef(false);

  const suggestions = useMemo(
    () => (starters && starters.length > 0 ? starters : [...assistant.starters]),
    [starters],
  );

  // Pick the conversation back up after a reload. The server checks that the
  // stored id belongs to this visitor and returns nothing if it does not, so a
  // tampered value costs the visitor their history and reveals nothing.
  useEffect(() => {
    const stored = window.localStorage.getItem(`${STORAGE_KEY}.${channel}`);
    if (!stored) return;

    conversationId.current = stored;

    loadHistory(stored, { channel, sessionId, endpoint }).then((loaded) => {
      if (loaded.messages.length === 0) return;
      setMessages(loaded.messages.map(toChatMessage));
      setWithOperator(loaded.status === "human_active" || loaded.status === "needs_human");
      // A conversation that is already under way is not introduced again.
      setStage("open");
    });
  }, [channel, sessionId, endpoint]);

  // The greeting stands on its own for a beat, then the menu joins it.
  useEffect(() => {
    if (stage !== "greeting") return;

    const timer = window.setTimeout(() => setStage("menu"), GREETING_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // The composer mounts with the stage, so focus has to follow it there rather
  // than being set once on load.
  useEffect(() => {
    if (stage !== "open" || !focusComposerNext.current) return;

    focusComposerNext.current = false;
    composer.current?.focus();
  }, [stage]);

  // While a person is answering, check back for what they have said. This is
  // the only polling in the panel and it stops as soon as the bot has the
  // conversation again.
  useEffect(() => {
    if (!withOperator) return;

    const timer = window.setInterval(async () => {
      const id = conversationId.current;
      if (!id || busy) return;

      const loaded = await loadHistory(id, { channel, sessionId, endpoint });
      if (loaded.messages.length === 0) return;

      setMessages(loaded.messages.map(toChatMessage));
      setWithOperator(loaded.status === "human_active" || loaded.status === "needs_human");
    }, TAKEOVER_POLL_MS);

    return () => window.clearInterval(timer);
  }, [withOperator, busy, channel, sessionId, endpoint]);

  // Follow the answer down, but only while the visitor is already at the
  // bottom. `scrollend` is not used: it lands too late to keep a stream pinned.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const onScroll = () => {
      const distance =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      pinnedToBottom.current = distance < 80;
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinnedToBottom.current) return;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, streamingText, toolLabel]);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;

      setError(null);
      setHandoff(null);
      setBusy(true);
      setInput("");
      // A question ends the introduction, whichever step it came from.
      setStage("open");
      pinnedToBottom.current = true;

      setMessages((current) => [
        ...current,
        { id: `local-${Date.now()}`, role: "user", content: text },
      ]);

      let answer = "";
      let citations: Citation[] = [];
      let serverId: string | undefined;
      let failed: string | null = null;

      const onEvent = (event: TurnEvent) => {
        switch (event.type) {
          case "conversation":
            conversationId.current = event.conversationId;
            window.localStorage.setItem(
              `${STORAGE_KEY}.${channel}`,
              event.conversationId,
            );
            break;
          case "citations":
            citations = event.citations;
            setStreamingCitations(event.citations);
            break;
          case "delta":
            answer += event.text;
            setStreamingText(answer);
            break;
          case "tool":
            setToolLabel(event.state === "running" ? event.label : null);
            break;
          case "handoff":
            setHandoff(event.reason);
            setWithOperator(true);
            break;
          case "done":
            serverId = event.messageId || undefined;
            break;
          case "error":
            failed = event.message;
            break;
        }
      };

      try {
        await streamTurn({
          message: text,
          conversationId: conversationId.current ?? undefined,
          channel,
          sessionId,
          endpoint,
          onEvent,
        });
      } catch {
        failed = assistant.errorMessage;
      }

      setStreamingText("");
      setStreamingCitations([]);
      setToolLabel(null);
      setBusy(false);

      if (answer.trim()) {
        setMessages((current) => [
          ...current,
          {
            id: serverId ?? `local-${Date.now()}-a`,
            serverId,
            role: "assistant",
            content: answer,
            citations,
          },
        ]);
      }

      if (failed) setError(failed);

      // Focus goes back where the next question is typed, not to the answer.
      composer.current?.focus();
    },
    [busy, channel, endpoint, sessionId],
  );

  const rate = useCallback(
    async (messageId: string, rating: 1 | -1) => {
      setRated((current) => ({ ...current, [messageId]: rating }));
      await sendFeedback({ messageId, rating, channel, sessionId });
    },
    [channel, sessionId],
  );

  const reset = useCallback(() => {
    conversationId.current = null;
    window.localStorage.removeItem(`${STORAGE_KEY}.${channel}`);
    setMessages([]);
    setError(null);
    setHandoff(null);
    // A new conversation starts where the first one did.
    setStage(sequenced ? "greeting" : "open");
    if (!sequenced) composer.current?.focus();
  }, [channel, sequenced]);

  const openComposer = useCallback(() => {
    focusComposerNext.current = true;
    setStage("open");
  }, []);

  const empty = messages.length === 0 && !streamingText && !busy;

  /**
   * Keep the composer exactly as tall as what is in it.
   *
   * Driven by the value rather than by the keystroke: a height set in the
   * change handler alone is never undone when `ask` clears the box, so a
   * three-line question left a three-line empty composer behind it. It also
   * has to run on mount — a one-row textarea is shorter than the placeholder
   * it is showing, which is what put a scrollbar and a clipped second line in
   * an empty box.
   */
  useEffect(() => {
    const element = composer.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_PX)}px`;
    element.style.overflowY =
      element.scrollHeight > COMPOSER_MAX_PX ? "auto" : "hidden";
  }, [input, stage]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div
        ref={scroller}
        className={`scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 ${
          compact ? "py-4" : "py-6"
        }`}
      >
        <div
          className={`mx-auto flex w-full max-w-[46rem] flex-col ${
            compact ? "gap-4" : "gap-5"
          }`}
        >
          {empty && (
            <>
              {/* The greeting is the first step and is always present, so an
                  operator who has cleared the welcome message still gets a
                  conversation that opens by saying hello. */}
              <Bubble role="assistant">
                <Prose text={welcome?.trim() || assistant.greeting} />
              </Bubble>

              {stage === "greeting" && <Thinking />}

              {stage === "menu" && (
                <div className="chat-step pt-1">
                  <h2 className="text-eyebrow uppercase text-slate">
                    {assistant.menuHeading}
                  </h2>
                  <p className="mt-2 text-caption text-slate">
                    {assistant.menuHint}
                  </p>

                  {/* The same five areas the Services section lists, so the two
                      cannot drift apart. Picking one asks about it — it is a
                      question the visitor did not have to type, not a filter. */}
                  <ul className="mt-3 flex flex-col gap-2">
                    {services.items.map((item) => (
                      <li key={item.title}>
                        <button
                          type="button"
                          onClick={() => ask(`${assistant.topicPrefix} ${item.title}.`)}
                          className="flex min-h-11 w-full items-center rounded-btn border border-sand bg-white px-4 py-2 text-start text-[0.9375rem] leading-snug text-ink transition-colors duration-200 hover:border-pine/40 hover:bg-sand/40"
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={openComposer}
                    className="mt-3 inline-flex min-h-11 items-center text-caption font-medium text-slate underline underline-offset-4 transition-colors duration-200 hover:text-pine"
                  >
                    {assistant.askOwn}
                  </button>
                </div>
              )}

              {stage === "open" && (
                <div className="chat-step pt-1">
                  <h2 className="text-eyebrow uppercase text-slate">
                    {assistant.startersHeading}
                  </h2>
                  {/* The chips size to their content only where there is a row
                      to lay them out in. `sm:` is a viewport query and the
                      launcher is a 24rem box on a wide viewport, so keying the
                      row off it produced a ragged content-width staircase
                      inside the panel. `compact` describes the box. */}
                  <ul
                    className={`mt-3 flex flex-col gap-2 ${
                      compact ? "" : "sm:flex-row sm:flex-wrap"
                    }`}
                  >
                    {suggestions.map((starter) => (
                      <li key={starter}>
                        <button
                          type="button"
                          onClick={() => ask(starter)}
                          className={`flex min-h-11 w-full items-center rounded-btn border border-sand bg-white px-4 py-2 text-start text-[0.9375rem] leading-snug text-ink transition-colors duration-200 hover:border-pine/40 hover:bg-sand/40 ${
                            compact ? "" : "sm:w-auto"
                          }`}
                        >
                          {starter}
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* Only where there was a list to go back to. */}
                  {sequenced && (
                    <button
                      type="button"
                      onClick={() => setStage("menu")}
                      className="mt-3 inline-flex min-h-11 items-center text-caption font-medium text-slate underline underline-offset-4 transition-colors duration-200 hover:text-pine"
                    >
                      {assistant.backToMenu}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* The log holds finished messages only. See the note at the top. */}
          <ol role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-5">
            {messages.map((message) => (
              <li key={message.id} className="flex flex-col">
                <Bubble role={message.role} fromOperator={message.fromOperator}>
                  <Prose text={message.content} />
                </Bubble>

                {message.role === "assistant" && (
                  <Sources citations={message.citations} />
                )}

                {message.role === "assistant" && message.serverId && (
                  <Rating
                    value={rated[message.serverId]}
                    onRate={(rating) => rate(message.serverId!, rating)}
                  />
                )}
              </li>
            ))}
          </ol>

          {streamingText && (
            <div aria-live="off">
              <Bubble role="assistant">
                <Prose text={streamingText} />
              </Bubble>
              <Sources citations={streamingCitations} />
            </div>
          )}

          {busy && (
            <p role="status" className="flex items-center gap-2 text-caption text-slate">
              <span
                aria-hidden="true"
                className="h-2 w-2 animate-pulse rounded-full bg-brass"
              />
              {toolLabel ?? `${assistant.replying}…`}
            </p>
          )}

          {handoff && (
            <p className="rounded-card border border-sand bg-sand/50 px-4 py-3 text-caption text-ink">
              {handoff}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-card border border-clay/30 bg-clay/[0.06] px-4 py-3 text-caption text-clay"
            >
              {error}
            </p>
          )}
        </div>
      </div>

      <div
        className={`border-t border-sand bg-bone/90 backdrop-blur-sm ${
          compact ? "pt-3 pb-3" : "pt-4 pb-5"
        }`}
      >
        <div className="mx-auto w-full max-w-[46rem]">
          {/* The composer is the last step, not the first. Until the visitor has
              been greeted and shown what there is to ask about, an empty box
              asking them to think of something is the hardest thing on screen. */}
          {stage === "open" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                ask(input);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor={inputId} className="sr-only">
                {assistant.inputLabel}
              </label>
              <textarea
                id={inputId}
                ref={composer}
                value={input}
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter breaks the line. The composer is one
                  // line tall, so Enter meaning "newline" would look broken.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={
                  compact ? assistant.inputPlaceholderShort : assistant.inputPlaceholder
                }
                disabled={busy}
                autoFocus={autoFocus}
                className={`min-h-12 w-full min-w-0 flex-1 resize-none rounded-btn border border-slate/40 bg-white py-3 leading-relaxed text-ink placeholder:text-slate/70 focus:border-brass focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-70 ${
                  compact ? "px-3 text-[0.9375rem]" : "px-4 text-body"
                }`}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className={`inline-flex min-h-12 shrink-0 items-center rounded-btn bg-pine font-semibold text-bone transition-colors duration-200 hover:bg-[#0f2c26] disabled:cursor-not-allowed disabled:opacity-50 ${
                  compact ? "px-4 text-[0.9375rem]" : "px-6"
                }`}
              >
                {busy ? assistant.sending : assistant.send}
              </button>
            </form>
          )}

          {/* Side by side where there is a line to share; stacked in the
              launcher, where a three-line disclaimer and a button competing for
              24rem wrap into a staircase. */}
          <div
            className={`flex gap-3 ${stage === "open" ? "mt-3" : ""} ${
              compact
                ? "flex-col items-stretch gap-2"
                : "flex-wrap items-center justify-between"
            }`}
          >
            <p
              className={`text-caption text-slate ${compact ? "leading-snug" : ""}`}
            >
              {assistant.disclaimer}
            </p>

            {/* Both actions carry the same button shape, so the pair reads as a
                row of controls rather than a stray link beside a button. The
                CTA keeps the Pine border and the heavier weight, which is what
                still makes it the primary one. */}
            <div
              className={`flex items-center gap-2 ${compact ? "" : "shrink-0"}`}
            >
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-btn border border-slate/30 text-caption font-medium text-slate transition-colors duration-200 hover:border-pine/40 hover:text-pine ${
                    compact ? "px-3" : "px-4"
                  }`}
                >
                  {compact
                    ? assistant.newConversationShort
                    : assistant.newConversation}
                </button>
              )}

              {showCta && (
                <Link
                  href="/#contact"
                  className={`inline-flex min-h-11 items-center justify-center rounded-btn border border-pine px-4 text-center text-caption font-semibold text-pine transition-colors duration-200 hover:bg-pine/[0.06] ${
                    compact ? "flex-1" : "shrink-0"
                  }`}
                >
                  {assistant.cta}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  fromOperator = false,
  children,
}: {
  role: "user" | "assistant";
  fromOperator?: boolean;
  children: React.ReactNode;
}) {
  const mine = role === "user";

  return (
    <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
      {/* Written, not merely implied by side and colour. */}
      <span className="mb-1 text-eyebrow uppercase text-slate">
        {mine ? "You" : fromOperator ? "Arkan team" : "Arkan's assistant"}
      </span>
      <div
        className={
          mine
            ? "max-w-[85%] rounded-card bg-pine px-4 py-3 text-bone [&_p+p]:mt-3"
            : "max-w-[92%] rounded-card border border-sand bg-white px-4 py-3 text-ink shadow-card [&_p+p]:mt-3 [&_ol]:mt-2 [&_ul]:mt-2"
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The pause between the greeting and the menu.
 *
 * Decorative and hidden from assistive technology: it says nothing a screen
 * reader needs, and the step it is waiting on arrives a moment later anyway. It
 * is not the `busy` indicator — that one is a live status, because a visitor
 * who has asked something is owed the news that an answer is coming.
 */
function Thinking() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5 ps-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass"
        />
      ))}
    </span>
  );
}

/**
 * Where an answer came from.
 *
 * Collapsed by default: a citation list is reassurance, not the answer, and
 * three expanded source cards between every pair of messages would bury the
 * conversation. Open it and the titles are there, linked where the source was
 * a page rather than an upload.
 */
function Sources({ citations }: { citations?: Citation[] }) {
  if (!citations || citations.length === 0) return null;

  return (
    <details className="mt-2 max-w-[92%] self-start">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-caption font-medium text-slate underline underline-offset-4 hover:text-pine">
        {assistant.sourcesLabel} ({citations.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 border-s-2 border-sand ps-3">
        {citations.map((citation) => (
          <li key={citation.documentId} className="text-caption text-slate">
            {citation.sourceUrl ? (
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pine underline decoration-brass decoration-2 underline-offset-2"
              >
                {citation.title}
              </a>
            ) : (
              citation.title
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Rating({
  value,
  onRate,
}: {
  value?: 1 | -1;
  onRate: (rating: 1 | -1) => void;
}) {
  if (value) {
    return (
      <p role="status" className="mt-2 text-caption text-slate">
        {assistant.feedbackThanks}
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1">
      <RatingButton label={assistant.helpful} onClick={() => onRate(1)} up />
      <RatingButton label={assistant.notHelpful} onClick={() => onRate(-1)} />
    </div>
  );
}

function RatingButton({
  label,
  onClick,
  up = false,
}: {
  label: string;
  onClick: () => void;
  up?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // An icon-only control needs a name a screen reader can read out; the
      // title gives sighted users the same words on hover.
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-slate transition-colors duration-200 hover:bg-sand/60 hover:text-pine"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={up ? "h-5 w-5" : "h-5 w-5 rotate-180"}
      >
        <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z" />
        <path d="M7 10l4.2-7.2a1 1 0 0 1 1.8.3l.6 2.6a2 2 0 0 0 1.95 1.55H19a2 2 0 0 1 1.94 2.5l-1.8 7A2 2 0 0 1 17.2 21H7" />
      </svg>
    </button>
  );
}

/**
 * A stored message, as the panel renders it.
 *
 * The provider is the only thing that distinguishes a person's reply from the
 * assistant's, and it is what the label on the bubble reads.
 */
function toChatMessage(message: LoadedMessage): ChatMessage {
  return {
    id: message.id,
    serverId: message.id,
    role: message.role,
    content: message.content,
    fromOperator: message.provider === "operator",
  };
}
