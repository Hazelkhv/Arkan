import { ChatPanel } from "@/components/chat/ChatPanel";
import { WidgetFrame } from "@/components/chat/WidgetFrame";
import { isAssistantConfigured } from "@/lib/ai/admin-client";
import { getChannelSettings } from "@/lib/ai/config";
import { assistant } from "@/lib/content";

/**
 * The widget, as it exists inside the iframe.
 *
 * The same ChatPanel the full-page chat uses, in a smaller frame and on the
 * `widget` channel. Nothing about what the assistant says differs between the
 * two — that would be a second assistant — only the size of the box and where
 * the session id comes from.
 *
 * The id arrives as a query parameter because third-party storage is
 * partitioned or blocked in every current browser: localStorage inside this
 * iframe is not the host page's localStorage, and on a strict setting it may
 * not exist at all. The loader keeps the id on the host page and passes it in.
 */

export const dynamic = "force-dynamic";

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const sid = typeof params.sid === "string" ? params.sid : undefined;

  const settings = isAssistantConfigured()
    ? await getChannelSettings("widget").catch(() => null)
    : null;

  if (!settings?.enabled) {
    return (
      <WidgetFrame title={assistant.widget.title}>
        <p className="p-5 text-body text-ink">{assistant.offline}</p>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame title={assistant.widget.title}>
      <ChatPanel
        channel="widget"
        sessionId={sid}
        welcome={settings.welcomeMessage}
        starters={settings.quickReplies?.length ? [...settings.quickReplies] : undefined}
        // The panel's own consultation button would navigate the iframe rather
        // than the host page; the frame provides one that opens in the top
        // window instead.
        showCta={false}
        autoFocus
        compact
      />
    </WidgetFrame>
  );
}
