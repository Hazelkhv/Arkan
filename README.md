# Arkan — website

Single-page site for Arkan, a business strategy and growth advisory firm in
Tehran, plus a retrieval-augmented AI assistant on three channels and the admin
panel that runs it.

One conversion goal throughout: the consultation request.

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

New leads are emailed with [Resend](https://resend.com) from `lib/notify.ts`.

The recipient is `LEAD_NOTIFICATION_TO` — the firm's own inbox, not the
visitor's. Someone filling the form gets no email; the on-screen success message
is their confirmation. Their address travels inside the notification body so the
firm can reply.

Set three variables to turn sending on:

```bash
RESEND_API_KEY=re_...            # https://resend.com/api-keys, sending access
RESEND_FROM=onboarding@resend.dev
LEAD_NOTIFICATION_TO=you@example.com
```

`onboarding@resend.dev` is Resend's shared test sender. It needs no DNS setup,
but it only delivers to the address the Resend account was registered with — so
point `LEAD_NOTIFICATION_TO` at that same address and it works immediately.
That is enough for development and for a demo.

For a real launch, verify the sending domain at https://resend.com/domains and
switch to `RESEND_FROM="Arkan Website <website@arkan.co>"`. Only then can
notifications reach an arbitrary inbox.

Leave the two RESEND_ variables blank to skip sending entirely: the notification
is written to the server log instead and the lead is still stored. Notification
failures are caught and never fail a submission — the lead is saved first.

## The AI assistant

A retrieval-augmented assistant on three channels, all served by one engine.

**One brain, many channels.** `lib/ai/` owns everything the assistant does:
retrieval, conversation history, the persona, tool calls, guardrails and cost
accounting. A channel is a transport — it turns a request into a `TurnRequest`,
renders the events `runTurn` yields, and knows nothing else. If a rule about
what the assistant *says* ever appears in a channel, it is in the wrong place.

| Channel | Where | Transport |
|---|---|---|
| Full-page chat | `/consultant` | Server-sent events over `POST /api/chat` |
| Embeddable widget | an iframe at `/widget`, loaded by `public/widget.js` | The same endpoint, plus a domain allowlist |
| Telegram | `POST /api/telegram/webhook` | One message, edited as the answer grows |

The admin panel is at `/admin`.

### Setting it up

1. **Schema.** Run `supabase/assistant.sql`, then `supabase/assistant-analytics.sql`
   and `supabase/assistant-settings.sql`. They add pgvector, the knowledge base,
   the conversation store, the configuration tables and the reporting functions.

2. **Service role key.** `SUPABASE_SERVICE_ROLE_KEY` is *required* here, unlike
   for the website form. Every assistant table has row level security enabled
   with **no policy at all**, so the publishable key that ships to the browser
   reaches none of them — not the knowledge base, not a visitor's conversation,
   not the API settings. Only the server, holding the service role key, can.

3. **Keys.** `OPENROUTER_API_KEY` for generation and one embedding key —
   `OPENAI_API_KEY` by default. See `.env.example`.

4. **First owner.** Set `ADMIN_BOOTSTRAP_EMAIL`, add
   `<your-site>/admin/auth/callback` to Supabase's redirect allowlist
   (Authentication → URL Configuration), and sign in at `/admin/login`. The
   variable works once, while `admin_users` is still empty.

5. **Knowledge base.** Nothing is indexed on install, so the assistant will say
   it does not know almost everything — which is the correct behaviour, not a
   bug. Add the client brief and the brand guide from Admin → Knowledge base.

Without these the site still runs: `/consultant` shows an "unavailable" panel
with the consultation form one click away, and the widget never renders a
launcher.

### Models

Every generation model is reached through **one OpenRouter key**, so switching
is a slug in `model_config` — never a key and never a deploy.

The slugs themselves are **fetched, not remembered**. A list written into the
code names models that get retired, and the symptom is a 404 on a visitor's
question. `lib/ai/catalog.ts` reads `https://openrouter.ai/api/v1/models` at
runtime, caches it for an hour, and builds the admin picker from it. `null` in
`active_model` means "resolve from the live catalog", which is the shipped
default and the setting that does not rot.

Only tool-capable models are offered: capturing a lead and handing over to a
person are both tool calls, and they are the two things the assistant exists to
do.

### Embeddings

Configured separately, because OpenRouter does not proxy embeddings. The default
is OpenAI `text-embedding-3-large` at **1536 dimensions** rather than its 3072
default — pgvector indexes `vector` only to 2,000, and the model is
Matryoshka-trained, so the truncation is supported rather than lossy.

**Changing the embedding model breaks nothing visibly and everything actually.**
Vectors from two models are not comparable even at the same width: searches keep
running and every answer quietly gets worse. The admin panel gates the change
behind an acknowledgement, and `supabase/assistant.sql` documents the column
migration (add, backfill, cut over) that a different dimension count needs.

### The lead pipeline, shared

The assistant's `capture_lead` tool writes to the same `leads` table as the
website form, through the same Zod schema and the same store-then-notify order.
`source` says which surface produced a row and `conversation_id` opens the
conversation behind it. One list, not two — which is why the tool reuses
`lib/server-leads.ts` instead of having a path of its own.

### Guardrails

- Retrieval returning nothing is stated to the model explicitly, and the
  assistant says it does not have that detail rather than answering from the
  model's own memory of the world.
- The system prompt forbids guaranteed outcomes, invented statistics, invented
  clients and definitive advice about a specific business. It is stored in
  `prompt_versions` and edited in the panel; `lib/ai/persona.ts` is only the
  factory default.
- Rate limiting is counted in Postgres, not in memory: serverless instances do
  not share a counter.
- The spend cap downgrades to the cheapest capable model rather than going
  quiet. A visitor turned away costs more than the fraction of a cent saved.

### Tests

```bash
npm test    # node --test via tsx, over tests/*.test.ts
```

They cover the parts that fail silently: chunking (nothing lost, no split inside
a word), model resolution and scheduling against a real slice of the OpenRouter
catalog, citation grouping, HTML extraction, the widget domain allowlist, and
Telegram's escaping. `npm run build` remains the correctness gate for
everything else.

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
