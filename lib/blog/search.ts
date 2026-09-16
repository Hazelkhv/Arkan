/**
 * جستجوی وب برای پژوهشگر — الگوی «مدل تصمیم می‌گیرد، کد اجرا می‌کند».
 *
 * مدل نمی‌تواند به اینترنت وصل شود و نباید هم بتواند؛ کاری که از او می‌خواهیم
 * تصمیم است: «برای این بریف، چه چیزی را باید جستجو کرد؟» اجرای جستجو کار کد است.
 * همین مرز باعث می‌شود بشود نتیجه را لاگ گرفت، کش کرد، و جایگزین کرد.
 *
 * Tavily اختیاری است: بدون کلید، پژوهشگر با دانش خودش کار می‌کند و پایپ‌لاین
 * متوقف نمی‌شود — ولی هیچ «واقعیت» بی‌منبعی حق ندارد به‌عنوان آمار وارد مقاله شود.
 * آن قاعده در پرامپت نویسنده و در چک‌های ویراستار نشسته است.
 */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export function isWebSearchEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * یک کوئری را جستجو می‌کند. خطای شبکه اینجا بلعیده می‌شود: نبودِ نتیجه‌ی جستجو
 * دلیل کافی برای شکست کل اجرا نیست، و پژوهشگر می‌تواند با دست خالی هم ادامه دهد.
 */
async function searchOnce(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: limit,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`[blog] Tavily returned ${response.status} for "${query}"`);
      return [];
    }

    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (payload.results ?? []).map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      snippet: (result.content ?? "").slice(0, 600),
    }));
  } catch (error) {
    console.warn(
      `[blog] web search failed for "${query}":`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** چند کوئری به‌موازات، با حذف نتایج تکراری بر اساس URL. */
export async function searchWeb(
  queries: string[],
  perQuery = 4,
): Promise<SearchResult[]> {
  if (!isWebSearchEnabled() || queries.length === 0) return [];

  const batches = await Promise.all(
    queries.slice(0, 4).map((query) => searchOnce(query, perQuery)),
  );

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const result of batches.flat()) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    merged.push(result);
  }
  return merged;
}

/** نتایج را به یک بلوک متنی برای پرامپت تبدیل می‌کند. */
export function renderSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No web search results are available. You have no external sources for this article.";
  }
  return results
    .map(
      (result, index) =>
        `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.snippet}`,
    )
    .join("\n\n");
}
