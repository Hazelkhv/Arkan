"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Field,
  FormStatus,
  buttonClass,
  dangerButtonClass,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import { saveChannelSettings, type ActionState } from "@/lib/admin/actions/config";
import {
  registerWebhook,
  sendBroadcast,
  unregisterWebhook,
} from "@/lib/admin/actions/channels";
import { channelLabel } from "@/lib/admin/labels";
import type { Channel } from "@/lib/ai/types";

/**
 * Per-channel presentation, the widget's embed code, and Telegram.
 *
 * The greeting and the starter questions are the assistant's first impression
 * and belong to whoever writes the firm's copy, not to a deploy — which is why
 * they are settings here rather than strings in lib/content.ts. The fallbacks
 * in that file are what a channel shows before anybody has set them.
 */

export type ChannelValues = {
  channel: Channel;
  enabled: boolean;
  welcomeMessage: string | null;
  quickReplies: string[];
  accent: string;
  position: string;
  launcherLabel: string | null;
  allowedDomains: string[];
};

export function ChannelForm({ values }: { values: ChannelValues }) {
  const [state, action] = useActionState<ActionState, FormData>(saveChannelSettings, {});
  const isWidget = values.channel === "widget";

  return (
    <Card
      title={channelLabel(values.channel)}
      description={
        isWidget
          ? "The floating panel other sites embed. It only loads on the domains listed below."
          : values.channel === "telegram"
            ? "The greeting and the buttons the bot shows on /start."
            : "The greeting and starter questions on /consultant."
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="channel" value={values.channel} />

        <label className="flex items-center gap-2 text-caption font-semibold text-ink">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={values.enabled}
            className="h-4 w-4 accent-[#143A32]"
          />
          This channel is available to visitors
        </label>

        <Field
          label="Greeting"
          hint="The first thing a visitor reads. Leave blank to use the copy shipped with the site."
          htmlFor={`welcome-${values.channel}`}
        >
          <textarea
            id={`welcome-${values.channel}`}
            name="welcomeMessage"
            defaultValue={values.welcomeMessage ?? ""}
            className={`${textareaClass} min-h-[6rem]`}
          />
        </Field>

        <Field
          label="Starter questions"
          hint="One per line, up to eight. Questions the knowledge base can actually answer make the best ones."
          htmlFor={`replies-${values.channel}`}
        >
          <textarea
            id={`replies-${values.channel}`}
            name="quickReplies"
            defaultValue={values.quickReplies.join("\n")}
            className={`${textareaClass} min-h-[7rem]`}
          />
        </Field>

        {isWidget && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Accent colour"
                hint="Pine by default. The label always sits beside the mark, so the button never depends on this being readable."
                htmlFor="widget-accent"
              >
                <input
                  id="widget-accent"
                  name="accent"
                  type="text"
                  defaultValue={values.accent}
                  placeholder="#143A32"
                  className={inputClass}
                />
              </Field>

              <Field label="Corner" htmlFor="widget-position">
                <select
                  id="widget-position"
                  name="position"
                  defaultValue={values.position}
                  className={inputClass}
                >
                  <option value="right">Bottom right</option>
                  <option value="left">Bottom left</option>
                </select>
              </Field>

              <Field label="Button label" htmlFor="widget-label">
                <input
                  id="widget-label"
                  name="launcherLabel"
                  type="text"
                  defaultValue={values.launcherLabel ?? ""}
                  placeholder="Ask Arkan"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Allowed domains"
              hint="One per line. The widget refuses to load anywhere else, and an empty list refuses everywhere — a list nobody filled in must not mean “any site at all”."
              htmlFor="widget-domains"
            >
              <textarea
                id="widget-domains"
                name="allowedDomains"
                defaultValue={values.allowedDomains.join("\n")}
                placeholder="arkan.co"
                className={`${textareaClass} min-h-[5rem] font-mono text-caption`}
              />
            </Field>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Submit label="Save" pending="Saving…" className={buttonClass} />
          <FormStatus status={state} />
        </div>
      </form>
    </Card>
  );
}

export function EmbedSnippet({ siteUrl }: { siteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${siteUrl}/widget.js" async></script>`;

  return (
    <Card
      title="Embed code"
      description="One line, before the closing </body> tag of any allowed site. Everything the visitor sees is served from Arkan, so the host page's styling cannot affect it and this script cannot read the host page."
    >
      <pre className="overflow-x-auto rounded-card bg-pine px-4 py-3 text-caption text-bone">
        <code>{snippet}</code>
      </pre>

      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
          } catch {
            setCopied(false);
          }
        }}
        className={`${buttonClass} mt-3 text-caption`}
      >
        {copied ? "Copied" : "Copy"}
      </button>

      {copied && (
        <span role="status" className="ms-3 text-caption text-pine">
          Copied to the clipboard.
        </span>
      )}
    </Card>
  );
}

