import { randomUUID } from "node:crypto";
import type { AgentName } from "@/lib/blog/agents/types";
import type {
  BlogStore,
  FeedbackRecord,
  LessonRecord,
  NewPost,
  PostRecord,
  PostStatus,
  RunRecord,
} from "@/lib/blog/store/types";

/**
 * پیاده‌سازی درون‌حافظه‌ای — حالت «بدون دیتابیس».
 *
 * با ری‌استارت پاک می‌شود و برای یادگیری کافی است: کل پایپ‌لاین، حلقه‌ی بازبینی،
 * استودیو و بلاگ بدون Supabase کار می‌کنند.
 *
 * چرا داده روی globalThis نگه داشته می‌شود؟ چون `next dev` ماژول‌ها را با هر
 * تغییر فایل دوباره بارگذاری می‌کند. اگر Map ساده در سطح ماژول بود، هر بار ذخیره
 * کردن یک فایل، همه‌ی اجراها و پست‌ها را پاک می‌کرد و به‌نظر می‌رسید باگ داریم.
 *
 * چرا روی Vercel کافی نیست؟ چون هر درخواست ممکن است روی یک instance دیگر بیفتد؛
 * حافظه بین اجراهای serverless مشترک نیست. برای استقرار، Supabase اجباری است.
 */

type MemoryDb = {
  runs: Map<string, RunRecord>;
  posts: Map<string, PostRecord>;
  lessons: Map<string, LessonRecord>;
  feedback: Map<string, FeedbackRecord>;
};

const globalRef = globalThis as typeof globalThis & {
  __arkanBlogMemory?: MemoryDb;
};

function db(): MemoryDb {
  if (!globalRef.__arkanBlogMemory) {
    globalRef.__arkanBlogMemory = {
      runs: new Map(),
      posts: new Map(),
      lessons: new Map(),
      feedback: new Map(),
    };
  }
  return globalRef.__arkanBlogMemory;
}

/** کپی، نه ارجاع — تا هیچ فراخوانی‌ای نتواند سهواً رکورد ذخیره‌شده را تغییر دهد. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * مرتب‌سازی از تازه به قدیم.
 *
 * `reverse()` قبل از `sort()` اتفاقی نیست. چند رکورد که در یک حلقه ساخته می‌شوند
 * می‌توانند دقیقاً یک createdAt داشته باشند (دقت Date در میلی‌ثانیه است)، و
 * مرتب‌سازی پایدارِ جاوااسکریپت در این حالت ترتیبِ ورودی را نگه می‌دارد — یعنی
 * ترتیبِ درج، که قدیمی‌ترین را اول می‌آورد. نتیجه‌اش این بود که هرسِ درس‌ها
 * تازه‌ترین درس‌ها را بازنشسته می‌کرد، نه قدیمی‌ترین‌ها را. Map ترتیب درج را حفظ
 * می‌کند، پس معکوس کردنش دقیقاً همان tiebreak درستی است که لازم داریم.
 */
function newest<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const memoryStore: BlogStore = {
  kind: "memory",

  async createRun(topicHint) {
    const run: RunRecord = {
      id: randomUUID(),
      status: "running",
      topicHint,
      steps: [],
      postId: null,
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    db().runs.set(run.id, run);
    return clone(run);
  },

  async updateRun(id, patch) {
    const current = db().runs.get(id);
    if (!current) throw new Error(`Run ${id} not found`);
    const next: RunRecord = { ...current, ...clone(patch) };
    db().runs.set(id, next);
    return clone(next);
  },

  async getRun(id) {
    const run = db().runs.get(id);
    return run ? clone(run) : null;
  },

  async listRuns(limit = 20) {
    return newest([...db().runs.values()]).slice(0, limit).map(clone);
  },

  async createPost(post: NewPost) {
    const record: PostRecord = {
      ...clone(post),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      publishedAt: post.publishedAt ?? null,
    };
    db().posts.set(record.id, record);
    return clone(record);
  },

  async updatePost(id, patch) {
    const current = db().posts.get(id);
    if (!current) return null;
    const next: PostRecord = { ...current, ...patch };
    db().posts.set(id, next);
    return clone(next);
  },

  async getPost(id) {
    const post = db().posts.get(id);
    return post ? clone(post) : null;
  },

  async getPostBySlug(slug) {
    for (const post of db().posts.values()) {
      if (post.slug === slug) return clone(post);
    }
    return null;
  },

  async listPosts(options = {}) {
    const rows = [...db().posts.values()].filter(
      (post) => !options.status || post.status === (options.status as PostStatus),
    );
    return newest(rows).slice(0, options.limit ?? 100).map(clone);
  },

  async listLessons(options = {}) {
    const rows = [...db().lessons.values()].filter((lesson) => {
      if (options.agent && lesson.agent !== (options.agent as AgentName)) return false;
      if (options.activeOnly && !lesson.active) return false;
      return true;
    });
    return newest(rows).map(clone);
  },

  async addLesson(input) {
    const record: LessonRecord = {
      id: randomUUID(),
      agent: input.agent,
      lesson: input.lesson,
      source: input.source,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db().lessons.set(record.id, record);
    return clone(record);
  },

  async setLessonActive(id, active) {
    const current = db().lessons.get(id);
    if (current) db().lessons.set(id, { ...current, active });
  },

  async deleteLesson(id) {
    db().lessons.delete(id);
  },

  async addFeedback(input) {
    const record: FeedbackRecord = {
      id: randomUUID(),
      postId: input.postId,
      rating: input.rating,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    };
    db().feedback.set(record.id, record);
    return clone(record);
  },

  async listFeedback(postId) {
    const rows = [...db().feedback.values()].filter(
      (row) => !postId || row.postId === postId,
    );
    return newest(rows).map(clone);
  },
};
