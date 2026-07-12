import { redirect } from "next/navigation";
import { adminJpLessonTeachersPath } from "@/lib/locale-path";

export const dynamic = "force-dynamic";

/** 英语老师评价已合并至「上课老师管理」（选英语老师） */
export default function Page() {
  redirect(adminJpLessonTeachersPath("en", undefined, "en"));
}
