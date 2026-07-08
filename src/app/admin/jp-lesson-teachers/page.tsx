import { AdminJpLessonTeachersPage } from "@/components/AdminJpLessonTeachersPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JP Lesson Teachers",
  description: "Manage JP lesson teachers.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminJpLessonTeachersPage />;
}
