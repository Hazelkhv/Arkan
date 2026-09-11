"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Empty,
  Field,
  FormStatus,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin/ui";
import {
  addSource,
  reindexDocument,
  removeDocument,
  testSearch,
  type ActionState,
  type SearchState,
} from "@/lib/admin/actions/knowledge";

/**
 * The forms that put things into the knowledge base and take them out again.
 *
 * One tabbed form rather than three, because "add a source" is one decision
 * with three shapes, and three cards side by side would make it look like three.
 */

const KINDS = [
  { value: "text", label: "Paste text" },
  { value: "file", label: "Upload a file" },
  { value: "url", label: "Read a page" },
] as const;

export function AddSourceForm() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("text");
  const [state, action] = useActionState<ActionState, FormData>(addSource, {});

  return (
    <Card
      title="Add a source"
      description="Everything the assistant knows comes from here. Indexing runs while you wait, so a large file takes a moment."
    >
      <div role="tablist" aria-label="Kind of source" className="mb-4 flex flex-wrap gap-1">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={kind === option.value}
            onClick={() => setKind(option.value)}
            className={`inline-flex min-h-11 items-center rounded-btn px-4 text-caption font-medium transition-colors duration-200 ${
              kind === option.value
                ? "bg-pine text-bone"
                : "border border-sand bg-white text-slate hover:text-pine"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="kind" value={kind} />

        {kind === "url" ? (
          <Field label="Page address" htmlFor="kb-url">
            <input
              id="kb-url"
              name="url"
              type="url"
              required
              placeholder="https://arkan.co/services"
              className={inputClass}
            />
          </Field>
        ) : kind === "file" ? (
          <Field
            label="File"
            hint="PDF, Word (.docx) or plain text, up to 20 MB. A scanned PDF has no text to extract and will be refused."
            htmlFor="kb-file"
          >
            <input
              id="kb-file"
              name="file"
              type="file"
              required
              accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown"
              className={`${inputClass} py-2.5 file:me-3 file:rounded-btn file:border-0 file:bg-pine file:px-3 file:py-1.5 file:text-caption file:font-semibold file:text-bone`}
            />
          </Field>
        ) : (
          <Field label="Text" htmlFor="kb-text">
            <textarea
              id="kb-text"
              name="text"
              required
              placeholder="Paste the answers, the policy, the FAQ…"
              className={textareaClass}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={kind === "text" ? "Title" : "Title (optional)"}
            hint="What an operator will recognise it by, and what a visitor sees as the source."
            htmlFor="kb-title"
          >
            <input
              id="kb-title"
              name="title"
              type="text"
              required={kind === "text"}
              className={inputClass}
            />
          </Field>

          <Field label="Tags (optional)" hint="Comma separated." htmlFor="kb-tags">
            <input id="kb-tags" name="tags" type="text" className={inputClass} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Submit label="Add to the knowledge base" pendingLabel="Indexing…" />
          <FormStatus status={state} />
        </div>
      </form>
    </Card>
  );
}

export function DocumentActions({ documentId }: { documentId: string }) {
  const [reindexState, reindexAction] = useActionState<ActionState, FormData>(
    reindexDocument,
    {},
  );
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    removeDocument,
    {},
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={reindexAction}>
          <input type="hidden" name="documentId" value={documentId} />
          <SmallSubmit label="Re-index" pendingLabel="Working…" className={secondaryButtonClass} />
        </form>

        <form
          action={removeAction}
          onSubmit={(event) => {
            // Deleting a source silently changes what the assistant will say to
            // the next visitor, so it asks first.
            if (!window.confirm("Delete this source and every passage indexed from it?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="documentId" value={documentId} />
          <SmallSubmit label="Delete" pendingLabel="Deleting…" className={dangerButtonClass} />
        </form>
      </div>

      <FormStatus status={reindexState.message ? reindexState : removeState} />
    </div>
  );
}

export function TestSearch() {
  const [state, action] = useActionState<SearchState, FormData>(testSearch, {});

  return (
    <Card
      title="Try a search"
      description="The same retrieval the assistant runs, with the settings that are live now. An empty result here is what a visitor gets told we do not know."
    >
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Question" htmlFor="kb-query">
            <input
              id="kb-query"
              name="query"
              type="text"
              required
              placeholder="How long does an engagement take?"
              className={inputClass}
            />
          </Field>
        </div>
        <Submit label="Search" pendingLabel="Searching…" />
      </form>

      <div className="mt-4">
        <FormStatus status={state.message ? { ok: false, message: state.message } : null} />

        {state.results &&
          (state.results.length === 0 ? (
            <Empty>
              Nothing cleared the similarity threshold. The assistant would say it does
              not have that detail.
            </Empty>
          ) : (
            <ol className="flex flex-col gap-3">
              {state.results.map((result, i) => (
                <li key={i} className="rounded-card border border-sand bg-bone/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-caption font-semibold text-ink">
                      {result.title}
                    </span>
                    <span className="tabular text-caption text-slate">
                      similarity {result.similarity.toFixed(3)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-caption text-slate">
                    {result.content.length > 600
                      ? `${result.content.slice(0, 600)}…`
                      : result.content}
                  </p>
                </li>
              ))}
            </ol>
          ))}
      </div>
    </Card>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function SmallSubmit({
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
    <button type="submit" disabled={pending} className={`${className} px-3 text-caption`}>
      {pending ? pendingLabel : label}
    </button>
  );
}
