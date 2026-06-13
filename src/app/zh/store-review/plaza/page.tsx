import { StoreReviewPlazaPage } from "@/store-review/components/StoreReviewPlazaPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "评价广场 — 公开的外卖 / 店铺评价",
  description:
    "浏览大家公开分享的店铺评价：平台、评分、推荐菜与避雷菜。",
};

export default function Page() {
  return <StoreReviewPlazaPage />;
}
