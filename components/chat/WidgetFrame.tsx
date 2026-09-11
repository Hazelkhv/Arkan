"use client";

import { useEffect, type ReactNode } from "react";
import { assistant, company } from "@/lib/content";

/**
 * The chrome around the widget: a title bar, a close control, and the CTA.
 *
 * Three things here exist only because this runs in an iframe on somebody
 * else's page:
 *
 *   - Closing is the parent's job. This frame cannot remove itself, so it asks,
 *     and the loader script listens. The message names its source so a host
 *     page's own listeners can ignore it.
 *   - Escape has to be handled here as well as in the loader. A keypress inside
 *     an iframe never reaches the parent document, so a visitor typing in this
 *     panel would otherwise find Escape did nothing.
 *   - The consultation link targets _top. Left to itself it would load the
 *     Arkan site inside this small panel, which reads as the widget breaking.
 */

export function WidgetFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bone">
      {/* `on-pine` flips the focus ring to Bone: a Pine ring on a Pine bar is
          invisible, and this bar holds two focusable controls. */}
      <div className="on-pine flex items-center justify-between gap-3 border-b border-sand bg-pine px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold text-bone">{title}</p>
          <p className="truncate text-caption text-sand">{company.tagline}</p>
        </div>

        <div className="flex items-center gap-1">
          <a
            href={`${company.url}/#contact`}
            target="_top"
            className="inline-flex min-h-11 items-center rounded-btn border border-bone/40 px-3 text-caption font-semibold text-bone transition-colors duration-200 hover:bg-bone/10"
          >
            {assistant.cta}
          </a>

          <button
            type="button"
            onClick={close}
            aria-label={assistant.widget.close}
            title={assistant.widget.close}
            className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-bone transition-colors duration-200 hover:bg-bone/10"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
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

      {/* Focus rings invert to Bone on Pine; the panel below is a light
          surface, so only the bar above needs the class. */}
      <div className="flex min-h-0 flex-1 flex-col px-3">{children}</div>
    </div>
  );
}

/**
 * `"*"` as the target origin, deliberately: the widget is embedded on domains
 * Arkan does not know in advance, and the payload is two constant strings. There
 * is nothing here for a wrong recipient to learn.
 */
function close(): void {
  window.parent?.postMessage({ source: "arkan-widget", type: "close" }, "*");
}
