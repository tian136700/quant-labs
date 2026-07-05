import { AdminEnLessonTeachersPage } from "@/components/AdminEnLessonTeachersPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lesson Teachers",
  description: "Manage JP lesson teachers.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminEnLessonTeachersPage />;
}
