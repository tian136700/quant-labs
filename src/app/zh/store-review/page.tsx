import { StoreReviewPage } from "@/store-review/components/StoreReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "商店 / 外卖评价 — 打分、避雷菜品、公开分享",
  description:
    "记录 Grab、美团、Uber Eats 及线下店铺评分，标注好吃与避雷菜品，可选公开到评价广场。",
};

export default function Page() {
  return <StoreReviewPage />;
}
