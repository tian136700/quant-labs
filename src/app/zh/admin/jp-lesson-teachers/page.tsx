import { AdminJpLessonTeachersPage } from "@/components/AdminJpLessonTeachersPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "老师管理",
  description: "管理日语新课的上课老师。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminJpLessonTeachersPage />;
}
