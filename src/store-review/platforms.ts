export type StorePlatformId =
  | "grab"
  | "uber_eats"
  | "doordash"
  | "deliveroo"
  | "foodpanda"
  | "glovo"
  | "just_eat"
  | "grubhub"
  | "swiggy"
  | "zomato"
  | "meituan"
  | "eleme"
  | "jd_waimai"
  | "taobao_flash"
  | "other"
  | "offline";

export type StorePlatformGroup = "intl" | "cn" | "misc";

export type StorePlatformDef = {
  id: StorePlatformId;
  group: StorePlatformGroup;
  labelEn: string;
  labelZh: string;
};

/** 国内外常见外卖 / 到店平台；「其他」可填自定义名称，「线下」为实体店 */
export const STORE_PLATFORMS: StorePlatformDef[] = [
  { id: "grab", group: "intl", labelEn: "Grab", labelZh: "Grab" },
  { id: "uber_eats", group: "intl", labelEn: "Uber Eats", labelZh: "Uber Eats" },
  { id: "doordash", group: "intl", labelEn: "DoorDash", labelZh: "DoorDash" },
  { id: "deliveroo", group: "intl", labelEn: "Deliveroo", labelZh: "Deliveroo" },
  { id: "foodpanda", group: "intl", labelEn: "foodpanda", labelZh: "foodpanda" },
  { id: "glovo", group: "intl", labelEn: "Glovo", labelZh: "Glovo" },
  { id: "just_eat", group: "intl", labelEn: "Just Eat", labelZh: "Just Eat" },
  { id: "grubhub", group: "intl", labelEn: "Grubhub", labelZh: "Grubhub" },
  { id: "swiggy", group: "intl", labelEn: "Swiggy", labelZh: "Swiggy" },
  { id: "zomato", group: "intl", labelEn: "Zomato", labelZh: "Zomato" },
  { id: "meituan", group: "cn", labelEn: "Meituan (美团)", labelZh: "美团" },
  { id: "eleme", group: "cn", labelEn: "Ele.me (饿了么)", labelZh: "饿了么" },
  { id: "jd_waimai", group: "cn", labelEn: "JD Delivery (京东外卖)", labelZh: "京东外卖" },
  {
    id: "taobao_flash",
    group: "cn",
    labelEn: "Taobao Flash (淘宝闪购)",
    labelZh: "淘宝闪购",
  },
  { id: "other", group: "misc", labelEn: "Other platform", labelZh: "其他平台" },
  { id: "offline", group: "misc", labelEn: "Offline store", labelZh: "线下店铺" },
];

const PLATFORM_IDS = new Set<string>(STORE_PLATFORMS.map((p) => p.id));

export function isStorePlatformId(value: string): value is StorePlatformId {
  return PLATFORM_IDS.has(value);
}

export function platformLabel(
  id: StorePlatformId,
  locale: "en" | "zh",
  platformOther?: string | null
): string {
  if (id === "other" && platformOther?.trim()) {
    return platformOther.trim();
  }
  const def = STORE_PLATFORMS.find((p) => p.id === id);
  if (!def) return id;
  return locale === "zh" ? def.labelZh : def.labelEn;
}
