"use client";

import { useEffect } from "react";

/**
 * Scroll reveals, mounted once for the whole page.
 *
 * A single IntersectionObserver drives every `[data-reveal]` element, so no
 * section needs to become a Client Component just to fade in.
 *
 * The `js` class is what activates the CSS in globals.css. It is added here,
 * after mount, rather than being baked into the markup — so if JavaScript is
 * disabled, blocked, or hydration fails, nothing is ever hidden. Elements
 * already inside the viewport are marked visible *before* the class lands,
 * which avoids a flash of content disappearing and re-fading on load.
 */
export function RevealController() {
  useEffect(() => {
    const root = document.documentElement;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );

    for (const element of elements) {
      if (element.getBoundingClientRect().top < window.innerHeight) {
        element.classList.add("is-visible");
      }
    }

    root.classList.add("js");

    if (!("IntersectionObserver" in window)) {
      for (const element of elements) element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    for (const element of elements) observer.observe(element);

    return () => {
      observer.disconnect();
      root.classList.remove("js");
    };
  }, []);

  return null;
}
