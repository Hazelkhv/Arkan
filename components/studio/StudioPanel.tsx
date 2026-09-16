"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { studio } from "@/lib/content";
import type {
  LessonRecord,
  PipelineStep,
  PostRecord,
  RunRecord,
} from "@/lib/blog/store/types";

/**
 * اتاق کنترل پایپ‌لاین.
 *
 * تنها Client Component این سیستم، و دلیلش روشن است: اینجا واقعاً تعامل زنده
 * داریم — دکمه‌ی شروع، نمای گام‌به‌گامِ در حال تغییر، تأیید انتشار، بازخورد.
 *
 * درباره‌ی polling: تا وقتی وضعیت اجرا `running` است هر دو ثانیه رکورد را
 * می‌پرسیم و تمام. همین. نه WebSocket، نه SSE. پایپ‌لاین چند دقیقه طول می‌کشد و
 * چند ده بار تغییر می‌کند؛ ارزش پیچیدگیِ یک اتصال زنده را ندارد، و مهم‌تر:
 * چون وضعیت در دیتابیس است، بستن و باز کردن صفحه هیچ چیزی را از دست نمی‌دهد.
 */

type Tab = "run" | "posts" | "lessons";

type PostSummary = Omit<PostRecord, "contentMd">;

export function StudioPanel({
  storeKind,
  posts,
  lessons,
}: {
  storeKind: "memory" | "supabase";
  posts: PostSummary[];
  lessons: LessonRecord[];
}) {
  const [tab, setTab] = useState<Tab>("run");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
      <header className="border-b border-sand pb-6">
        <h1 className="text-h2 text-ink">{studio.title}</h1>
        <p className="mt-2 text-slate">{studio.subtitle}</p>
        <p className="mt-4 inline-flex rounded-btn border border-sand bg-white px-3 py-1 text-caption text-slate">
          {storeKind === "memory" ? studio.storageMemory : studio.storageSupabase}
        </p>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-sand" aria-label="Studio sections">
        {(
          [
            ["run", studio.tabs.run],
            ["posts", studio.tabs.posts],
            ["lessons", studio.tabs.lessons],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value ? "page" : undefined}
            className={`-mb-px min-h-11 border-b-2 px-4 text-[0.9375rem] font-semibold transition-colors duration-200 ${
              tab === value
                ? "border-pine text-pine"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="py-8">
        {tab === "run" && <RunTab />}
        {tab === "posts" && <PostsTab initial={posts} />}
        {tab === "lessons" && <LessonsTab initial={lessons} />}
      </div>
    </main>
  );
}

/* ── خط تولید ───────────────────────────────────────────────────────────── */

function RunTab() {
  const [hint, setHint] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * حلقه‌ی polling.
   *
   * تا وقتی اجرا `running` است هر دو ثانیه یک‌بار می‌پرسیم. تابع پاک‌سازی هم
   * interval را متوقف می‌کند و هم پرچم cancelled را می‌زند: بدون آن، پاسخی که
   * بعد از بسته شدن تب می‌رسد روی کامپوننتِ unmount شده setState می‌کند.
   */
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const response = await fetch(`/api/pipeline/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not read the run.");
        const data = (await response.json()) as { run: RunRecord };
        if (cancelled) return;
        setRun(data.run);
        if (data.run.status !== "running") clearInterval(id);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        clearInterval(id);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId]);

  async function start() {
    setStarting(true);
    setError(null);
    setRun(null);
    try {
      const response = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicHint: hint }),
      });
      const data = (await response.json()) as { runId?: string; error?: string };
      if (!response.ok || !data.runId) throw new Error(data.error ?? "Could not start.");
      // تغییر runId، افکتِ polling را راه می‌اندازد.
      setRunId(data.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  }

  const running = run?.status === "running" || (Boolean(runId) && !run);

  return (
    <section>
      <h2 className="text-h3 text-ink">{studio.runHeading}</h2>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="topic-hint" className="text-caption font-semibold text-ink">
            {studio.runHint}
          </label>
          <input
            id="topic-hint"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder={studio.runHintPlaceholder}
            className="mt-2 min-h-12 w-full rounded-btn border border-slate/40 bg-white px-4 text-ink focus:border-brass focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
          />
        </div>
        <Button type="button" onClick={start} disabled={starting || running}>
          {running ? studio.runningButton : studio.runButton}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-caption text-clay">
          {error}
        </p>
      )}

      {run && (
        <div className="mt-8">
          <ol className="grid gap-3">
            {run.steps.map((step, index) => (
              <StepRow key={`${step.agent}-${index}`} step={step} />
            ))}
          </ol>

          {run.status === "error" && (
            <p role="alert" className="mt-6 rounded-card border border-clay/40 bg-white p-4 text-caption text-clay">
              {run.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const STATUS_MARK: Record<PipelineStep["status"], string> = {
  running: "◌",
  done: "✓",
  error: "✕",
};

function StepRow({ step }: { step: PipelineStep }) {
  return (
    <li
      className={`rounded-card border bg-white p-4 ${
        step.status === "error" ? "border-clay/40" : "border-sand"
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className={`tabular ${step.status === "error" ? "text-clay" : "text-brass"}`}
        >
          {STATUS_MARK[step.status]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">
            {step.agent}
            {/* وضعیت با متن هم گفته می‌شود، نه فقط با رنگ و علامت. */}
            <span className="ms-2 font-normal text-slate">
              {step.label} · {step.status}
            </span>
          </p>
          {(step.summary || step.error) && (
            <p className="mt-1 text-caption text-slate">{step.error ?? step.summary}</p>
          )}
          {step.ms !== undefined && (
            <p className="mt-1 text-caption tabular text-slate/80">
              {(step.ms / 1000).toFixed(1)}s
              {step.model ? ` · ${step.model}` : ""}
              {step.outputTokens ? ` · ${step.outputTokens} output tokens` : ""}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/* ── پست‌ها ─────────────────────────────────────────────────────────────── */

function PostsTab({ initial }: { initial: PostSummary[] }) {
  /**
   * داده‌ی اولیه از سرور می‌آید، نه از یک fetch در useEffect.
   *
   * دو فایده: صفحه بدون پرشِ «Loading…» باز می‌شود، و React از یک رندر اضافه
   * خلاص می‌شود. بعد از هر تغییر، فقط همان لیست دوباره خوانده می‌شود — داخل
   * هندلر رویداد، جایی که واقعاً چیزی عوض شده است.
   */
  const [posts, setPosts] = useState<PostSummary[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/posts", { cache: "no-store" });
    const data = (await response.json()) as { posts: PostSummary[] };
    setPosts(data.posts);
  }, []);

  async function setStatus(id: string, status: "draft" | "published") {
    setBusy(id);
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    setBusy(null);
  }

  if (posts.length === 0) return <p className="text-slate">{studio.postsEmpty}</p>;

  return (
    <ul className="grid gap-4">
      {posts.map((post) => (
        <li key={post.id} className="rounded-card border border-sand bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[1.0625rem] font-semibold text-ink">{post.title}</h3>
            <p className="text-caption tabular text-slate">
              {post.status} · {post.score}/100
            </p>
          </div>
          <p className="mt-2 text-caption text-slate">{post.excerpt}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {post.status === "draft" ? (
              <Button
                size="sm"
                type="button"
                disabled={busy === post.id}
                onClick={() => setStatus(post.id, "published")}
              >
                {studio.publish}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  disabled={busy === post.id}
                  onClick={() => setStatus(post.id, "draft")}
                >
                  {studio.unpublish}
                </Button>
                <a
                  href={`/blog/${post.slug}`}
                  className="inline-flex min-h-11 items-center px-3 text-[0.9375rem] font-semibold text-pine underline underline-offset-4"
                >
                  {studio.view}
                </a>
              </>
            )}
          </div>

          <FeedbackForm postId={post.id} />
        </li>
      ))}
    </ul>
  );
}

/** 👍/👎 + توضیح → منتقد → درس. */
function FeedbackForm({ postId }: { postId: string }) {
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(rating: "up" | "down") {
    setBusy(true);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, rating, comment }),
    });
    setBusy(false);
    setSent(true);
    setComment("");
  }

  if (sent) return <p className="mt-4 text-caption text-pine">{studio.feedbackThanks}</p>;

  return (
    <div className="mt-5 border-t border-sand pt-4">
      <label htmlFor={`comment-${postId}`} className="text-caption text-slate">
        {studio.feedbackCommentPlaceholder}
      </label>
      <textarea
        id={`comment-${postId}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
        className="mt-2 w-full rounded-btn border border-slate/40 bg-white p-3 text-caption text-ink focus:border-brass focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={() => send("up")}>
          {studio.feedbackUp}
        </Button>
        <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={() => send("down")}>
          {studio.feedbackDown}
        </Button>
      </div>
    </div>
  );
}

/* ── درس‌ها ─────────────────────────────────────────────────────────────── */

function LessonsTab({ initial }: { initial: LessonRecord[] }) {
  const [lessons, setLessons] = useState<LessonRecord[]>(initial);

  const load = useCallback(async () => {
    const response = await fetch("/api/lessons", { cache: "no-store" });
    const data = (await response.json()) as { lessons: LessonRecord[] };
    setLessons(data.lessons);
  }, []);

  async function remove(id: string) {
    await fetch(`/api/lessons?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <section>
      <p className="max-w-2xl text-caption text-slate">{studio.lessonsIntro}</p>

      {lessons.length === 0 ? (
        <p className="mt-6 text-slate">{studio.lessonsEmpty}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {lessons.map((lesson) => (
            <li
              key={lesson.id}
              className={`rounded-card border bg-white p-4 ${
                lesson.active ? "border-sand" : "border-sand/50 opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-caption font-semibold uppercase tracking-wide text-pine">
                  {lesson.agent}
                </p>
                <p className="text-caption text-slate">
                  {lesson.source} · {lesson.active ? "active" : "retired"}
                </p>
              </div>
              <p className="mt-2 text-[0.9375rem] text-ink">{lesson.lesson}</p>
              <button
                type="button"
                onClick={() => remove(lesson.id)}
                className="mt-3 min-h-11 text-caption font-semibold text-clay underline underline-offset-4"
              >
                {studio.deleteLesson}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
