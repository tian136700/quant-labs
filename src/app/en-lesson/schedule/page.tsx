import { redirect } from "next/navigation";
import { jpLessonSchedulePath } from "@/lib/locale-path";

/** 统一跳到日语日程管理；静态壳即可，勿 force-dynamic（省 Worker SSR） */
export const dynamic = "force-static";

export default function Page() {
  redirect(jpLessonSchedulePath());
}
