import { TeacherReviewPage } from "@/components/TeacherReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语老师评价",
  description:
    "记录每次上课对英语老师的评分，上课前查看历史评价，避免踩雷老师。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TeacherReviewPage />;
}
