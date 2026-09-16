import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * قفل استودیو.
 *
 * عمداً ساده است و عمداً با ورود ادمین سایت (Supabase Auth) فرق دارد: این پنل
 * برای دیپلوی عمومیِ یک نمونه‌ی آموزشی است، نه برای تیم آرکان. یک رمز مشترک،
 * دقیقاً همان چیزی است که این سطح از محافظت لازم دارد.
 *
 * سه نکته که ساده بودن، بهانه‌ی رعایت نکردنشان نیست:
 *
 *  • کوکی httpOnly است، پس اسکریپت صفحه نمی‌تواند بخواندش.
 *  • مقدار کوکی، هشِ رمز است نه خود رمز. کوکیِ لو رفته هم رمز را لو نمی‌دهد.
 *  • مقایسه با timingSafeEqual انجام می‌شود. مقایسه‌ی `===` روی رشته به‌محض
 *    اولین کاراکترِ متفاوت برمی‌گردد و همین اختلاف زمانِ ناچیز، حدس زدن رمز را
 *    کاراکتر به کاراکتر ممکن می‌کند.
 *
 * اگر STUDIO_PASSWORD ست نشده باشد، قفل باز است — تا روی لپ‌تاپ، `npm run dev`
 * بدون هیچ تنظیماتی کار کند. برای هر استقرار عمومی باید ست شود.
 */

const COOKIE = "arkan_studio";

function expectedToken(password: string): string {
  return createHash("sha256").update(`arkan-studio:${password}`).digest("hex");
}

/** `true` یعنی هیچ رمزی تنظیم نشده و پنل باز است. */
export function isStudioOpen(): boolean {
  return !process.env.STUDIO_PASSWORD;
}

export function checkPassword(candidate: string): string | null {
  const password = process.env.STUDIO_PASSWORD || "";
  if (!password) return null;

  const a = Buffer.from(createHash("sha256").update(candidate).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(password).digest("hex"));
  return a.length === b.length && timingSafeEqual(a, b) ? expectedToken(password) : null;
}

export async function isStudioUnlocked(): Promise<boolean> {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) return true;

  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken(password));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function openStudioSession(token: string): Promise<void> {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function closeStudioSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * نگهبان مسیرهای API استودیو.
 *
 * `null` یعنی اجازه هست؛ در غیر این صورت همان Response‌ای که باید برگردانده شود.
 * الگوی «یا اجازه یا پاسخ» باعث می‌شود هیچ مسیری نتواند سهواً چک را فراموش کند و
 * باز هم کامپایل شود.
 */
export async function guardStudioRoute(): Promise<Response | null> {
  if (await isStudioUnlocked()) return null;
  return Response.json({ error: "Studio is locked." }, { status: 401 });
}
