# Arkan — website

Single-page site for Arkan, a business strategy and growth advisory firm in Tehran.
It has one conversion goal: the consultation request form.

English / LTR throughout.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Zod

No icon library, animation library or UI kit — the five service icons and the
four-pillar mark are hand-authored inline SVG.

## Running it

```bash
npm install
npm run dev
```

The form works with no configuration at all: submissions are validated, stored in
`.data/leads.json`, and logged. See "Storing leads" below to point it at a database.

```bash
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit
```

## Storing leads

1. Run `supabase/schema.sql` in the Supabase SQL editor. It creates the `leads`
   table and a row-level-security policy that lets the public form insert rows
   and nothing else — a leaked anon key cannot read anyone's contact details.
2. Copy `.env.example` to `.env.local` and fill in `SUPABASE_URL` plus
   `SUPABASE_SERVICE_ROLE_KEY`.

Without those variables the site still accepts submissions and writes them to
the fallback store in `lib/leads.ts`, which logs loudly that it is temporary.
Serverless filesystems are read-only, so in production that fallback is the
server log — configure Supabase before launch.

## Email notification

No provider is wired up. `lib/notify.ts` marks the integration point and
currently logs each new lead. Add an SDK there and read the key from an
environment variable. Notification failures are caught and never fail a
submission — the lead is already stored by the time it runs.

## Deploying

Push to Vercel and set the same environment variables in the project settings.
Everything is statically prerendered apart from the Server Action that handles
the form.

## Design notes

Brand tokens live in the `@theme` block at the top of `app/globals.css`
(Tailwind 4 is CSS-first, so there is no `tailwind.config.ts`). Copy for the
whole site lives in `lib/content.ts` — edit wording there, not in components.

One constraint worth knowing before you touch colour: **Brass measures 2.98:1
against Bone**, below even the 3:1 floor for non-text contrast. It is safe on
White (3.29:1) and on Pine (3.8:1), which is why service icons sit on white
cards and the pillar numerals sit on the dark band. `app/globals.css` records
the measured ratios beside each token.

Reference documents for content and visual decisions are in the project root:
`Arkan — Client & Company Brief_En.md` and `Arkan — Brand Guide_En.md`.
