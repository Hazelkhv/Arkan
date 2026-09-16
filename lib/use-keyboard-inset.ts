"use client";

import { useEffect, useState } from "react";

/**
 * How many pixels of the bottom of the window the on-screen keyboard covers.
 *
 * Needed because a phone keyboard is not a viewport change that CSS can see.
 * `100dvh` accounts for the browser's own collapsing toolbars and nothing else:
 * on iOS the layout viewport keeps its full height when the keyboard opens and
 * the page is simply scrolled under it, so a `position: fixed` panel anchored to
 * the bottom — which is exactly what the launcher is — ends up with its composer
 * behind the keys the visitor is typing on.
 *
 * `visualViewport` is what does see it. The part of the window below the visual
 * viewport is the keyboard, and returning it as a number lets the panel move up
 * by that much.
 *
 * Returns 0 everywhere there is no keyboard: every desktop browser, and any
 * browser without the API. Nothing about the layout changes until something
 * actually covers it.
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      // offsetTop matters as well as height: iOS shifts the visual viewport up
      // rather than shortening it, and height alone reports no keyboard at all.
      const covered =
        window.innerHeight - (viewport.height + viewport.offsetTop);

      // A few pixels of rounding is not a keyboard. The floor keeps a panel from
      // twitching as a toolbar animates.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };

    measure();

    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);

    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active]);

  // Zeroed on the way out rather than in the effect: switching `active` off is
  // a render, and the answer for that render is already known. Writing it back
  // into state would only schedule a second one to say the same thing.
  return active ? inset : 0;
}
