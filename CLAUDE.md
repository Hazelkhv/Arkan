# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # next dev
npm run build   # next build — the only real correctness gate (TS + lint run here)
npm run start   # serve the production build
npm run lint    # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test framework in this project.

## What this is

A single-page marketing site for **Arkan**, a Tehran business-strategy advisory. Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript strict, deployed to Vercel. The site has exactly one conversion goal: getting the visitor into the Consultation Request Form. Nothing else (no store, no payments, no accounts).

Section order on the single page: Sticky Header → Hero → Services → Four Pillars → Process → Credibility → Consultation Form → Footer. Navigation is anchor links (`#services`, `#process`, `#about`, `#contact`) with smooth scrolling.

### Build state

The foundation exists ([app/globals.css](app/globals.css), [lib/content.ts](lib/content.ts), [components/ui/PillarMark.tsx](components/ui/PillarMark.tsx), [components/site/Logo.tsx](components/site/Logo.tsx)); the page itself does not. [app/page.tsx](app/page.tsx) and [app/layout.tsx](app/layout.tsx) are still create-next-app boilerplate — default metadata, Geist fonts, Next.js/Vercel links, no `dir="ltr"`. `components/sections/`, `components/icons/` and `supabase/` are empty. Two mismatches to resolve when building the layout: `--font-sans` in globals.css expects a `--font-inter` variable that nothing defines yet, and the boilerplate hero markup references `/next.svg` and `/vercel.svg`, which are not in `public/`.

## Source-of-truth documents

Three markdown files at the repo root drive every content and design decision. Read them before writing copy or picking a colour:

- `Arkan — Client & Company Brief_En.md` — company facts, services, testimonials, contact details
- `Arkan — Brand Guide_En.md` — palette, type scale, tone of voice, accessibility rules
- `پرامپت ساخت وب_سایت آرکان — برای Claude Code (1).md` — the build spec (written in Persian; the **site** is English)

**Conflict priority: Client Brief > Brand Guide > build spec.** The one rule the spec always wins on: the site is 100% English and LTR (`lang="en" dir="ltr"`). The Persian prompt file is instructions, never site content.

**Never invent content.** No statistics, clients, testimonials, awards, case studies, or claims that the brief does not state. Testimonials are reproduced verbatim. No guaranteed-results language.

## Content layer

Every user-facing string lives in [lib/content.ts](lib/content.ts) as `as const` exports (`company`, `nav`, `hero`, `services`, `pillars`, `process`, `credibility`, `consultation`, `businessStages`, `contactTimes`, `footer`, `seo`). Components import strings from there rather than hardcoding them — including SEO metadata, form labels, validation copy and success/error messages. Add new copy to this module first.

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

Scroll reveals are **opt-in**: `[data-reveal]` elements are only hidden once a `js` class is added to a wrapping element by client JS, so a no-JS render shows everything. Add `.is-visible` to reveal. `prefers-reduced-motion: reduce` disables reveals and flattens all transitions globally. Keep animation subtle — small fades and translates, nothing parallax or bouncing.

## Consultation form & Supabase

The form is the product. Fields (required marked): Full Name*, Phone*, Email, Business Name*, Industry, Business Stage* (select), biggest challenge* (textarea), Preferred Contact Time (select). Client-side validation with plain-language messages; loading → success → error states use the strings in `consultation`.

Submissions go to a Supabase `leads` table: `id uuid pk`, `created_at timestamptz`, `full_name`, `phone`, `email`, `business_name`, `industry`, `stage`, `challenge`, `preferred_time`, `status text default 'new'`. `zod` and `@supabase/supabase-js` are already installed; validate on the server route as well as the client. Credentials come from environment variables only — never hardcoded, service-role keys server-side only.

Email notification is a later integration point: mark it clearly with a comment, and never let a notification failure fail the lead insert.

## Component conventions

Server components by default; `"use client"` only on genuinely interactive pieces (mobile menu, form, reveal observer). Each page section is its own component under `components/sections/`; shared shell pieces under `components/site/`; primitives under `components/ui/`. Import via the `@/*` alias, which maps to the repo root. Components carry a doc comment explaining the *why* of non-obvious brand/accessibility decisions — match that density.

Route-level components use Next 16's generated prop types (e.g. `LayoutProps<"/">`); these come from `.next/types` and only exist after a `dev` or `build` run.

## Assets

`hero.jpg`, `team.jpg`, `og-image.jpg` and `favicon.svg` sit at the repo root as originals; the served copies are in `public/`. [app/icon.svg](app/icon.svg) is the App Router favicon. Alt text for the photos is in `lib/content.ts`, not written inline.
