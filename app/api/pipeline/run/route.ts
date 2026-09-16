import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runPipeline } from "@/lib/blog/agents/orchestrator";
import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";

/**
 * شروع یک اجرای پایپ‌لاین.
 *
 * نکته‌ی اصلی این فایل: پاسخ فوراً برمی‌گردد، ولی کار ادامه دارد.
 *
 * یک اجرای کامل دو تا پنج دقیقه طول می‌کشد. اگر منتظرش بمانیم، مرورگر یا پراکسی
 * قبل از تمام شدنش قطع می‌کند و کاربر هیچ‌وقت نمی‌فهمد چه شد. راه‌حل Next:
 * `after()` — تابعی که بعد از بسته شدن پاسخ اجرا می‌شود و تا سقف maxDuration
 * زنده می‌ماند.
 *
 * به همین دلیل است که ارکستریتور هر گام را بلافاصله در store می‌نویسد: تنها
 * پنجره‌ی استودیو به این کارِ در حال انجام، همان رکورد اجراست.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** سقف پنج دقیقه. روی پلن رایگان Vercel کمتر است و اجرا نیمه‌کاره ثبت می‌ماند. */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set, so no agent can run." },
      { status: 503 },
    );
  }

  let topicHint: string | null = null;
  try {
    const body = (await request.json()) as { topicHint?: unknown };
    if (typeof body.topicHint === "string" && body.topicHint.trim()) {
      topicHint = body.topicHint.trim().slice(0, 200);
    }
  } catch {
    // بدنه‌ی خالی هم قابل قبول است: اجرا بدون راهنمای موضوع.
  }

  // رکورد اجرا قبل از پاسخ ساخته می‌شود تا استودیو بلافاصله چیزی برای polling داشته باشد.
  const run = await getStore().createRun(topicHint);

  after(async () => {
    const { post } = await runPipeline({ runId: run.id });
    // همان دلیل کرون هفتگی: مقاله‌ی خودکارمنتشرشده از مسیر /api/posts رد
    // نمی‌شود، پس کش صفحه‌ی اصلی و /blog را باید اینجا تازه کرد.
    if (post?.status === "published") {
      revalidatePath("/");
      revalidatePath("/blog");
    }
  });

  return Response.json({ runId: run.id }, { status: 202 });
}