export function TelegramSetup({
  siteUrl,
  tokenPresent,
  secretPresent,
  webhookUrl,
  pending,
  lastError,
  botUsername,
}: {
  siteUrl: string;
  tokenPresent: boolean;
  secretPresent: boolean;
  webhookUrl: string | null;
  pending: number;
  lastError: string | null;
  botUsername: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(registerWebhook, {});

  return (
    <Card
      title="Telegram"
      description="The bot talks to the same engine as the website. Registering the webhook is what starts it."
    >
      <dl className="grid gap-3 text-caption sm:grid-cols-2">
        <Row label="Bot token" value={tokenPresent ? "Set" : "Missing — TELEGRAM_BOT_TOKEN"} bad={!tokenPresent} />
        <Row
          label="Webhook secret"
          value={secretPresent ? "Set" : "Missing — TELEGRAM_WEBHOOK_SECRET"}
          bad={!secretPresent}
        />
        <Row label="Bot" value={botUsername ? `@${botUsername}` : "Not reachable"} bad={!botUsername} />
        <Row label="Webhook" value={webhookUrl || "Not registered"} bad={!webhookUrl} />
        <Row label="Updates waiting" value={String(pending)} />
        {lastError && <Row label="Last error from Telegram" value={lastError} bad />}
      </dl>

      <form action={action} className="mt-4 flex flex-col gap-3 border-t border-sand pt-4">
        <Field
          label="Public address of this deployment"
          hint="Telegram delivers to https only. The webhook is registered at /api/telegram/webhook under this address."
          htmlFor="telegram-base"
        >
          <input
            id="telegram-base"
            name="baseUrl"
            type="url"
            required
            defaultValue={siteUrl}
            className={inputClass}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Submit label="Register the webhook" pending="Registering…" className={buttonClass} />
          <FormStatus status={state} />
        </div>
      </form>

      {webhookUrl && (
        <form action={unregisterWebhook} className="mt-3">
          <button type="submit" className={`${dangerButtonClass} text-caption`}>
            Stop the bot (remove the webhook)
          </button>
        </form>
      )}
    </Card>
  );
}

export function BroadcastForm({ recipients }: { recipients: number }) {
  const [state, action] = useActionState<ActionState, FormData>(sendBroadcast, {});

  return (
    <Card
      title="Broadcast"
      description={`A message to all ${recipients} people who have used the Telegram bot. There is no undo, and no way to take it back once it has been read.`}
    >
      <form action={action} className="flex flex-col gap-4">
        <Field label="Message" htmlFor="broadcast-body">
          <textarea
            id="broadcast-body"
            name="body"
            required
            className={textareaClass}
            placeholder="Keep it short, useful and free of exclamation marks."
          />
        </Field>

        <label className="flex items-start gap-2 text-caption text-ink">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            className="mt-1 h-4 w-4 accent-[#143A32]"
          />
          I have read it back, and I want it sent to everyone.
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Submit
            label="Send to everyone"
            pending="Sending…"
            className={buttonClass}
          />
          <FormStatus status={state} />
        </div>
      </form>
    </Card>
  );
}

function Row({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <dt className="text-eyebrow uppercase text-slate">{label}</dt>
      <dd className={`mt-1 break-words ${bad ? "text-clay" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Submit({
  label,
  pending: pendingLabel,
  className,
}: {
  label: string;
  pending: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
