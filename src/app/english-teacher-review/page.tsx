import { TeacherReviewPage } from "@/components/TeacherReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "English Teacher Review",
  description:
    "Record and review English teacher ratings after each class. Check history before booking to avoid poor matches.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TeacherReviewPage />;
}
