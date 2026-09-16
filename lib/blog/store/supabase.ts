import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminDb } from "@/lib/ai/admin-client";
import type {
  BlogStore,
  FeedbackRecord,
  LessonRecord,
  PipelineStep,
  PostFaqItem,
  PostRecord,
  RunRecord,
} from "@/lib/blog/store/types";
import type { AgentName } from "@/lib/blog/agents/types";

/**
 * پیاده‌سازی ماندگار روی Supabase.
 *
 * همان سرویس‌رول دستیار را قرض می‌گیرد (lib/ai/admin-client.ts): جدول‌های بلاگ هم
 * RLS دارند و هیچ policy ندارند، پس کلید عمومی به آن‌ها نمی‌رسد. انتشار محتوا
 * تصمیم انسانی است؛ چیزی که با یک کلید مرورگری قابل نوشتن باشد، عملاً بی‌صاحب است.
 *
 * تنها چیزی که این فایل انجام می‌دهد ترجمه‌ی سطر پایگاه‌داده (snake_case) به رکورد
 * برنامه (camelCase) و برعکس است. هیچ منطق دامنه‌ای اینجا نیست.
 */

const POSTS = "blog_posts";
const RUNS = "blog_runs";
const LESSONS = "blog_lessons";
const FEEDBACK = "blog_feedback";

type Row = Record<string, unknown>;

function db(): SupabaseClient {
  return requireAdminDb();
}

function fail(action: string, error: { message: string } | null): never {
  throw new Error(`Blog store: ${action} failed — ${error?.message ?? "unknown error"}`);
}

function toRun(row: Row): RunRecord {
  return {
    id: String(row.id),
    status: row.status as RunRecord["status"],
    topicHint: (row.topic_hint as string | null) ?? null,
    steps: (row.steps as PipelineStep[] | null) ?? [],
    postId: (row.post_id as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
    finishedAt: (row.finished_at as string | null) ?? null,
  };
}

function toPost(row: Row): PostRecord {
  return {
    id: String(row.id),
    runId: (row.run_id as string | null) ?? null,
    title: String(row.title),
    slug: String(row.slug),
    excerpt: String(row.excerpt ?? ""),
    contentMd: String(row.content_md ?? ""),
    metaTitle: String(row.meta_title ?? ""),
    metaDescription: String(row.meta_description ?? ""),
    keywords: (row.keywords as string[] | null) ?? [],
    faq: (row.faq as PostFaqItem[] | null) ?? [],
    score: Number(row.score ?? 0),
    status: row.status as PostRecord["status"],
    createdAt: String(row.created_at),
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

function toLesson(row: Row): LessonRecord {
  return {
    id: String(row.id),
    agent: row.agent as AgentName,
    lesson: String(row.lesson),
    source: row.source as LessonRecord["source"],
    active: Boolean(row.active),
    createdAt: String(row.created_at),
  };
}

function toFeedback(row: Row): FeedbackRecord {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    rating: row.rating as FeedbackRecord["rating"],
    comment: (row.comment as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export const supabaseStore: BlogStore = {
  kind: "supabase",

  async createRun(topicHint) {
    const { data, error } = await db()
      .from(RUNS)
      .insert({ status: "running", topic_hint: topicHint, steps: [] })
      .select()
      .single();
    if (error || !data) fail("creating a run", error);
    return toRun(data);
  },

  async updateRun(id, patch) {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.steps !== undefined) row.steps = patch.steps;
    if (patch.postId !== undefined) row.post_id = patch.postId;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;

    const { data, error } = await db().from(RUNS).update(row).eq("id", id).select().single();
    if (error || !data) fail("updating a run", error);
    return toRun(data);
  },

  async getRun(id) {
    const { data, error } = await db().from(RUNS).select().eq("id", id).maybeSingle();
    if (error) fail("reading a run", error);
    return data ? toRun(data) : null;
  },

  async listRuns(limit = 20) {
    const { data, error } = await db()
      .from(RUNS)
      .select()
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail("listing runs", error);
    return (data ?? []).map(toRun);
  },

  async createPost(post) {
    const { data, error } = await db()
      .from(POSTS)
      .insert({
        run_id: post.runId,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content_md: post.contentMd,
        meta_title: post.metaTitle,
        meta_description: post.metaDescription,
        keywords: post.keywords,
        faq: post.faq,
        score: post.score,
        status: post.status,
        published_at: post.publishedAt ?? null,
      })
      .select()
      .single();
    if (error || !data) fail("creating a post", error);
    return toPost(data);
  },

  async updatePost(id, patch) {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt;

    const { data, error } = await db()
      .from(POSTS)
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) fail("updating a post", error);
    return data ? toPost(data) : null;
  },

  async getPost(id) {
    const { data, error } = await db().from(POSTS).select().eq("id", id).maybeSingle();
    if (error) fail("reading a post", error);
    return data ? toPost(data) : null;
  },

  async getPostBySlug(slug) {
    const { data, error } = await db().from(POSTS).select().eq("slug", slug).maybeSingle();
    if (error) fail("reading a post by slug", error);
    return data ? toPost(data) : null;
  },

  async listPosts(options = {}) {
    let query = db().from(POSTS).select().order("created_at", { ascending: false });
    if (options.status) query = query.eq("status", options.status);
    const { data, error } = await query.limit(options.limit ?? 100);
    if (error) fail("listing posts", error);
    return (data ?? []).map(toPost);
  },

  async listLessons(options = {}) {
    let query = db().from(LESSONS).select().order("created_at", { ascending: false });
    if (options.agent) query = query.eq("agent", options.agent);
    if (options.activeOnly) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) fail("listing lessons", error);
    return (data ?? []).map(toLesson);
  },

  async addLesson(input) {
    const { data, error } = await db()
      .from(LESSONS)
      .insert({
        agent: input.agent,
        lesson: input.lesson,
        source: input.source,
        active: true,
      })
      .select()
      .single();
    if (error || !data) fail("adding a lesson", error);
    return toLesson(data);
  },

  async setLessonActive(id, active) {
    const { error } = await db().from(LESSONS).update({ active }).eq("id", id);
    if (error) fail("updating a lesson", error);
  },

  async deleteLesson(id) {
    const { error } = await db().from(LESSONS).delete().eq("id", id);
    if (error) fail("deleting a lesson", error);
  },

  async addFeedback(input) {
    const { data, error } = await db()
      .from(FEEDBACK)
      .insert({
        post_id: input.postId,
        rating: input.rating,
        comment: input.comment,
      })
      .select()
      .single();
    if (error || !data) fail("saving feedback", error);
    return toFeedback(data);
  },

  async listFeedback(postId) {
    let query = db().from(FEEDBACK).select().order("created_at", { ascending: false });
    if (postId) query = query.eq("post_id", postId);
    const { data, error } = await query;
    if (error) fail("listing feedback", error);
    return (data ?? []).map(toFeedback);
  },
};
