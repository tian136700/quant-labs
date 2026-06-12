import { TeacherReviewPage } from "@/components/TeacherReviewPage";
import { TeacherReviewJsonLd } from "@/components/TeacherReviewJsonLd";
import { buildTeacherReviewMetadata } from "@/lib/etr-seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildTeacherReviewMetadata("en");

export default function Page() {
  return (
    <>
      <TeacherReviewJsonLd locale="en" />
      <TeacherReviewPage />
    </>
  );
}
