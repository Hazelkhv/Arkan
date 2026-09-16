import type { AgentName } from "@/lib/blog/agents/types";

/**
 * قرارداد لایه‌ی ذخیره‌سازی — الگوی Adapter.
 *
 * چرا interface و نه صدا زدن مستقیم Supabase؟ دو دلیل:
 *
 *  ۱. سیستم باید بدون هیچ دیتابیسی هم کامل کار کند. دانشجو کلید OpenRouter را
 *     می‌گذارد و پایپ‌لاین را می‌بیند؛ راه‌اندازی Supabase نباید پیش‌نیاز درس باشد.
 *  ۲. ارکستریتور و ایجنت‌ها نباید بدانند داده کجا می‌رود. همین یک مرز باعث می‌شود
 *     تعویض Supabase با هر چیز دیگری، یک فایل جدید باشد نه بازنویسی پایپ‌لاین.
 *
 * نکته‌ی مهم: آداپتورها عمداً «احمق» هستند — فقط CRUD. هر قاعده‌ای که سیاست است
 * (مثل سقف ۸ درس فعال برای هر ایجنت) در lib/blog/agents/lessons.ts نوشته شده تا
 * بین دو پیاده‌سازی تکرار نشود و از هم واگرا نشود.
 */

export type RunStatus = "running" | "done" | "error";
export type PostStatus = "draft" | "published";
export type StepStatus = "running" | "done" | "error";

/** یک گام از خط تولید. استودیو دقیقاً همین را رندر می‌کند. */
export type PipelineStep = {
  agent: string;
  label: string;
  status: StepStatus;
  startedAt: string;
  finishedAt?: string;
  /** یک جمله برای انسان. جزئیات کامل در detail. */
  summary?: string;
  detail?: unknown;
  error?: string;
  model?: string;
  ms?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type RunRecord = {
  id: string;
  status: RunStatus;
  topicHint: string | null;
  steps: PipelineStep[];
  postId: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type PostFaqItem = { question: string; answer: string };

export type PostRecord = {
  id: string;
  runId: string | null;
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  faq: PostFaqItem[];
  score: number;
  status: PostStatus;
  createdAt: string;
  publishedAt: string | null;
};

export type LessonSource = "critic" | "human";

export type LessonRecord = {
  id: string;
  agent: AgentName;
  lesson: string;
  source: LessonSource;
  active: boolean;
  createdAt: string;
};

export type FeedbackRating = "up" | "down";

export type FeedbackRecord = {
  id: string;
  postId: string;
  rating: FeedbackRating;
  comment: string | null;
  createdAt: string;
};

export type NewPost = Omit<PostRecord, "id" | "createdAt" | "publishedAt"> & {
  publishedAt?: string | null;
};

export interface BlogStore {
  /** استودیو این را نشان می‌دهد تا معلوم باشد داده ماندگار است یا نه. */
  readonly kind: "memory" | "supabase";

  createRun(topicHint: string | null): Promise<RunRecord>;
  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "steps" | "postId" | "error" | "finishedAt">>,
  ): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  listRuns(limit?: number): Promise<RunRecord[]>;

  createPost(post: NewPost): Promise<PostRecord>;
  updatePost(
    id: string,
    patch: Partial<Pick<PostRecord, "status" | "publishedAt">>,
  ): Promise<PostRecord | null>;
  getPost(id: string): Promise<PostRecord | null>;
  getPostBySlug(slug: string): Promise<PostRecord | null>;
  listPosts(options?: { status?: PostStatus; limit?: number }): Promise<PostRecord[]>;
  /**
   * حذف کامل یک مقاله.
   *
   * در Supabase، بازخوردهای همان مقاله با ON DELETE CASCADE پاک می‌شوند و
   * blog_runs.post_id به NULL می‌رود — یعنی تاریخچه‌ی اجرا می‌ماند، فقط مقاله
   * نمی‌ماند. آداپتور حافظه باید همین رفتار را دستی تقلید کند وگرنه دو
   * پیاده‌سازی واگرا می‌شوند.
   */
  deletePost(id: string): Promise<void>;

  listLessons(options?: {
    agent?: AgentName;
    activeOnly?: boolean;
  }): Promise<LessonRecord[]>;
  addLesson(input: {
    agent: AgentName;
    lesson: string;
    source: LessonSource;
  }): Promise<LessonRecord>;
  setLessonActive(id: string, active: boolean): Promise<void>;
  deleteLesson(id: string): Promise<void>;

  addFeedback(input: {
    postId: string;
    rating: FeedbackRating;
    comment: string | null;
  }): Promise<FeedbackRecord>;
  listFeedback(postId?: string): Promise<FeedbackRecord[]>;
}
