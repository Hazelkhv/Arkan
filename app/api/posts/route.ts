import { getStore } from "@/lib/blog/store";
import { guardStudioRoute } from "@/lib/blog/studio-auth";
import type { PostStatus } from "@/lib/blog/store/types";

/** فهرست پست‌ها برای استودیو. بلاگ عمومی مستقیم از store می‌خواند، نه از اینجا. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const denied = await guardStudioRoute();
  if (denied) return denied;

  const status = new URL(request.url).searchParams.get("status");
  const posts = await getStore().listPosts({
    status:
      status === "draft" || status === "published" ? (status as PostStatus) : undefined,
    limit: 100,
  });

  // متن کامل مقاله در فهرست لازم نیست و پاسخ را ده‌ها کیلوبایت سنگین می‌کند.
  return Response.json({
    posts: posts.map((post) => {
      const { contentMd, ...summary } = post;
      void contentMd;
      return summary;
    }),
  });
}
