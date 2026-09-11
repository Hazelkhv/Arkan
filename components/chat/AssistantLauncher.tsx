"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { assistant } from "@/lib/content";

/**
 * The assistant, reachable from anywhere on the site.
 *
 * This is not the widget. The widget exists to run inside an iframe on somebody
 * else's page, and everything awkward about it — the loader script, the origin
 * allowlist, the session id passed as a query parameter, the postMessage close
 * — is there because of that boundary. On Arkan's own pages there is no
 * boundary: the same ChatPanel mounts directly on the `web` channel and shares
 * the conversation with /consultant, so a visitor who opens the bubble, reads
 * half an answer and then follows the link to the full page finds the same
 * conversation waiting rather than a blank one.
 *
 * Four decisions worth keeping:
 *
 *   1. It renders nothing on /consultant. That page *is* the chat; a bubble
 *      floating over it would offer a second, narrower copy of what the visitor
 *      is already looking at.
 *   2. Any link followed from inside the panel closes it. The consultation CTA
 *      goes to /#contact, which is same-document navigation — without this the
 *      panel would sit over the form the visitor was just sent to.
 *   3. Tab is trapped while the panel is open, and focus returns to the
 *      launcher on close. It is a dialog, so it has to behave like one.
 *   4. z-55 puts it over the sticky header (z-50) but under the skip link
 *      (z-60), which must stay reachable as the first thing on the page.
 *
 * The greeting, the starters and whether the channel is on at all come from
 * /api/chat/config after hydration rather than from the layout. See that
 * route's note: reading them on the server here would either bake an operator's
 * setting in at build time or make every marketing page render per request.
 */

type Config = {
  enabled: boolean;
  welcome: string | null;
  starters: string[];
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function AssistantLauncher() {
  const pathname = usePathname();
  const [config, setConfig] = useState<Config | null>(null);
  const [open, setOpen] = useState(false);

  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const hidden = pathname === "/consultant";

  useEffect(() => {
    if (hidden) return;

    const abort = new AbortController();

    fetch("/api/chat/config", { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Config | null) => {
        if (data?.enabled) {
          setConfig({
            enabled: true,
            welcome: typeof data.welcome === "string" ? data.welcome : null,
            starters: Array.isArray(data.starters) ? data.starters : [],
          });
        }
      })
      // An assistant that cannot be reached is simply not offered. The header's
      // "Ask Arkan" link and the consultation form are both still there.
      .catch(() => {});

    return () => abort.abort();
  }, [hidden]);

  const close = useCallback(() => {
    setOpen(false);
    launcher.current?.focus();
  }, []);

  // Escape closes, and Tab cycles inside the panel rather than walking off into
  // the page behind it. Both are listened for on the document: a keypress in
  // the composer bubbles up here, and nothing else needs its own handler.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const root = panel.current;
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // The page that is the chat does not also need a bubble over it, and a
  // channel the operator has switched off shows no launcher at all — a button
  // that opens onto "not available right now" is worse than no button.
  if (hidden || !config) return null;

  return (
    <>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          // See note 2: the CTA inside the panel is same-document navigation.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) close();
          }}
          className="fixed inset-x-3 bottom-3 top-[calc(var(--header-h)+0.75rem)] z-[55] flex flex-col overflow-hidden rounded-card border border-sand bg-bone shadow-[0_18px_48px_-12px_rgba(21,32,28,0.35)] sm:inset-x-auto sm:end-5 sm:top-auto sm:h-[min(36rem,calc(100dvh-8rem))] sm:w-[24rem]"
        >
          {/* Pine bar: `on-pine` flips the focus ring to Bone, because a Pine
              ring on a Pine surface cannot be seen and this bar is focusable. */}
          <div className="on-pine flex items-start justify-between gap-3 border-b border-sand bg-pine px-4 py-3">
            <div className="min-w-0">
              <p id={titleId} className="truncate font-semibold text-bone">
                {assistant.bubble.title}
              </p>
              <p className="truncate text-caption text-sand">
                {assistant.bubble.subtitle}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/consultant"
                className="hidden min-h-11 items-center rounded-btn px-3 text-caption font-semibold text-sand underline underline-offset-4 transition-colors duration-200 hover:text-bone sm:inline-flex"
              >
                {assistant.bubble.expand}
              </Link>

              <button
                type="button"
                onClick={close}
                aria-label={assistant.bubble.close}
                className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-sand transition-colors duration-200 hover:bg-bone/10 hover:text-bone"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                  className="h-5 w-5"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          {/* px-4 rather than the full page's px-8: the panel is narrow, and
              ChatPanel's own max-width does nothing at this size. */}
          <ChatPanel
            channel="web"
            welcome={config.welcome}
            starters={config.starters.length ? config.starters : undefined}
            autoFocus
            className="px-4"
          />
        </div>
      )}

      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={assistant.bubble.open}
        // Hidden from the tab order while the panel is open: it sits outside
        // the dialog, and a trapped Tab must not be able to reach it.
        tabIndex={open ? -1 : 0}
        className={`fixed bottom-5 end-5 z-[55] inline-flex min-h-14 items-center gap-2 rounded-full bg-pine px-5 text-bone shadow-[0_10px_28px_-8px_rgba(21,32,28,0.5)] transition-[transform,background-color,opacity] duration-200 ease-out-soft hover:bg-[#0f2c26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
          open ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="h-6 w-6 shrink-0"
        >
          <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12Z" />
        </svg>
        {/* The icon carries the meaning on a phone, where the words would push
            the button across a third of the screen. */}
        <span className="hidden text-[0.9375rem] font-semibold sm:inline">
          {assistant.eyebrow}
        </span>
      </button>
    </>
  );
}
