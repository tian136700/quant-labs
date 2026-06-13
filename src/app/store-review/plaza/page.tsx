import { StoreReviewPlazaPage } from "@/store-review/components/StoreReviewPlazaPage";
import { StoreReviewJsonLd } from "@/components/StoreReviewJsonLd";
import { buildStoreReviewMetadata } from "@/lib/store-review-seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildStoreReviewMetadata("en", "plaza");

export default function Page() {
  return (
    <>
      <StoreReviewJsonLd locale="en" page="plaza" />
      <StoreReviewPlazaPage />
    </>
  );
}
