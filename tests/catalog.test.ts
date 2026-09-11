import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  costOf,
  findModel,
  groupByProvider,
  isUsableForChat,
  matchSchedule,
  resolveDefaultModel,
  selectModel,
  type CatalogModel,
} from "@/lib/ai/catalog";
import type { ModelSettings } from "@/lib/ai/types";

/**
 * Model selection, against a real slice of the OpenRouter catalog.
 *
 * The fixture is fourteen entries taken verbatim from a live response rather
 * than hand-written, because the shape of that response — the "~vendor/x-latest"
 * aliases, the ":batch" variants, prices as strings — is exactly what the
 * parsing has to survive. Writing the fixture from memory would test the
 * catalog I imagined instead of the one that exists.
 */

type FixtureModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number | null };
  supported_parameters?: string[];
};

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/openrouter-models.json", import.meta.url), "utf8"),
) as { data: FixtureModel[] };

/** Mirrors what getCatalog() does to a response, without the network. */
const catalog: CatalogModel[] = fixture.data.map((raw) => {
  const isAlias = raw.id.startsWith("~");
  const bare = isAlias ? raw.id.slice(1) : raw.id;
  const [provider, rest = ""] = bare.split("/", 2);
  const colon = rest.indexOf(":");

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    description: raw.description ?? "",
    contextLength: Number(raw.context_length ?? 0),
    maxCompletionTokens: raw.top_provider?.max_completion_tokens ?? null,
    promptPrice: Number(raw.pricing?.prompt ?? 0),
    completionPrice: Number(raw.pricing?.completion ?? 0),
    supportsTools: (raw.supported_parameters ?? []).includes("tools"),
    supportsStreaming: true,
    provider,
    created: Number(raw.created ?? 0),
    isAlias,
    variant: colon === -1 ? null : rest.slice(colon + 1),
  };
});

const baseSettings: ModelSettings = {
  channel: null,
  provider: "openrouter",
  activeModel: null,
  fallbackModel: null,
  temperature: 0.3,
  maxTokens: 1024,
  topP: 1,
  schedule: [],
  monthlyBudgetUsd: null,
};

test("batch and alias entries are never chosen to answer a visitor", () => {
  for (const model of catalog) {
    if (model.isAlias || model.variant !== null) {
      assert.equal(
        isUsableForChat(model),
        false,
        `${model.id} should not be usable for a live chat`,
      );
    }
  }
});

test("the default resolves to the cheap, fast tier and not to a flagship", () => {
  const chosen = resolveDefaultModel(catalog);

  assert.ok(chosen, "a default should be resolvable");
  assert.equal(chosen!.id, "google/gemini-3.5-flash-lite");
  assert.ok(chosen!.supportsTools, "the default must be able to call tools");
});

test("a pinned model beats the catalog's choice", () => {
  const chosen = selectModel(
    { ...baseSettings, activeModel: "anthropic/claude-haiku-4.5" },
    catalog,
  );

  assert.deepEqual(chosen, {
    slug: "anthropic/claude-haiku-4.5",
    source: "pinned",
  });
});

test("a schedule window beats the pinned model", () => {
  // Monday 10:00 in Tehran.
  const monday = new Date("2026-09-07T06:30:00Z");

  const chosen = selectModel(
    {
      ...baseSettings,
      activeModel: "openai/gpt-5.4-nano",
      schedule: [
        { days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00", model: "anthropic/claude-haiku-4.5" },
      ],
    },
    catalog,
    monday,
  );

  assert.deepEqual(chosen, {
    slug: "anthropic/claude-haiku-4.5",
    source: "schedule",
  });
});

test("outside its window a schedule leaves the pinned model alone", () => {
  // Monday 20:00 in Tehran, an hour after the window closes.
  const evening = new Date("2026-09-07T16:30:00Z");

  const chosen = selectModel(
    {
      ...baseSettings,
      activeModel: "openai/gpt-5.4-nano",
      schedule: [
        { days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00", model: "anthropic/claude-haiku-4.5" },
      ],
    },
    catalog,
    evening,
  );

  assert.equal(chosen?.source, "pinned");
});

test("a window that ends before it starts wraps past midnight", () => {
  const overnight = [{ days: [], from: "18:00", to: "09:00", model: "qwen/qwen3.8-flash" }];

  // 23:00 Tehran — inside the window.
  assert.equal(
    matchSchedule(overnight, new Date("2026-09-07T19:30:00Z")),
    "qwen/qwen3.8-flash",
  );
  // 12:00 Tehran — outside it.
  assert.equal(matchSchedule(overnight, new Date("2026-09-07T08:30:00Z")), null);
});

test("windows are read in the timezone they name, not the server's", () => {
  const hours = { days: [], from: "09:00", to: "17:00", model: "qwen/qwen3.8-flash" };

  // 16:00 UTC is 19:30 in Tehran. The same instant against the same office
  // hours falls inside the window in UTC and outside it in Tehran, so this
  // fails if the timezone is ignored — whichever way it is ignored.
  const instant = new Date("2026-09-07T16:00:00Z");

  assert.equal(
    matchSchedule([{ ...hours, tz: "UTC" }], instant),
    "qwen/qwen3.8-flash",
  );
  assert.equal(matchSchedule([hours], instant), null);
});

test("a malformed schedule entry is skipped, not crashed on", () => {
  const schedule = [
    { days: [1], from: "not a time", to: "17:00", model: "qwen/qwen3.8-flash" },
    { days: [], from: "00:00", to: "23:59", model: "openai/gpt-5.4-nano" },
  ];

  assert.equal(
    matchSchedule(schedule, new Date("2026-09-07T09:00:00Z")),
    "openai/gpt-5.4-nano",
  );
});

test("cost is priced from the catalog, and an unknown model has no price", () => {
  const haiku = findModel(catalog, "anthropic/claude-haiku-4.5");
  assert.ok(haiku);

  const cost = costOf(haiku, 1000, 500);
  assert.ok(cost !== null && cost > 0);
  assert.equal(
    cost,
    haiku!.promptPrice * 1000 + haiku!.completionPrice * 500,
  );

  // Null rather than zero: an unknown price must never be recorded as free.
  assert.equal(costOf(null, 1000, 500), null);
});

test("the admin picker groups by provider, alphabetically", () => {
  const groups = groupByProvider(catalog);
  const providers = groups.map((group) => group.provider);

  assert.deepEqual(providers, [...providers].sort());
  assert.ok(providers.includes("anthropic"));
  assert.ok(providers.includes("google"));

  for (const group of groups) {
    for (const model of group.models) {
      assert.equal(model.provider, group.provider);
    }
  }
});
