"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { company, nav } from "@/lib/content";

/**
 * Sticky header. The only reason this is a Client Component is the mobile
 * disclosure menu; everything it renders is otherwise static.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and returns focus to the control that opened it.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-sand bg-bone/85 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] max-w-[75rem] items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/#top"
          className="rounded-sm"
          aria-label={`${company.name} — back to top`}
        >
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[0.9375rem] font-medium text-slate transition-colors duration-200 hover:text-pine"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:block">
          <ButtonLink href="/#contact" size="sm">
            Request a Consultation
          </ButtonLink>
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-btn text-pine md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
            className="h-6 w-6"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
            )}
          </svg>
        </button>
      </div>

      <div
        id={menuId}
        hidden={!open}
        className="border-t border-sand bg-bone md:hidden"
      >
        <nav aria-label="Primary, mobile" className="px-5 py-3">
          <ul className="flex flex-col">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-sand/70 text-body font-medium text-pine"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink
            href="/#contact"
            className="mt-5 mb-2 w-full"
            onClick={() => setOpen(false)}
          >
            Request a Consultation
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
