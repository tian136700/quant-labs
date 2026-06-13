import { StoreReviewPage } from "@/store-review/components/StoreReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store & Delivery Review — Rate Shops, Dishes & Share Tips",
  description:
    "Log scores for Grab, Meituan, Uber Eats and offline stores. Mark good dishes and ones to avoid. Share public reviews on the plaza.",
};

export default function Page() {
  return <StoreReviewPage />;
}
