import type { EtrUserRole } from "@/lib/etr-auth";

export type RbacPermissionCategory = "admin" | "pages" | "jp" | "nav";

export interface RbacPermissionDef {
  key: string;
  labelZh: string;
  labelEn: string;
  category: RbacPermissionCategory;
  descriptionZh: string;
  descriptionEn: string;
}

/** 全站权限清单（与现有功能一一对应） */
export const RBAC_PERMISSION_CATALOG: RbacPermissionDef[] = [
  {
    key: "admin:dashboard",
    labelZh: "后台管理",
    labelEn: "Admin dashboard",
    category: "admin",
    descriptionZh: "访问统计与用户反馈",
    descriptionEn: "Visit logs and user feedback",
  },
  {
    key: "admin:trends",
    labelZh: "趋势抓取",
    labelEn: "Trend aggregator",
    category: "admin",
    descriptionZh: "AI 提示词与抓取批次",
    descriptionEn: "Trend runs and AI prompts",
  },
  {
    key: "admin:rbac",
    labelZh: "角色权限管理",
    labelEn: "Role permissions",
    category: "admin",
    descriptionZh: "配置各角色可访问的功能",
    descriptionEn: "Configure role-based access",
  },
  {
    key: "admin:users",
    labelZh: "用户管理",
    labelEn: "User management",
    category: "admin",
    descriptionZh: "禁用或启用账号",
    descriptionEn: "Disable or enable user accounts",
  },
  {
    key: "compare:view",
    labelZh: "策略对比",
    labelEn: "Strategy compare",
    category: "pages",
    descriptionZh: "首页策略对比工具",
    descriptionEn: "Homepage strategy compare tool",
  },
  {
    key: "etr:use",
    labelZh: "英语老师评价",
    labelEn: "English teacher review",
    category: "pages",
    descriptionZh: "登录后可管理评价记录",
    descriptionEn: "Manage teacher review records",
  },
  {
    key: "store_review:use",
    labelZh: "外卖评价（私人）",
    labelEn: "Store review (private)",
    category: "pages",
    descriptionZh: "个人外卖/店铺评价",
    descriptionEn: "Personal store reviews",
  },
  {
    key: "store_review:plaza",
    labelZh: "评价广场",
    labelEn: "Review plaza",
    category: "pages",
    descriptionZh: "公开评价列表",
    descriptionEn: "Public review plaza",
  },
  {
    key: "about:view",
    labelZh: "关于与反馈",
    labelEn: "About & feedback",
    category: "pages",
    descriptionZh: "关于页与提交建议",
    descriptionEn: "About page and feedback form",
  },
  {
    key: "jp_vocab:read",
    labelZh: "日语单词浏览",
    labelEn: "JP vocab (browse)",
    category: "jp",
    descriptionZh: "访客可浏览单词/语法表",
    descriptionEn: "Browse vocabulary and grammar lists",
  },
  {
    key: "jp_vocab:operate",
    labelZh: "日语单词操作",
    labelEn: "JP vocab (edit)",
    category: "jp",
    descriptionZh: "勾选熟悉度、重置、手动添加",
    descriptionEn: "Review levels, reset, manual add",
  },
  {
    key: "jp_lesson:read",
    labelZh: "日语新课浏览",
    labelEn: "JP lessons (browse)",
    category: "jp",
    descriptionZh: "访客可浏览新课与教案链接",
    descriptionEn: "Browse lessons and lesson plans",
  },
  {
    key: "jp_lesson:operate",
    labelZh: "日语新课操作",
    labelEn: "JP lessons (edit)",
    category: "jp",
    descriptionZh: "学习状态、教案编辑、课堂笔记",
    descriptionEn: "Progress, lesson plans, class notes",
  },
  {
    key: "nav:jp_teacher",
    labelZh: "日语教师导航",
    labelEn: "JP teacher navigation",
    category: "nav",
    descriptionZh: "仅显示日语相关导航项",
    descriptionEn: "JP-focused nav items only",
  },
  {
    key: "nav:full",
    labelZh: "完整站点导航",
    labelEn: "Full site navigation",
    category: "nav",
    descriptionZh: "显示全部功能入口",
    descriptionEn: "All navigation entries",
  },
];

export const RBAC_ALL_PERMISSION_KEYS = RBAC_PERMISSION_CATALOG.map((p) => p.key);

export const RBAC_ROLE_LABELS: Record<
  EtrUserRole,
  { zh: string; en: string; descriptionZh: string; descriptionEn: string }
> = {
  admin: {
    zh: "管理员",
    en: "Admin",
    descriptionZh: "拥有全部功能（不可在此关闭）",
    descriptionEn: "Full access (cannot be restricted here)",
  },
  jp_vocab: {
    zh: "日语教师",
    en: "JP teacher",
    descriptionZh: "日语新课与单词抽问操作",
    descriptionEn: "JP lesson and vocab operations",
  },
  user: {
    zh: "网上的注册用户",
    en: "Online registered user",
    descriptionZh: "网站公开注册账号（评价、外卖评价等）",
    descriptionEn: "Public web sign-up accounts",
  },
};

/** 与现有行为一致的默认权限（首次初始化写入 D1） */
export const RBAC_DEFAULT_ROLE_PERMISSIONS: Record<EtrUserRole, string[]> = {
  admin: [...RBAC_ALL_PERMISSION_KEYS],
  jp_vocab: [
    "jp_vocab:read",
    "jp_vocab:operate",
    "jp_lesson:read",
    "jp_lesson:operate",
    "about:view",
    "nav:jp_teacher",
  ],
  user: [
    "compare:view",
    "etr:use",
    "store_review:use",
    "store_review:plaza",
    "jp_vocab:read",
    "jp_lesson:read",
    "about:view",
  ],
};

export const RBAC_MANAGEABLE_ROLES: EtrUserRole[] = ["jp_vocab", "user"];

export function rbacPermissionLabel(
  def: RbacPermissionDef,
  locale: "en" | "zh"
): string {
  return locale === "zh" ? def.labelZh : def.labelEn;
}

export function rbacPermissionDescription(
  def: RbacPermissionDef,
  locale: "en" | "zh"
): string {
  return locale === "zh" ? def.descriptionZh : def.descriptionEn;
}

export function rbacCategoryLabel(
  category: RbacPermissionCategory,
  locale: "en" | "zh"
): string {
  const map: Record<RbacPermissionCategory, { zh: string; en: string }> = {
    admin: { zh: "管理功能", en: "Administration" },
    pages: { zh: "站点页面", en: "Site pages" },
    jp: { zh: "日语学习", en: "Japanese learning" },
    nav: { zh: "导航显示", en: "Navigation" },
  };
  return locale === "zh" ? map[category].zh : map[category].en;
}

export function isAdminSuperuser(role: string | undefined): boolean {
  return role === "admin";
}
