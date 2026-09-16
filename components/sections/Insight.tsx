import Link from "next/link";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { blog } from "@/lib/content";
import { getStore } from "@/lib/blog/store";

/**
 * The three most recent articles, previewed on the home page.
 *
 * It sits immediately before the consultation form, which is the one place a
 * visitor who is not ready to enquire can be given something to do instead of
 * leaving. Three is the limit on purpose: this is a signpost to /blog, not a
 * second index competing with the form underneath it.
 *
 * With nothing published the section renders nothing at all. The index page
 * shows `blog.empty` because a visitor asked for the blog; a visitor on the
 * home page did not, and an empty band between Credibility and the form is
 * worse than no band.
 *
 * Unlike /blog this route is not `force-dynamic`. The Supabase read sets no
 * cache option and nothing here reads request-time APIs, so it happens once at
 * build and the home page stays a static document — which matters more here
 * than anywhere else on the site. Publishing calls `revalidatePath("/")`, so a
 * newly approved article still lands within a request.
 */
export async function Insight() {
  const posts = await getStore().listPosts({ status: "published", limit: 3 });

  if (posts.length === 0) return null;

  return (
    <section id="insight" className="border-b border-sand">
      <div className="mx-auto max-w-[75rem] px-5 py-20 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow={blog.eyebrow}
            heading={blog.homeHeading}
            intro={blog.homeIntro}
            data-reveal
          />

          <Link
            data-reveal
            href="/blog"
            className="text-body font-medium text-pine underline underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {blog.backToIndex}
          </Link>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id} data-reveal>
              <article className="h-full rounded-card border border-sand bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-raised">
                <h3 className="text-h3 text-ink">
                  {/* The link stays on the title rather than wrapping the card,
                      so its accessible name is the article's name. */}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="transition-colors duration-200 hover:text-pine"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-3 text-body text-slate">{post.excerpt}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
