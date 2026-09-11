import type { Metadata } from "next";
import { PersonaForm, type PromptVersion } from "@/components/admin/PersonaForm";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getActivePrompt } from "@/lib/ai/config";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * The persona.
 *
 * Reading the active prompt through getActivePrompt rather than straight from
 * the table is deliberate: on a fresh install that call is what seeds the
 * factory default from lib/ai/persona.ts, so opening this page for the first
 * time shows the real starting text instead of an empty box.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Persona & prompt" };

export default async function PersonaPage() {
  await requireAdmin("content");

  const [prompt, { data }] = await Promise.all([
    getActivePrompt(),
    requireAdminDb()
      .from("prompt_versions")
      .select("id, label, persona, content, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const versions: PromptVersion[] = ((data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      id: String(row.id),
      label: (row.label as string | null) ?? null,
      persona: (row.persona as string | null) ?? null,
      content: String(row.content ?? ""),
      isActive: row.is_active === true,
      createdAt: String(row.created_at),
    }),
  );

  const active = versions.find((version) => version.isActive) ?? {
    id: prompt.id ?? "",
    label: "Factory default",
    persona: prompt.persona,
    content: prompt.content,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  return (
    <>
      <PageHeader
        title="Persona & prompt"
        description="The instructions the assistant follows. Edited here, never in code, so the tone can be corrected without a deploy."
      />

      <Card>
        <p className="text-caption text-slate">
          Three rules are load-bearing and should survive any edit: never
          guarantee an outcome, never invent a statistic or a client, and say plainly
          when the knowledge base does not cover something. They come from the brand
          guide and the client brief, not from a preference — Arkan&apos;s first stated
          value is honesty before the contract, and a confident invention breaks it more
          thoroughly than an admission ever could.
        </p>
      </Card>

      <PersonaForm active={active} versions={versions} />
    </>
  );
}
