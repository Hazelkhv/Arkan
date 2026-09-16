import { runCritic } from "@/lib/blog/agents/critic";
import { recordLessons } from "@/lib/blog/agents/lessons";
import { getStore } from "@/lib/blog/store";
import type { FeedbackRating, LessonRecord } from "@/lib/blog/store/types";

/**
 * بازخورد انسانی → درس.
 *
 * این دومین ورودی حلقه‌ی یادگیری است و مهم‌تر از اولی. منتقد فقط می‌تواند بگوید
 * فرایند نسبت به معیارهای خودش چطور بود؛ انسان می‌تواند بگوید نتیجه در دنیای
 * واقعی خوب بود یا نه. به همین دلیل در پرامپت منتقد صریح نوشته شده که بازخورد
 * انسانی بر بقیه‌ی گزارش می‌چربد.
 *
 * چرا همان ایجنت منتقد؟ چون کارِ «ترجمه‌ی یک قضاوت به یک دستورالعملِ قابل‌اجرا
 * برای یک ایجنت مشخص» دقیقاً همان شغل است. ایجنت دوم فقط دو نسخه‌ی واگرا از یک
 * مهارت می‌ساخت.
 *
 * source برابر "human" ثبت می‌شود تا در استودیو معلوم باشد این درس از کجا آمده —
 * و اگر روزی درس‌ها را هرس کردیم، بدانیم کدام‌ها را انسان پشتیبانی کرده است.
 */
export async function learnFromHumanFeedback(input: {
  postId: string;
  rating: FeedbackRating;
  comment: string | null;
}): Promise<LessonRecord[]> {
  const store = getStore();
  const post = await store.getPost(input.postId);
  if (!post) return [];

  const critique = await runCritic({
    briefTitle: post.title,
    editorReports: [],
    revisionRounds: 0,
    seoFailures: [],
    finalArticle: post.contentMd,
    published: post.status === "published",
    humanFeedback: { rating: input.rating, comment: input.comment },
  });

  return recordLessons(critique.lessons, "human");
}
