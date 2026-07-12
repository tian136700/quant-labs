import { redirect } from "next/navigation";
import { adminJpLessonTeachersPath } from "@/lib/locale-path";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect(adminJpLessonTeachersPath("en", undefined, "en"));
}
