"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  Field,
  FormStatus,
  buttonClass,
  dangerButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin/ui";
import {
  closeConversation,
  flagConversation,
  replyAsOperator,
  returnToBot,
  takeOver,
  type ActionState,
} from "@/lib/admin/actions/inbox";

/**
 * Taking over, replying, and handing back.
 *
 * The reply box only appears once the conversation has actually been taken
 * over. Replying while the bot is still answering would put two voices in the
 * thread at once — the operator typing, the assistant answering the next
 * question underneath them — and the visitor would have no way to tell which
 * was which.
 */
export function ConversationControls({
  conversationId,
  status,
  flagged,
}: {
  conversationId: string;
  status: string;
  flagged: boolean;
}) {
  const [takeState, takeAction] = useActionState<ActionState, FormData>(takeOver, {});
  const [returnState, returnAction] = useActionState<ActionState, FormData>(returnToBot, {});
  const [closeState, closeActionFn] = useActionState<ActionState, FormData>(
    closeConversation,
    {},
  );
  const [flagState, flagAction] = useActionState<ActionState, FormData>(
    flagConversation,
    {},
  );
  const [replyState, replyAction] = useActionState<ActionState, FormData>(
    replyAsOperator,
    {},
  );

  const mine = status === "human_active";

  return (
    <Card
      title="Handling"
      description={
        mine
          ? "You are answering this conversation. The assistant will not reply while that is true."
          : "Take it over to answer as a person. The assistant stops replying the moment you do."
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {!mine && (
          <form action={takeAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <Submit label="Take over" pending="Taking over…" className={buttonClass} />
          </form>
        )}

        {mine && (
          <form action={returnAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <Submit
              label="Give it back to the assistant"
              pending="Handing back…"
              className={secondaryButtonClass}
            />
          </form>
        )}

        <form action={flagAction}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="flagged" value={flagged ? "no" : "yes"} />
          <Submit
            label={flagged ? "Remove the flag" : "Flag for review"}
            pending="Saving…"
            className={`${secondaryButtonClass} text-caption`}
          />
        </form>

        {status !== "closed" && (
          <form action={closeActionFn}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <Submit
              label="Close"
              pending="Closing…"
              className={`${dangerButtonClass} text-caption`}
            />
          </form>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <FormStatus status={takeState} />
        <FormStatus status={returnState} />
        <FormStatus status={closeState} />
        <FormStatus status={flagState} />
      </div>

      {mine && (
        <form action={replyAction} className="mt-4 border-t border-sand pt-4">
          <input type="hidden" name="conversationId" value={conversationId} />

          <Field
            label="Reply as a person"
            hint="Telegram receives this straight away. On the website the visitor's panel picks it up within a few seconds."
            htmlFor="operator-reply"
          >
            <textarea
              id="operator-reply"
              name="body"
              required
              className={textareaClass}
              placeholder="Hello — I'm from the Arkan team…"
            />
          </Field>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Submit label="Send" pending="Sending…" className={buttonClass} />
            <FormStatus status={replyState} />
          </div>
        </form>
      )}
    </Card>
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
