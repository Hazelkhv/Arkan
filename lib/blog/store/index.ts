import { memoryStore } from "@/lib/blog/store/memory";
import { supabaseStore } from "@/lib/blog/store/supabase";
import type { BlogStore } from "@/lib/blog/store/types";

export type {
  BlogStore,
  FeedbackRecord,
  LessonRecord,
  NewPost,
  PipelineStep,
  PostRecord,
  PostStatus,
  RunRecord,
} from "@/lib/blog/store/types";

/**
 * انتخاب آداپتور بر اساس محیط، نه بر اساس فلگ.
 *
 * اگر متغیرهای Supabase ست باشند، داده ماندگار است؛ وگرنه حافظه. هیچ جای دیگری
 * از برنامه لازم نیست بداند کدام یکی فعال است — و همین نکته‌ی اصلی الگوی Adapter
 * است: یک `if` در کل سیستم، نه یکی در هر فراخوانی.
 *
 * `||` و نه `??`: مقدار خالی در .env باید مثل «تنظیم‌نشده» رفتار کند.
 */
export function getStore(): BlogStore {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? supabaseStore : memoryStore;
}
