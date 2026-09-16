import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";

/**
 * تأیید یا پس‌گرفتن انتشار — نقطه‌ی human-in-the-loop.
 *
 * هر مقاله‌ای که دروازه‌ی کیفیت را رد نکرده، به‌شکل draft منتظر می‌ماند و تنها از
 * همین‌جا منتشر می‌شود. سیستم خودبهبود، حق تصمیم آخر را ندارد.
 *
 * revalidatePath بعد از تغییر وضعیت لازم است، وگرنه صفحه‌ی /blog همچنان نسخه‌ی
 * کش‌شده‌ی قبلی را نشان می‌دهد و به‌نظر می‌رسد دکمه کار نکرده است.
 *
 * «/» هم در فهرست هست: بخش Insight در صفحه‌ی اصلی سه مقاله‌ی آخر را
 * نشان می‌دهد و برخلاف /blog استاتیک می‌ماند — تنها راه تازه‌شدنش همین خط است.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  const { id } = await params;
  const post = await getStore().getPost(id);
  if (!post) return Response.json({ error: "Unknown post." }, { status: 404 });
  return Response.json({ post });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  const { id } = await params;

  let status: unknown;
  try {
    ({ status } = (await request.json()) as { status?: unknown });
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }

  if (status !== "draft" && status !== "published") {
    return Response.json(
      { error: 'status must be "draft" or "published".' },
      { status: 400 },
    );
  }

  const existing = await getStore().getPost(id);
  if (!existing) return Response.json({ error: "Unknown post." }, { status: 404 });

  const post = await getStore().updatePost(id, {
    status,
    // تاریخ انتشار فقط بار اول ثبت می‌شود؛ انتشار دوباره، مقاله را «تازه» نمی‌کند.
    publishedAt:
      status === "published"
        ? (existing.publishedAt ?? new Date().toISOString())
        : existing.publishedAt,
  });

  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath(`/blog/${existing.slug}`);

  return Response.json({ post });
}
