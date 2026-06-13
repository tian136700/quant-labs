import { StoreReviewPlazaPage } from "@/store-review/components/StoreReviewPlazaPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store Review Plaza — Public Delivery & Shop Ratings",
  description:
    "Browse public shop reviews from delivery apps and offline stores — scores, recommended dishes, and ones to avoid.",
};

export default function Page() {
  return <StoreReviewPlazaPage />;
}
