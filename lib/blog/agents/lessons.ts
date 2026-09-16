import { companyContext } from "@/lib/blog/company";
import type { AgentName, LessonDraft } from "@/lib/blog/agents/types";
import { getStore } from "@/lib/blog/store";
import type { LessonRecord, LessonSource } from "@/lib/blog/store/types";

/**
 * حافظه‌ی خودبهبودی.
 *
 * ایده در یک جمله: سیستم بدون fine-tuning و بدون تغییر کد یاد می‌گیرد، چون آنچه
 * یاد می‌گیرد در «داده» ذخیره می‌شود و قبل از هر اجرا به system prompt تزریق
 * می‌شود. حلقه بسته است: اجرا → نقد → درس → پرامپت اجرای بعدی.
 *
 * نظارت انسانی روی حافظه عمدی است. یک درس اشتباه (مثلاً «همیشه با آمار شروع کن»
 * وقتی آماری نداریم) اگر مهار نشود هر اجرای بعدی را خراب می‌کند، و چون در پرامپت
 * نشسته، جای باگ هم پیدا نیست. دو مهار داریم:
 *   ۱. سقف MAX_ACTIVE_LESSONS برای هر ایجنت؛ درس‌های قدیمی‌تر بازنشسته می‌شوند.
 *   ۲. حذف دستی از استودیو.
 */

/**
 * چرا ۸؟ عددی که تجربی انتخاب شده: آن‌قدر هست که چند تصحیح واقعی جا شود، و
 * آن‌قدر کم که پرامپت را رقیق نکند. بیست تا توصیه‌ی کلی، مدل را بی‌جهت‌تر
 * می‌کند نه بهتر.
 */
export const MAX_ACTIVE_LESSONS = 8;

/** درس‌های فعال یک ایجنت، از تازه به قدیم. */
export async function activeLessonsFor(agent: AgentName): Promise<LessonRecord[]> {
  const store = getStore();
  const lessons = await store.listLessons({ agent, activeOnly: true });
  return lessons.slice(0, MAX_ACTIVE_LESSONS);
}

/**
 * ثبت درس‌های تازه و بازنشستگی قدیمی‌ها.
 *
 * این سیاست عمداً اینجاست و نه داخل آداپتورها: اگر در memory و supabase جداگانه
 * نوشته می‌شد، دو نسخه‌ی کمی متفاوت از یک قاعده داشتیم و اختلافشان فقط در
 * production معلوم می‌شد.
 */
export async function recordLessons(
  drafts: LessonDraft[],
  source: LessonSource,
): Promise<LessonRecord[]> {
  const store = getStore();
  const created: LessonRecord[] = [];

  for (const draft of drafts) {
    created.push(
      await store.addLesson({
        agent: draft.agent,
        lesson: draft.lesson.trim(),
        source,
      }),
    );
  }

  // بازنشستگی: فقط برای ایجنت‌هایی که همین حالا درس گرفتند.
  for (const agent of new Set(drafts.map((draft) => draft.agent))) {
    const active = await store.listLessons({ agent, activeOnly: true });
    for (const stale of active.slice(MAX_ACTIVE_LESSONS)) {
      await store.setLessonActive(stale.id, false);
    }
  }

  return created;
}

/**
 * ساخت system prompt یک ایجنت: نقش + هویت مشترک شرکت + حافظه.
 *
 * ترتیب مهم است. نقش اول می‌آید چون تعیین می‌کند مدل خودش را چه می‌داند؛ زمینه‌ی
 * شرکت وسط؛ و درس‌ها آخر، چون آخرین چیزی که مدل می‌خواند بیشترین وزن را دارد و
 * درس‌ها دقیقاً همان تصحیح‌هایی هستند که نباید فراموش شوند.
 *
 * تابع خالص است تا بشود بدون دیتابیس تستش کرد.
 */
export function buildSystemPrompt(role: string, lessons: string[]): string {
  const sections = [role.trim(), companyContext()];

  if (lessons.length > 0) {
    sections.push(
      [
        "# What you learned from previous runs",
        "These corrections come from reviews of your own earlier work. Apply every one of them.",
        ...lessons.map((lesson, index) => `${index + 1}. ${lesson}`),
      ].join("\n"),
    );
  }

  return sections.join("\n\n---\n\n");
}

/** همان بالایی، ولی با خواندن حافظه از store. هر ایجنت این را صدا می‌زند. */
export async function systemPromptFor(
  agent: AgentName,
  role: string,
): Promise<string> {
  const lessons = await activeLessonsFor(agent);
  return buildSystemPrompt(
    role,
    lessons.map((lesson) => lesson.lesson),
  );
}
