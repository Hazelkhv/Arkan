"use server";

import { revalidatePath } from "next/cache";
import { checkPassword, openStudioSession } from "@/lib/blog/studio-auth";

/**
 * باز کردن قفل استودیو.
 *
 * Server Action است و نه یک مسیر API، چون فرم ورود بدون جاوااسکریپت هم باید کار
 * کند. یادآوری قاعده‌ی Next: یک ماژول "use server" فقط اجازه دارد تابع async
 * export کند — به همین دلیل هیچ ثابت یا تایپی اینجا export نشده است.
 */
export async function unlockStudio(
  _previous: { error: boolean },
  formData: FormData,
): Promise<{ error: boolean }> {
  const password = String(formData.get("password") ?? "");
  const token = checkPassword(password);

  if (!token) return { error: true };

  await openStudioSession(token);
  revalidatePath("/studio");
  return { error: false };
}
