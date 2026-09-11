"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Cell,
  Empty,
  Field,
  FormStatus,
  Table,
  buttonClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin/ui";
import {
  activatePrompt,
  savePrompt,
  type ActionState,
} from "@/lib/admin/actions/config";
import { when } from "@/lib/admin/labels";

/**
 * The system prompt, with its history.
 *
 * Publishing never edits a row: it deactivates the current version and inserts
 * a new one. Rollback is then a button next to a date, rather than a
 * conversation about who still has the old text — which matters because this
 * text is the entire difference between an assistant that sounds like Arkan and
 * one that sounds like a chatbot.
 */

export type PromptVersion = {
  id: string;
  label: string | null;
  persona: string | null;
  content: string;
  isActive: boolean;
  createdAt: string;
};

export function PersonaForm({
  active,
  versions,
}: {
  active: PromptVersion | null;
  versions: PromptVersion[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(savePrompt, {});

  return (
    <>
      <Card
        title="System prompt"
        description="What the assistant is told before every question. The tone rules here are the brand guide's, and the standing instruction never to guarantee an outcome is Arkan's."
      >
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Version label"
              hint="How this edit will be recognised in the list below."
              htmlFor="prompt-label"
            >
              <input
                id="prompt-label"
                name="label"
                type="text"
                placeholder="Softer closing line"
                className={inputClass}
              />
            </Field>

            <Field
              label="Persona, in a phrase"
              hint="A note for whoever reads this next. Not sent to the model."
              htmlFor="prompt-persona"
            >
              <input
                id="prompt-persona"
                name="persona"
                type="text"
                defaultValue={active?.persona ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Prompt" htmlFor="prompt-content">
            <textarea
              id="prompt-content"
              name="content"
              required
              spellCheck
              defaultValue={active?.content ?? ""}
              className={`${textareaClass} min-h-[28rem] font-mono text-caption`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Submit label="Publish" pendingLabel="Publishing…" className={buttonClass} />
            <FormStatus status={state} />
          </div>
        </form>
      </Card>

      <Card
        title="Versions"
        description="Every published version is kept. Going back is activating one, not retyping it."
      >
        {versions.length === 0 ? (
          <Empty>Nothing has been published yet.</Empty>
        ) : (
          <Table head={["Version", "Published", "Length", ""]}>
            {versions.map((version) => (
              <tr key={version.id}>
                <Cell>
                  <p className="font-medium text-ink">
                    {version.label ?? "Untitled"}
                    {version.isActive && (
                      <span className="ms-2 text-caption font-normal text-pine">
                        — live now
                      </span>
                    )}
                  </p>
                  {version.persona && <p className="text-slate">{version.persona}</p>}
                </Cell>
                <Cell className="whitespace-nowrap text-slate">
                  {when(version.createdAt)}
                </Cell>
                <Cell className="tabular text-slate">
                  {version.content.length.toLocaleString("en-US")} chars
                </Cell>
                <Cell>{!version.isActive && <Activate id={version.id} />}</Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Activate({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(activatePrompt, {});

  return (
    <form action={action}>
      <input type="hidden" name="versionId" value={id} />
      <Submit
        label="Make live"
        pendingLabel="Switching…"
        className={`${secondaryButtonClass} px-3 text-caption`}
      />
      <FormStatus status={state} />
    </form>
  );
}

function Submit({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
