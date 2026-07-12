import { redirect } from "next/navigation";
import { jpLessonSchedulePath } from "@/lib/locale-path";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect(jpLessonSchedulePath());
}
