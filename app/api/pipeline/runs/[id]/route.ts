import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";

/**
 * وضعیت زنده‌ی یک اجرا — چیزی که استودیو هر دو ثانیه می‌پرسد.
 *
 * چرا polling و نه SSE؟ چون اینجا جریان توکن نداریم؛ یک رکورد داریم که چند بار
 * در دقیقه عوض می‌شود. polling ساده‌تر است، با serverless بهتر می‌سازد، و از
 * قطع شدن اتصال جان سالم به در می‌برد — استودیو صفحه را ببندد و دوباره باز کند،
 * همان اجرا را می‌بیند. جریانی که وضعیتش در دیتابیس نیست، این خاصیت را ندارد.
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
  const run = await getStore().getRun(id);

  if (!run) return Response.json({ error: "Unknown run." }, { status: 404 });

  const post = run.postId ? await getStore().getPost(run.postId) : null;
  return Response.json({ run, post });
}
