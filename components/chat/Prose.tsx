import { Fragment, type ReactNode } from "react";

/**
 * The small amount of Markdown a chat answer actually contains.
 *
 * Models write **bold**, `- ` lists, numbered lists and the occasional link,
 * and rendering those as literal asterisks looks broken. A full Markdown
 * library would be a dependency and a bundle for four constructs.
 *
 * There is no dangerouslySetInnerHTML here and there must never be one: this
 * builds React elements, so text from a model — which is text from a knowledge
 * base an operator uploaded — cannot become markup. Everything is escaped by
 * construction rather than by a sanitiser somebody has to remember to call.
 */

export function Prose({ text }: { text: string }) {
  return <>{blocks(text)}</>;
}

function blocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(
      <p key={`p${out.length}`} className="whitespace-pre-wrap">
        {inline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;

    const items = list.items.map((item, i) => (
      <li key={i} className="ps-1">
        {inline(item)}
      </li>
    ));

    out.push(
      list.ordered ? (
        <ol key={`l${out.length}`} className="list-decimal space-y-1 ps-5">
          {items}
        </ol>
      ) : (
        <ul key={`l${out.length}`} className="list-disc space-y-1 ps-5">
          {items}
        </ul>
      ),
    );

    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);

      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }

      list.items.push((bullet ? bullet[1] : numbered![2]).trim());
      continue;
    }

    // A heading in a three-sentence answer is noise; the text is kept and the
    // hashes are dropped rather than rendering an h3 inside a chat bubble.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);

    flushList();
    paragraph.push(heading ? heading[1] : line.trim());
  }

  flushParagraph();
  flushList();

  return out;
}

/** Bold, italics, inline code and links, in one pass over the string. */
function inline(text: string): ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>)]+)/g;

  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));

    const [token] = match;

    if (token.startsWith("**")) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key++} className="rounded bg-sand/70 px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const label = /\[([^\]]+)\]/.exec(token)?.[1] ?? token;
      out.push(
        <Link key={key++} href={match[5]}>
          {label}
        </Link>,
      );
    } else if (token.startsWith("http")) {
      out.push(
        <Link key={key++} href={token}>
          {token}
        </Link>,
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }

    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));

  return out.map((node, i) =>
    typeof node === "string" ? <Fragment key={`t${i}`}>{node}</Fragment> : node,
  );
}

/**
 * Links are underlined rather than coloured Brass.
 *
 * Brass on Bone measures 2.98:1, below the 4.5:1 floor for text, so colour
 * cannot be what marks a link here. The underline carries the meaning and Pine
 * carries the emphasis — and, per the brand guide, nothing is signalled by
 * colour alone anyway.
 */
function Link({ href, children }: { href: string; children: ReactNode }) {
  const external = !href.startsWith("/") && !href.includes("arkan.co");

  return (
    <a
      href={href}
      className="font-medium text-pine underline decoration-brass decoration-2 underline-offset-2 hover:decoration-pine"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
