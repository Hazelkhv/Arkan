import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";
import { AgentNameSchema } from "@/lib/blog/agents/types";

/**
 * مشاهده و حذف حافظه‌ی خودبهبودی.
 *
 * وجود مسیر DELETE، خودش بخشی از طراحی است. سیستمی که به خودش درس می‌دهد، به
 * خودش درس غلط هم می‌دهد — و درسِ غلط در system prompt می‌نشیند و هر اجرای بعدی
 * را بی‌سروصدا بدتر می‌کند. اگر انسان نتواند حافظه را ببیند و پاک کند، مکانیزمِ
 * بهبود به مکانیزمِ انحراف تبدیل می‌شود.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  const agentParam = new URL(request.url).searchParams.get("agent");
  const agent = AgentNameSchema.safeParse(agentParam);

  const lessons = await getStore().listLessons({
    agent: agent.success ? agent.data : undefined,
  });

  return Response.json({ lessons });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "An id is required." }, { status: 400 });

  await getStore().deleteLesson(id);
  return Response.json({ ok: true });
}
