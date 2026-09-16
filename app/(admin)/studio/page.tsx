import type { Metadata } from "next";
import { StudioLogin } from "@/components/studio/StudioLogin";
import { StudioPanel } from "@/components/studio/StudioPanel";
import { getStore } from "@/lib/blog/store";
import { isStudioUnlocked } from "@/lib/blog/studio-auth";
import { studio } from "@/lib/content";

/**
 * استودیو — اتاق کنترل پایپ‌لاین.
 *
 * چرا داخل route group ادمین و نه سایت؟ چون این صفحه بخشی از فروشِ آرکان نیست:
 * هدر و فوترِ بازاریابی و داده‌ی ساخت‌یافته‌ی شرکت اینجا بی‌معنا هستند، و لایوت
 * ادمین از قبل noindex است — که برای پنلی که دکمه‌ی «منتشر کن» دارد لازم است.
 *
 * تصمیم دسترسی در سرور گرفته می‌شود و نه در کلاینت: اگر قفل باشد، کامپوننتِ پنل
 * اصلاً رندر نمی‌شود. پنهان کردن UI در مرورگر، محافظت نیست.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: studio.title,
  robots: { index: false, follow: false },
};

export default async function StudioPage() {
  if (!(await isStudioUnlocked())) return <StudioLogin />;

  const store = getStore();
  // داده‌ی اولیه در سرور خوانده می‌شود تا پنل بدون یک دور «Loading…» باز شود.
  const [posts, lessons] = await Promise.all([
    store.listPosts({ limit: 100 }),
    store.listLessons(),
  ]);

  return (
    <StudioPanel
      storeKind={store.kind}
      posts={posts.map((post) => {
        const { contentMd, ...summary } = post;
        void contentMd;
        return summary;
      })}
      lessons={lessons}
    />
  );
}
