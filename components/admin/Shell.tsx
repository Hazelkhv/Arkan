"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PillarMark } from "@/components/ui/PillarMark";
import { can, ROLE_LABELS, type Capability, type Role } from "@/lib/admin/roles";
import { signOutAction } from "@/lib/admin/actions/auth";

/**
 * The panel's frame: navigation, who is signed in, and the way out.
 *
 * Sections a role cannot use are not rendered. That is presentation, not
 * security — every page and every action checks the capability again on the
 * server — but showing an operator four screens that will redirect them is a
 * worse experience than a shorter menu.
 */

type Item = {
  href: string;
  label: string;
  capability: Capability;
  hint: string;
};

const SECTIONS: { group: string; items: Item[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", capability: "read", hint: "Volume, cost and satisfaction" },
    ],
  },
  {
    group: "The assistant",
    items: [
      { href: "/admin/knowledge", label: "Knowledge base", capability: "content", hint: "Sources the answers come from" },
      { href: "/admin/retrieval", label: "Embedding & retrieval", capability: "configure", hint: "How passages are found" },
      { href: "/admin/models", label: "Response model", capability: "configure", hint: "Which model answers, and what it costs" },
      { href: "/admin/persona", label: "Persona & prompt", capability: "content", hint: "What the assistant is told" },
      { href: "/admin/playground", label: "Playground", capability: "content", hint: "Try changes before they go live" },
    ],
  },
  {
    group: "Conversations",
    items: [
      { href: "/admin/inbox", label: "Inbox", capability: "read", hint: "Every conversation, and its sources" },
      { href: "/admin/handoff", label: "Needs a person", capability: "operate", hint: "Where the bot stepped aside" },
      { href: "/admin/leads", label: "Leads", capability: "operate", hint: "Website and assistant, one list" },
      { href: "/admin/feedback", label: "Feedback", capability: "read", hint: "Ratings and unanswered questions" },
    ],
  },
  {
    group: "Setup",
    items: [
      { href: "/admin/channels", label: "Channels", capability: "configure", hint: "Widget, Telegram, broadcast" },
      { href: "/admin/users", label: "Panel users", capability: "manage", hint: "Access and the audit log" },
      { href: "/admin/settings", label: "Settings", capability: "configure", hint: "Keys, limits, retention" },
    ],
  },
];

export function Shell({
  email,
  role,
  children,
}: {
  email: string;
  role: Role;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const groups = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(role, item.capability)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#admin-main"
        className="sr-only rounded-btn focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-pine focus:px-5 focus:py-3 focus:text-bone"
      >
        Skip to content
      </a>

      <header className="flex items-center justify-between gap-3 border-b border-sand bg-pine px-4 py-3 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="admin-nav"
          className="on-pine inline-flex h-11 items-center rounded-btn px-3 text-caption font-semibold text-bone hover:bg-bone/10"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      <nav
        id="admin-nav"
        aria-label="Admin sections"
        hidden={!open}
        className="on-pine border-b border-pine/40 bg-pine px-3 py-4 lg:sticky lg:top-0 lg:!block lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-e lg:border-pine/40"
      >
        <div className="hidden px-2 pb-5 lg:block">
          <Brand />
        </div>

        {groups.map((section) => (
          <div key={section.group} className="mb-5">
            <p className="px-2 pb-2 text-eyebrow uppercase text-sand/80">
              {section.group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 flex-col justify-center rounded-btn px-2.5 py-1.5 transition-colors duration-200 ${
                        active
                          ? "bg-bone/[0.14] text-bone"
                          : "text-sand hover:bg-bone/[0.08] hover:text-bone"
                      }`}
                    >
                      <span className="text-[0.9375rem] font-medium">{item.label}</span>
                      <span className="text-caption text-sand/70">{item.hint}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-6 border-t border-bone/15 px-2 pt-4">
          <p className="truncate text-caption text-sand" title={email}>
            {email}
          </p>
          <p className="text-caption text-sand/70">{ROLE_LABELS[role]}</p>

          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-btn border border-bone/40 px-4 text-caption font-semibold text-bone hover:bg-bone/10"
            >
              Sign out
            </button>
          </form>

          <Link
            href="/"
            className="mt-3 inline-flex min-h-11 items-center text-caption text-sand underline underline-offset-4 hover:text-bone"
          >
            Back to the website
          </Link>
        </div>
      </nav>

      <main id="admin-main" className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-[64rem] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <PillarMark tone="on-dark" className="h-4 w-[1.1667rem] shrink-0" />
      <span className="text-[0.9375rem] font-semibold text-bone">Arkan admin</span>
    </div>
  );
}
