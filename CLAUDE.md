# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # next dev
npm run build   # next build — the only real correctness gate (TS + lint run here)
npm run start   # serve the production build
npm run lint    # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test framework in this project. `npm run build` is the check to run after changing code.

## What this is

A single-page marketing site for **Arkan**, a Tehran business-strategy advisory. Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript strict, deployed to Vercel. The site has exactly one conversion goal: getting the visitor into the Consultation Request Form. Nothing else (no store, no payments, no accounts).

Section order on the single page: Sticky Header → Hero → Services → Four Pillars → Process → Credibility → Consultation Form → Footer. Navigation is anchor links (`#services`, `#process`, `#about`, `#contact`) with smooth scrolling.

## Architecture

[app/layout.tsx](app/layout.tsx) is the shell: `<html lang="en" dir="ltr">`, Inter via `next/font` (which is what defines the `--font-inter` that `--font-sans` reads), metadata and OpenGraph built from `seo`, ProfessionalService JSON-LD built from `company`, plus Header, Footer and `RevealController`. [app/page.tsx](app/page.tsx) composes the six section components in visitor order and does nothing else.

Only four modules are Client Components — [components/site/Header.tsx](components/site/Header.tsx) (mobile menu), [components/sections/ConsultationForm.tsx](components/sections/ConsultationForm.tsx) (`useActionState`), [components/ui/Field.tsx](components/ui/Field.tsx) (per-field validation on blur) and [components/ui/Reveal.tsx](components/ui/Reveal.tsx) (one IntersectionObserver for the whole page). Everything else is a Server Component; keep it that way.

### The lead pipeline

Submit → `submitConsultation` in [app/actions.ts](app/actions.ts) → re-validate with the same zod schema the browser used → `toLeadRow` maps camelCase form fields onto snake_case columns → `saveLead` → `notifyNewLead`.

That order is deliberate and load-bearing: the lead is stored **before** any notification is attempted, and a notification failure is caught and swallowed. A bounced email must never cost a lead, nor show an error to a visitor who filled the form in correctly.

[lib/server-leads.ts](lib/server-leads.ts) is a barrel over that pipeline. It exists to make the server boundary visible at a glance: `lib/leads.ts` touches the filesystem and `lib/supabase.ts` reads secrets, so neither may ever be pulled into a client bundle. Import from `@/lib/server-leads`, not from those modules directly.

[lib/form-state.ts](lib/form-state.ts) holds `FormState` and `initialFormState` because a `"use server"` module may only export async functions — the initial-state object cannot live in `app/actions.ts`.

### Reading environment variables

Use `||`, never `??`. `.env.example` tells the operator to leave unused values blank, and `""` is not nullish, so `??` lets a blank line shadow the fallback instead of deferring to it — silently disabling Supabase, or emptying the notification recipient. Both sites of this bug are fixed; do not reintroduce it.

## Source-of-truth documents

Three markdown files at the repo root drive every content and design decision. Read them before writing copy or picking a colour:

- `Arkan — Client & Company Brief_En.md` — company facts, services, testimonials, contact details
- `Arkan — Brand Guide_En.md` — palette, type scale, tone of voice, accessibility rules
- `پرامپت ساخت وب_سایت آرکان — برای Claude Code (1).md` — the build spec (written in Persian; the **site** is English)

**Conflict priority: Client Brief > Brand Guide > build spec.** The one rule the spec always wins on: the site is 100% English and LTR (`lang="en" dir="ltr"`). The Persian prompt file is instructions, never site content.

**Never invent content.** No statistics, clients, testimonials, awards, case studies, or claims that the brief does not state. Testimonials are reproduced verbatim. No guaranteed-results language.

## Content layer

Every user-facing string lives in [lib/content.ts](lib/content.ts) as `as const` exports (`company`, `nav`, `hero`, `services`, `pillars`, `process`, `credibility`, `consultation`, `businessStages`, `contactTimes`, `footer`, `seo`). Components import strings from there rather than hardcoding them — including SEO metadata, form labels, validation copy and success/error messages. Add new copy to this module first.

`businessStages` and `contactTimes` are also the zod enums in [lib/validation.ts](lib/validation.ts), so editing those arrays changes both the select options and what the server will accept.

## Design tokens (Tailwind v4)

