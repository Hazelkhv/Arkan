import { runPipeline } from "@/lib/blog/agents/orchestrator";
import { getStore } from "@/lib/blog/store";

/**
 * اجرای هفتگی — مقاله‌ی جدید، بدون اینکه کسی دکمه‌ای بزند.
 *
 * برخلاف /api/pipeline/run اینجا منتظر می‌مانیم تا اجرا تمام شود. کرون مرورگر
 * نیست؛ کسی پشت خط منتظر پاسخ نمانده، و نتیجه‌ی کامل در پاسخ، همان چیزی است که
 * در لاگ Vercel می‌ماند و روز بعد سؤال «چرا این هفته مقاله‌ای نیامد؟» را جواب
 * می‌دهد.
 *
 * محافظت: Vercel هدر `Authorization: Bearer $CRON_SECRET` را می‌فرستد. بدون این
 * چک، آدرس برای هر کسی که حدسش بزند یک دکمه‌ی «توکن خرج کن» است.
 *
 * اگر CRON_SECRET ست نشده باشد، مسیر بسته می‌ماند — «ناامن ولی راحت» انتخاب
 * درستی برای endpointای که پول خرج می‌کند نیست.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set, so the weekly run is disabled." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  if (getStore().kind === "memory") {
    // روی serverless، حافظه بین اجراها مشترک نیست: نتیجه جایی ذخیره نمی‌شود و
    // هیچ‌کس هیچ‌وقت آن مقاله را نمی‌بیند. بهتر است صریح شکست بخورد.
    return Response.json(
      { error: "The weekly run needs Supabase. In-memory storage does not survive." },
      { status: 503 },
    );
  }

  const { run, post } = await runPipeline({ topicHint: null });

  return Response.json({
    status: run.status,
    runId: run.id,
    error: run.error,
    post: post ? { id: post.id, slug: post.slug, status: post.status, score: post.score } : null,
  });
}
