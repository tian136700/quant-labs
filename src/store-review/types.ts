import type { StorePlatformId } from "./platforms";

export type StoreReviewDishKind = "good" | "bad";

export interface StoreReviewDishInput {
  dish_name: string;
  remark?: string | null;
}

export interface StoreReviewDish {
  id: number;
  review_id: number;
  kind: StoreReviewDishKind;
  dish_name: string;
  remark: string | null;
}

export interface StoreReviewRecord {
  id: number;
  user_id: number;
  platform: StorePlatformId;
  platform_other: string | null;
  store_name: string;
  score: number;
  remark: string | null;
  is_public: number;
  created_at: string;
  updated_at: string;
}

export interface StoreReviewWithDishes extends StoreReviewRecord {
  good_dishes: StoreReviewDish[];
  bad_dishes: StoreReviewDish[];
}

export interface PublicStoreReview extends StoreReviewWithDishes {
  masked_username: string;
}

export type StoreReviewSortField =
  | "store_name"
  | "platform"
  | "score"
  | "updated_at";

export type SaveStoreReviewInput = {
  id?: number;
  user_id: number;
  platform: StorePlatformId;
  platform_other?: string | null;
  store_name: string;
  score: number;
  remark?: string | null;
  is_public: boolean;
  good_dishes: StoreReviewDishInput[];
  bad_dishes: StoreReviewDishInput[];
};

export type SaveStoreReviewResult =
  | { ok: true; record: StoreReviewWithDishes }
  | { ok: false; error: string };
