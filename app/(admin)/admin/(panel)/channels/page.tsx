import type { Metadata } from "next";
import {
  BroadcastForm,
  ChannelForm,
  EmbedSnippet,
  TelegramSetup,
  type ChannelValues,
} from "@/components/admin/ChannelForms";
import { Card, Cell, Empty, PageHeader, Table } from "@/components/admin/ui";
import { requireAdminDb } from "@/lib/ai/admin-client";
import { getMe, getWebhookInfo, isTelegramConfigured } from "@/lib/ai/telegram";
import { channels, type Channel } from "@/lib/ai/types";
import { requireAdmin } from "@/lib/admin/auth";
import { when } from "@/lib/admin/labels";
import { company } from "@/lib/content";

/**
 * Channels: what each one says, where the widget may load, and Telegram.
 *
 * The Telegram panel reports what Telegram itself says rather than what this
 * database thinks. `getWebhookInfo` is the only thing that knows whether the
 * bot is actually connected, and a settings screen that showed a saved value
 * instead would say "connected" for a webhook that was rejected an hour ago.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Channels" };

export default async function ChannelsPage() {
  await requireAdmin("configure");

  const db = requireAdminDb();
  const telegramReady = isTelegramConfigured();

  const [{ data: settingsRows }, { count: telegramUsers }, { data: broadcastRows }, webhook, bot] =
    await Promise.all([
      db.from("channel_settings").select("*"),
      db
        .from("unified_users")
        .select("id", { count: "exact", head: true })
        .eq("channel", "telegram"),
      db
        .from("broadcasts")
        .select("id, body, status, sent_count, failed_count, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      telegramReady ? getWebhookInfo() : Promise.resolve(null),
      telegramReady ? getMe() : Promise.resolve(null),
    ]);

  const rows = (settingsRows ?? []) as Record<string, unknown>[];
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || company.url).replace(/\/+$/, "");

  return (
    <>
      <PageHeader
        title="Channels"
        description="Three ways into the same assistant. Nothing about what it says differs between them."
      />

      {channels.map((channel) => (
        <ChannelForm key={channel} values={toValues(channel, rows)} />
      ))}

      <EmbedSnippet siteUrl={siteUrl} />

      <TelegramSetup
        siteUrl={siteUrl}
        tokenPresent={telegramReady}
        secretPresent={Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)}
        webhookUrl={webhook?.url || null}
        pending={webhook?.pending_update_count ?? 0}
        lastError={webhook?.last_error_message || null}
        botUsername={bot?.username ?? null}
      />

      <BroadcastForm recipients={telegramUsers ?? 0} />

      <Card title="Recent broadcasts">
        {(broadcastRows ?? []).length === 0 ? (
          <Empty>Nothing has been broadcast.</Empty>
        ) : (
          <Table head={["Sent", "Message", "Delivered", "Failed", "Status"]}>
            {((broadcastRows ?? []) as Record<string, unknown>[]).map((row) => (
              <tr key={String(row.id)}>
                <Cell className="whitespace-nowrap text-slate">
                  {when(String(row.created_at))}
                </Cell>
                <Cell className="max-w-md text-ink">
                  {String(row.body).slice(0, 160)}
                  {String(row.body).length > 160 && "…"}
                </Cell>
                <Cell className="tabular">{String(row.sent_count)}</Cell>
                <Cell className="tabular">{String(row.failed_count)}</Cell>
                <Cell>{String(row.status)}</Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function toValues(channel: Channel, rows: Record<string, unknown>[]): ChannelValues {
  const row = rows.find((entry) => entry.channel === channel);
  const appearance = (row?.appearance ?? {}) as Record<string, unknown>;

  return {
    channel,
    // A channel with no row at all is available: the full-page chat has to work
    // on a fresh install, before anybody has opened this screen.
    enabled: row ? row.enabled === true : true,
    welcomeMessage: (row?.welcome_message as string | null) ?? null,
    quickReplies: Array.isArray(row?.quick_replies) ? (row.quick_replies as string[]) : [],
    accent: (appearance.accent as string) || "#143A32",
    position: (appearance.position as string) || "right",
    launcherLabel: (appearance.launcherLabel as string | null) ?? null,
    allowedDomains: Array.isArray(row?.allowed_domains)
      ? (row.allowed_domains as string[])
      : [],
  };
}
