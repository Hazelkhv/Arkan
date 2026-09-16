import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_ACTIVE_LESSONS, recordLessons } from "@/lib/blog/agents/lessons";
import { ensureUniqueSlug } from "@/lib/blog/agents/orchestrator";
import { getStore } from "@/lib/blog/store";
import { checkPassword } from "@/lib/blog/studio-auth";

/**
 * حافظه، قفل، و سیاست‌هایی که بین دو آداپتور مشترک‌اند.
 *
 * این فایل هیچ مدلی صدا نمی‌زند. تنها چیزی که تست می‌کند، قواعدی است که اگر
 * بشکنند هیچ خطایی بالا نمی‌آید: اسلاگ تکراری، حافظه‌ای که هرس نمی‌شود، و قفلی
 * که فکر می‌کنیم هست.
 *
 * متغیرهای Supabase عمداً پاک می‌شوند تا تست هیچ‌وقت به دیتابیس واقعی وصل نشود —
 * getStore() بر اساس همین‌ها تصمیم می‌گیرد.
 */
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function draft(slug: string) {
  return {
    runId: null,
    title: "A title",
    slug,
    excerpt: "An excerpt",
    contentMd: "# A title\n\nBody.",
    metaTitle: "A title",
    metaDescription: "A description",
    keywords: ["a"],
    faq: [],
    score: 80,
    status: "draft" as const,
  };
}

test("without Supabase credentials the pipeline still has a store", () => {
  assert.equal(getStore().kind, "memory");
});

test("a run records its steps and can be read back", async () => {
  const store = getStore();
  const run = await store.createRun("pricing");

  assert.equal(run.status, "running");
  assert.deepEqual(run.steps, []);

  await store.updateRun(run.id, {
    steps: [
      {
        agent: "writer",
        label: "Writing",
        status: "done",
        startedAt: new Date().toISOString(),
      },
    ],
  });

  const reloaded = await store.getRun(run.id);
  assert.equal(reloaded?.steps.length, 1);
  assert.equal(reloaded?.topicHint, "pricing");
});

test("a stored record cannot be mutated through the object handed back", async () => {
  const store = getStore();
  const run = await store.createRun(null);

  run.steps.push({
    agent: "writer",
    label: "not real",
    status: "done",
    startedAt: new Date().toISOString(),
  });

  const reloaded = await store.getRun(run.id);
  assert.equal(reloaded?.steps.length, 0, "the store keeps its own copy");
});

test("a colliding slug gets a suffix rather than overwriting a post", async () => {
  const store = getStore();
  await store.createPost(draft("cash-flow-vs-profit"));

  assert.equal(await ensureUniqueSlug(store, "a-free-slug"), "a-free-slug");
  assert.equal(
    await ensureUniqueSlug(store, "cash-flow-vs-profit"),
    "cash-flow-vs-profit-2",
  );
});

test("a draft is invisible to the published listing", async () => {
  const store = getStore();
  const post = await store.createPost(draft("still-a-draft"));

  const published = await store.listPosts({ status: "published" });
  assert.ok(!published.some((item) => item.id === post.id));

  await store.updatePost(post.id, {
    status: "published",
    publishedAt: new Date().toISOString(),
  });

  const after = await store.listPosts({ status: "published" });
  assert.ok(after.some((item) => item.id === post.id));
});

test("deleting a post takes its feedback with it and frees its slug", async () => {
  const store = getStore();
  const run = await store.createRun("a topic");
  const post = await store.createPost({ ...draft("about-to-go"), runId: run.id });
  await store.updateRun(run.id, { postId: post.id });
  await store.addFeedback({ postId: post.id, rating: "down", comment: "Too vague." });

  await store.deletePost(post.id);

  assert.equal(await store.getPost(post.id), null);
  assert.equal(await store.getPostBySlug("about-to-go"), null);
  // بازخوردِ یتیم فقط زباله نیست: منتقد دوباره می‌خواندش و از مقاله‌ای که دیگر
  // وجود ندارد درس می‌سازد. در Supabase این کار را CASCADE می‌کند.
  assert.deepEqual(await store.listFeedback(post.id), []);
  // اجرا می‌ماند، ارجاعش نه — تاریخچه‌ی خط تولید با مقاله پاک نمی‌شود.
  assert.equal((await store.getRun(run.id))?.postId, null);
  // و اسلاگ دوباره آزاد است، پس همان موضوع را می‌شود از نو نوشت.
  assert.equal(await ensureUniqueSlug(store, "about-to-go"), "about-to-go");
});

test("the lesson cap retires the oldest, and retiring is not deleting", async () => {
  const store = getStore();
  const total = MAX_ACTIVE_LESSONS + 3;

  for (let index = 0; index < total; index++) {
    await recordLessons(
      [{ agent: "seo", lesson: `Lesson number ${index} about metadata.` }],
      "critic",
    );
  }

  const active = await store.listLessons({ agent: "seo", activeOnly: true });
  assert.equal(active.length, MAX_ACTIVE_LESSONS);

  const all = await store.listLessons({ agent: "seo" });
  assert.equal(all.length, total, "retired lessons stay visible in the studio");

  // تازه‌ترین‌ها باید بمانند — حافظه باید آخرین تصحیح‌ها را نگه دارد، نه اولین‌ها.
  assert.ok(active[0].lesson.includes(`number ${total - 1}`));
});

test("the studio lock rejects a wrong password and is open when none is set", () => {
  delete process.env.STUDIO_PASSWORD;
  assert.equal(checkPassword("anything"), null, "no password set means no token");

  process.env.STUDIO_PASSWORD = "correct horse";
  assert.equal(checkPassword("wrong"), null);

  const token = checkPassword("correct horse");
  assert.ok(token);
  assert.ok(!token.includes("correct"), "the cookie carries a hash, not the password");

  delete process.env.STUDIO_PASSWORD;
});
