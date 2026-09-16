import { after } from "next/server";
import { learnFromHumanFeedback } from "@/lib/blog/agents/human-feedback";
import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";

/**
 * بازخورد انسانی روی یک مقاله — ورودی دوم حلقه‌ی یادگیری.
 *
 * دو کار جدا انجام می‌شود و ترتیبشان مهم است:
 *   ۱. بازخورد ذخیره می‌شود (سریع، قطعی).
 *   ۲. منتقد از آن درس می‌سازد (کند، وابسته به مدل، ممکن است شکست بخورد).
 *
 * قدم دوم داخل `after()` است و شکستش هم بلعیده می‌شود. چرا؟ چون بازخورد داده‌ی
 * انسان است و نباید به‌خاطر خطای یک مدل از دست برود — همان قاعده‌ای که در فرم
 * مشاوره‌ی سایت هم رعایت شده: اول ذخیره، بعد اطلاع‌رسانی.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  let body: { postId?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }

  const postId = typeof body.postId === "string" ? body.postId : "";
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;

  if (!postId || !rating) {
    return Response.json(
      { error: 'A postId and a rating of "up" or "down" are required.' },
      { status: 400 },
    );
  }

  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 1000)
      : null;

  const post = await getStore().getPost(postId);
  if (!post) return Response.json({ error: "Unknown post." }, { status: 404 });

  const feedback = await getStore().addFeedback({ postId, rating, comment });

  after(async () => {
    try {
      await learnFromHumanFeedback({ postId, rating, comment });
    } catch (error) {
      console.error(
        "[blog] could not turn feedback into a lesson:",
        error instanceof Error ? error.message : error,
      );
    }
  });

  return Response.json({ feedback });
}
