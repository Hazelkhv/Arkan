import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { blog, company, consultation } from "@/lib/content";
import { renderMarkdown } from "@/lib/blog/markdown";
import { getStore } from "@/lib/blog/store";
import type { PostRecord } from "@/lib/blog/store/types";

/**
 * یک مقاله.
 *
 * سه چیز از خروجی ایجنت سئو مستقیم به این صفحه می‌آید و هیچ‌کدام دوباره نوشته
 * نمی‌شوند: متادیتای صفحه، داده‌ی ساخت‌یافته‌ی Article، و FAQPage.
 *
 * درباره‌ی FAQPage یک نکته‌ی اخلاقی/سئویی هست که در پرامپت ایجنت هم آمده:
 * پاسخ‌ها باید از خود مقاله بیایند. داده‌ی ساخت‌یافته‌ای که چیزی بگوید که در صفحه
 * نیست، به موتور جستجو دروغ گفته است — و جریمه‌اش حذف کل صفحه از نتایج غنی است.
 */

export const dynamic = "force-dynamic";

async function loadPost(slug: string): Promise<PostRecord | null> {
  const post = await getStore().getPostBySlug(slug);
  // پیش‌نویس، صفحه‌ی عمومی ندارد — حتی اگر کسی اسلاگش را بداند.
  return post && post.status === "published" ? post : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Article not found" };

  const url = `${company.url}/blog/${post.slug}`;

  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      url,
      publishedTime: post.publishedAt ?? post.createdAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  const html = renderMarkdown(post.contentMd);
  const published = post.publishedAt ?? post.createdAt;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription || post.excerpt,
    datePublished: published,
    dateModified: published,
    author: { "@type": "Organization", name: company.fullName, url: company.url },
    publisher: { "@type": "Organization", name: company.fullName, url: company.url },
    mainEntityOfPage: `${company.url}/blog/${post.slug}`,
  };

  const faqSchema =
    post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <main id="main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <article>
        <header className="border-b border-sand bg-bone">
          <div className="mx-auto max-w-3xl px-5 py-14 md:px-8 md:py-20">
            <Link
              href="/blog"
              className="text-caption text-slate underline underline-offset-4 transition-colors duration-200 hover:text-pine"
            >
              ← {blog.backToIndex}
            </Link>
            <h1 className="mt-6 text-h1 text-ink">{post.title}</h1>
            <p className="mt-5 text-slate">{post.excerpt}</p>
            <p className="mt-6 text-caption tabular text-slate">
              <time dateTime={published}>
                {new Date(published).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </p>
          </div>
        </header>

        <div className="bg-bone">
          <div className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
            {/* HTML خام در renderMarkdown دور ریخته می‌شود؛ اینجا فقط مارک‌داونِ
                تبدیل‌شده می‌نشیند. */}
            <div
              className="article"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {post.faq.length > 0 && (
              <section className="mt-14 border-t border-sand pt-10">
                <h2 className="text-h3 text-ink">{blog.faqHeading}</h2>
                <dl className="mt-6 grid gap-6">
                  {post.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="font-semibold text-ink">{item.question}</dt>
                      <dd className="mt-2 text-slate">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>

        <section className="on-pine bg-pine">
          <div className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8">
            <h2 className="text-h2 text-bone">{blog.ctaHeading}</h2>
            <p className="mx-auto mt-4 max-w-xl text-bone/80">{blog.ctaBody}</p>
            <div className="mt-8">
              <ButtonLink href="/#contact" className="bg-bone text-pine hover:bg-white">
                {consultation.submitLabel}
              </ButtonLink>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