There is **no `tailwind.config.js`**. Tailwind v4 is CSS-first: all tokens are declared in the `@theme` block of [app/globals.css](app/globals.css) and become utilities automatically (`bg-pine`, `text-bone`, `text-h1`, `rounded-card`, `shadow-card`, `ease-out-soft`). Extend the theme by editing that block.

Palette: Pine `#143A32` (primary/dark surfaces/CTA), Brass `#B5853A` (accent only), Bone `#F7F3EC` (page bg), Sand `#E7DECF` (cards), Ink `#15201C` (text), Slate `#5A5F5B` (secondary text), Clay `#9B2C22` (errors — not a brand colour, added because the guide defines none). Roughly 60% light / 30% Pine / 10% Brass.

Contrast rules that constrain implementation, measured and commented in globals.css:

- **Brass is 2.98:1 on Bone** — never use it for small text, borders, or focus rings on light surfaces. Brass is allowed on Pine (3.8:1) and for large decorative accents.
- Primary CTA is always Pine background + Bone text.
- Focus rings are Pine by default; wrap dark sections in `.on-pine` to flip the ring to Bone.
- Information is never conveyed by colour alone (see the `active` prop on `PillarMark`, where the highlighted pillar is also stated in its number and title).

Type scale is fluid via `clamp()` between 375px and 1200px viewports (`text-h1`/`h2`/`h3`/`body`/`caption`/`eyebrow`). Use `.tabular` for statistics. Card radius 12px, button radius 8px, shadows very subtle.

`--header-h` (4rem, 4.5rem at md) feeds `scroll-padding-top` so anchored sections and keyboard focus clear the sticky header — keep it in sync if the header height changes.

## Motion

Scroll reveals are **opt-in**: `[data-reveal]` elements are only hidden once a `js` class is added to `<html>` by `RevealController`, so a no-JS render shows everything. Elements already inside the viewport are marked `.is-visible` *before* that class lands, which is what avoids a flash of content disappearing and re-fading on load. `prefers-reduced-motion: reduce` skips the observer entirely and flattens all transitions globally. Keep animation subtle — small fades and translates, nothing parallax or bouncing.

## Consultation form & Supabase

The form is the product. Fields (required marked): Full Name*, Phone*, Email, Business Name*, Industry, Business Stage* (select), biggest challenge* (textarea), Preferred Contact Time (select). Client-side validation is a convenience; the server re-validates the same payload. Loading → success → error states use the strings in `consultation`.

Submissions go to the Supabase `leads` table defined in [supabase/schema.sql](supabase/schema.sql), which is already applied to the live project. RLS is enabled with a single insert-only policy for `anon` — there is deliberately no select, update or delete policy, so a leaked anon key cannot read anybody's contact details back out.

Either credential pair authorises the insert: `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS, server-only) or the publishable/anon key (which relies on that policy). If neither is set, [lib/leads.ts](lib/leads.ts) falls back to `.data/leads.json` plus a structured log rather than losing the lead. Serverless filesystems are read-only, so in production that log *is* the record — configure Supabase before launch.

## Email notification

[lib/notify.ts](lib/notify.ts) sends through Resend. The recipient is `LEAD_NOTIFICATION_TO` — the firm's own inbox, **not** the visitor's. A visitor gets no email at all; the on-screen success message is their confirmation, and their address travels inside the notification body so the firm can reply.

With `RESEND_API_KEY` or `RESEND_FROM` unset the module logs instead of sending, so a fresh clone and a preview deploy both work with nothing configured.

Two things that are easy to get wrong: the SDK is imported lazily inside `deliver()` so an install without the key never loads it, and Resend reports a rejected send in the **response** rather than by throwing — the `error` field must be checked explicitly, or a bad key or an unverified sender domain looks exactly like success.

## Component conventions

Each page section is its own component under `components/sections/`; shared shell pieces under `components/site/`; primitives under `components/ui/`. Import via the `@/*` alias, which maps to the repo root. Components carry a doc comment explaining the *why* of non-obvious brand/accessibility decisions — match that density.

Route-level components use Next 16's generated prop types (e.g. `LayoutProps<"/">`); these come from `.next/types` and only exist after a `dev` or `build` run.

## Assets

The three photographs — `hero.jpg`, `team.jpg`, `og-image.jpg` — sit at the repo root as originals, with the served copies in `public/`. `favicon.svg` at the root has no `public/` copy: [app/icon.svg](app/icon.svg) is what the App Router serves as the favicon. Alt text for the photos is in `lib/content.ts`, not written inline.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
