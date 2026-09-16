import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { blog, company, consultation } from "@/lib/content";
import { getStore } from "@/lib/blog/store";

/**
 * فهرست مقالات منتشرشده.
 *
 * فقط پست‌های published را می‌خواند. پیش‌نویس‌ها در استودیو منتظر تأیید انسان
 * می‌مانند و هیچ مسیری از اینجا به آن‌ها نیست — نه با اسلاگ، نه با شناسه.
 *
 * چرا force-dynamic؟ چون انتشار یک مقاله از استودیو اتفاق می‌افتد، نه از یک
 * deploy جدید. صفحه‌ای که در زمان build ساخته شود، مقاله‌ای را که ده دقیقه پیش
 * تأیید شده نشان نمی‌دهد. (مسیرهای انتشار revalidatePath هم صدا می‌زنند، این
 * کمربند دومِ همان تصمیم است.)
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: blog.title,
  description: blog.intro,
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: `${blog.title} | ${company.name}`,
    description: blog.intro,
    url: `${company.url}/blog`,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogIndexPage() {
  const posts = await getStore().listPosts({ status: "published", limit: 50 });

  return (
    <main id="main">
      <section className="border-b border-sand bg-bone">
        <div className="mx-auto max-w-4xl px-5 py-16 md:px-8 md:py-24">
          <p className="text-eyebrow uppercase text-slate">{blog.eyebrow}</p>
          <h1 className="mt-3 text-h1 text-ink">{blog.title}</h1>
          <p className="mt-5 max-w-2xl text-slate">{blog.intro}</p>
        </div>
      </section>

      <section className="bg-bone">
        <div className="mx-auto max-w-4xl px-5 py-14 md:px-8 md:py-20">
          {posts.length === 0 ? (
            <p className="text-slate">{blog.empty}</p>
          ) : (
            <ul className="grid gap-6">
              {posts.map((post) => (
                <li key={post.id}>
                  <article className="rounded-card border border-sand bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-raised md:p-8">
                    <h2 className="text-h3 text-ink">
                      {/* کل کارت قابل کلیک نیست: لینک روی عنوان می‌ماند تا متنِ
                          لینک همان عنوان مقاله باشد و برای screen reader معنا بدهد. */}
                      <Link
                        href={`/blog/${post.slug}`}
                        className="transition-colors duration-200 hover:text-pine"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <p className="mt-3 text-slate">{post.excerpt}</p>
                    <p className="mt-4 text-caption tabular text-slate">
                      {formatDate(post.publishedAt ?? post.createdAt)}
                    </p>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="on-pine bg-pine">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8">
          <h2 className="text-h2 text-bone">{blog.ctaHeading}</h2>
          <p className="mx-auto mt-4 max-w-xl text-bone/80">{blog.ctaBody}</p>
          <div className="mt-8">
            {/* روی Pine، دکمه‌ی اصلی معکوس می‌شود: زمینه‌ی Bone و متن Pine. */}
            <ButtonLink
              href="/#contact"
              className="bg-bone text-pine hover:bg-white"
            >
              {consultation.submitLabel}
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
