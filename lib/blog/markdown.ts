import { Marked } from "marked";

/**
 * رندر مارک‌داون مقاله.
 *
 * دو تصمیم امنیتی/محتوایی که هر دو یک‌خطی‌اند و هر دو مهم:
 *
 *  ۱. HTML خام دور ریخته می‌شود. متن مقاله را یک مدل زبانی تولید کرده و بعد در
 *     صفحه با dangerouslySetInnerHTML رندر می‌شود. حتی وقتی منبع «خودی» است،
 *     اجازه دادن به <script> یا <iframe> داخل خروجی مدل، یک مسیر تزریق باز
 *     می‌گذارد که هیچ فایده‌ای ندارد — مقاله‌های ما مارک‌داون خالص‌اند.
 *
 *  ۲. اولین H1 حذف می‌شود. عنوان را خود صفحه به‌عنوان <h1> رندر می‌کند؛ اگر بدنه
 *     هم H1 خودش را داشته باشد، صفحه دو h1 دارد و ساختار تیترها برای screen
 *     reader و برای موتور جستجو خراب می‌شود.
 */

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: () => "",
  },
});

/** عنوان در <h1> صفحه رندر می‌شود، پس از بدنه برداشته می‌شود. */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+.+\n+/, "");
}

export function renderMarkdown(markdown: string): string {
  return marked.parse(stripLeadingH1(markdown), { async: false });
}
