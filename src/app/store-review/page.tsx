import { StoreReviewPage } from "@/store-review/components/StoreReviewPage";
import { StoreReviewJsonLd } from "@/components/StoreReviewJsonLd";
import { buildStoreReviewMetadata } from "@/lib/store-review-seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildStoreReviewMetadata("en", "home");

export default function Page() {
  return (
    <>
      <StoreReviewJsonLd locale="en" page="home" />
      <StoreReviewPage />
    </>
  );
}
