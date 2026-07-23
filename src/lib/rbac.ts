import type { EtrUserRole } from "@/lib/etr-auth";

export type RbacPermissionCategory =
  | "admin"
  | "pages"
  | "jp_vocab"
  | "jp_lesson"
  | "en_vocab"
  | "en_lesson"
  | "ko_pron"
  | "nav";

/** 权限页大模块（其下可含多个 category 子分组） */
export type RbacPermissionModule = "jp_learning" | "en_learning" | "ko_learning";

export const RBAC_CATEGORY_MODULE: Partial<
  Record<RbacPermissionCategory, RbacPermissionModule>
> = {
  jp_vocab: "jp_learning",
  jp_lesson: "jp_learning",
  en_vocab: "en_learning",
  en_lesson: "en_learning",
  ko_pron: "ko_learning",
};

/** 权限页模块顺序及所含子分组 */
export const RBAC_UI_LAYOUT: Array<
  | { kind: "category"; category: RbacPermissionCategory }
  | { kind: "module"; module: RbacPermissionModule; categories: RbacPermissionCategory[] }
> = [
  { kind: "category", category: "admin" },
  { kind: "category", category: "pages" },
  {
    kind: "module",
    module: "jp_learning",
    categories: ["jp_vocab", "jp_lesson"],
  },
  {
    kind: "module",
    module: "en_learning",
    categories: ["en_vocab", "en_lesson"],
  },
  {
    kind: "module",
    module: "ko_learning",
    categories: ["ko_pron"],
  },
  { kind: "category", category: "nav" },
];

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
    descriptionZh: "关于页与提交建议（仅管理员）",
    descriptionEn: "About page and feedback form (admin only)",
  },
  {
    key: "jp_vocab:teacher",
    labelZh: "日语抽问-老师端",
    labelEn: "JP quiz — teacher",
    category: "jp_vocab",
    descriptionZh: "进入 /jp-vocab：抽查卡片、勾选熟悉程度、发给学生",
    descriptionEn: "Access /jp-vocab: flashcard quiz, levels, share to students",
  },
  {
    key: "jp_vocab:admin",
    labelZh: "日语抽问-管理员端",
    labelEn: "JP quiz — admin",
    category: "jp_vocab",
    descriptionZh: "进入 /jp-vocab/admin：全库、设今日抽查数量、导出",
    descriptionEn: "Access /jp-vocab/admin: full library, daily target, export",
  },
  {
    key: "jp_vocab:read",
    labelZh: "浏览单词/语法（API）",
    labelEn: "Browse vocab & grammar (API)",
    category: "jp_vocab",
    descriptionZh: "拉取单词/语法列表（老师端/管理端底层能力）",
    descriptionEn: "Fetch vocab lists (underlying API for teacher/admin pages)",
  },
  {
    key: "jp_vocab:operate",
    labelZh: "操作单词/语法（API）",
    labelEn: "Edit vocab & grammar (API)",
    category: "jp_vocab",
    descriptionZh: "勾选熟悉度、发给学生、编辑备注等写入操作",
    descriptionEn: "Review levels, share, edit notes, and other writes",
  },
  {
    key: "jp_vocab:manual_add",
    labelZh: "手动添加词条",
    labelEn: "Manual add entries",
    category: "jp_vocab",
    descriptionZh: "手动补充单词或语法并关联教案",
    descriptionEn: "Manually add vocab or grammar entries with lesson materials",
  },
  {
    key: "jp_vocab:study",
    labelZh: "今日日语单词（学生端）",
    labelEn: "JP today's vocab (student)",
    category: "jp_vocab",
    descriptionZh: "进入 /jp-vocab/study；可 peek 当前抽查词（不需「请老师发送」）",
    descriptionEn: "Access /jp-vocab/study; peek live quiz word (no share-request UI)",
  },
  {
    key: "jp_vocab:coach",
    labelZh: "课堂带读",
    labelEn: "Classroom read-along",
    category: "jp_vocab",
    descriptionZh: "进入 /jp-vocab/coach：带读未掌握词（默认关；可按账号白名单临时开放）",
    descriptionEn: "Access /jp-vocab/coach (off by default; optional per-user allowlist)",
  },
  {
    key: "jp_lesson:read",
    labelZh: "浏览新课",
    labelEn: "Browse lessons",
    category: "jp_lesson",
    descriptionZh: "可查看新课列表与教案链接",
    descriptionEn: "View lesson list and lesson-plan links",
  },
  {
    key: "jp_lesson:operate",
    labelZh: "操作新课",
    labelEn: "Edit lessons",
    category: "jp_lesson",
    descriptionZh: "学习状态、教案编辑、课堂笔记",
    descriptionEn: "Progress, lesson plans, class notes",
  },
  {
    key: "en_vocab:teacher",
    labelZh: "英语抽背-老师端",
    labelEn: "EN vocab — teacher",
    category: "en_vocab",
    descriptionZh: "进入 /en-vocab：勾选熟悉程度、共享到今日单词",
    descriptionEn: "Access /en-vocab: levels, share to today's words",
  },
  {
    key: "en_vocab:admin",
    labelZh: "英语抽背-管理员端",
    labelEn: "EN vocab — admin",
    category: "en_vocab",
    descriptionZh: "进入 /en-vocab/admin：全库、导出、删除、重置",
    descriptionEn: "Access /en-vocab/admin: full library, export, delete, reset",
  },
  {
    key: "en_vocab:read",
    labelZh: "浏览英语单词/语法",
    labelEn: "Browse EN vocab & grammar",
    category: "en_vocab",
    descriptionZh: "可查看英语单词/语法抽问列表",
    descriptionEn: "View English vocabulary and grammar spot-check lists",
  },
  {
    key: "en_vocab:operate",
    labelZh: "操作英语单词/语法",
    labelEn: "Edit EN vocab & grammar",
    category: "en_vocab",
    descriptionZh: "勾选熟悉度、重置、共享到今日单词",
    descriptionEn: "Review levels, reset, share to today's list",
  },
  {
    key: "en_vocab:manual_add",
    labelZh: "手动添加英语词条",
    labelEn: "Manual add EN entries",
    category: "en_vocab",
    descriptionZh: "手动补充英语单词或语法（默认隐藏；需单独授权）",
    descriptionEn: "Manually add EN vocab entries (hidden by default; grant separately)",
  },
  {
    key: "en_lesson:read",
    labelZh: "浏览英语新课",
    labelEn: "Browse EN lessons",
    category: "en_lesson",
    descriptionZh: "可查看英语新课列表与教案链接",
    descriptionEn: "View English lesson list and lesson-plan links",
  },
  {
    key: "en_lesson:operate",
    labelZh: "操作英语新课",
    labelEn: "Edit EN lessons",
    category: "en_lesson",
    descriptionZh: "学习状态、教案编辑、课堂笔记",
    descriptionEn: "Progress, lesson plans, class notes",
  },
  {
    key: "ko_pron:teacher",
    labelZh: "韩语发音抽问-老师端",
    labelEn: "KO pronunciation quiz — teacher",
    category: "ko_pron",
    descriptionZh: "进入 /ko-pron：字母抽查卡片、勾选熟悉程度",
    descriptionEn: "Access /ko-pron: letter flashcard quiz, familiarity levels",
  },
  {
    key: "ko_pron:admin",
    labelZh: "韩语发音抽问/勾选-管理员",
    labelEn: "KO pronunciation quiz/select — admin",
    category: "ko_pron",
    descriptionZh: "进入 /ko-pron/admin 与 /ko-pron/select：抽问池、设目标、勾选入库",
    descriptionEn: "Access quiz admin and letter select pages",
  },
  {
    key: "ko_pron:read",
    labelZh: "浏览韩语字母（API）",
    labelEn: "Browse KO letters (API)",
    category: "ko_pron",
    descriptionZh: "拉取韩语字母列表（老师端/管理端底层能力）",
    descriptionEn: "Fetch letter lists (underlying API for teacher/admin pages)",
  },
  {
    key: "ko_pron:operate",
    labelZh: "操作韩语字母（API）",
    labelEn: "Edit KO letters (API)",
    category: "ko_pron",
    descriptionZh: "勾选熟悉度等写入操作",
    descriptionEn: "Review levels and other writes",
  },
  {
    key: "ko_pron:study",
    labelZh: "今日韩语发音（学生端）",
    labelEn: "Today's KO pronunciation (student)",
    category: "ko_pron",
    descriptionZh: "进入 /ko-pron/study：跟读老师当前抽查字母（罗马音仅老师勾选后显示）",
    descriptionEn: "Access /ko-pron/study: follow teacher's live letter (romanization after teacher marks)",
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
    key: "nav:en_teacher",
    labelZh: "英语教师导航",
    labelEn: "EN teacher navigation",
    category: "nav",
    descriptionZh: "仅显示英语相关导航项",
    descriptionEn: "EN-focused nav items only",
  },
  {
    key: "nav:ko_teacher",
    labelZh: "韩语教师导航",
    labelEn: "KO teacher navigation",
    category: "nav",
    descriptionZh: "仅显示韩语相关导航项",
    descriptionEn: "KO-focused nav items only",
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
    descriptionZh: "日语抽问-老师端（抽查 / 发给学生）",
    descriptionEn: "JP quiz teacher page (spot-check / share)",
  },
  en_vocab: {
    zh: "英语教师",
    en: "EN teacher",
    descriptionZh: "英语抽背-老师端（抽查 / 共享）",
    descriptionEn: "EN vocab teacher page (spot-check / share)",
  },
  ko_pron: {
    zh: "韩语老师",
    en: "KO teacher",
    descriptionZh: "韩语发音-老师端（字母抽查）",
    descriptionEn: "KO pronunciation teacher page (letter quiz)",
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
    "jp_vocab:teacher",
    "jp_vocab:read",
    "jp_vocab:operate",
    "nav:jp_teacher",
  ],
  en_vocab: [
    "en_vocab:teacher",
    "en_vocab:read",
    "en_vocab:operate",
    "nav:en_teacher",
  ],
  ko_pron: [
    "ko_pron:teacher",
    "ko_pron:read",
    "ko_pron:operate",
    "nav:ko_teacher",
  ],
  user: [
    "compare:view",
    "etr:use",
    "store_review:use",
    "store_review:plaza",
    "jp_vocab:study",
    "jp_lesson:read",
  ],
};

export const RBAC_MANAGEABLE_ROLES: EtrUserRole[] = [
  "jp_vocab",
  "en_vocab",
  "ko_pron",
  "user",
];

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
    jp_vocab: { zh: "日语抽查（单词/语法）", en: "JP spot-check (vocab & grammar)" },
    jp_lesson: { zh: "日语新课", en: "JP new lessons" },
    en_vocab: { zh: "英语抽查（单词/语法）", en: "EN spot-check (vocab & grammar)" },
    en_lesson: { zh: "英语新课", en: "EN new lessons" },
    ko_pron: { zh: "韩语发音（字母）", en: "KO pronunciation (letters)" },
    nav: { zh: "导航显示", en: "Navigation" },
  };
  return locale === "zh" ? map[category].zh : map[category].en;
}

export function rbacModuleLabel(
  module: RbacPermissionModule,
  locale: "en" | "zh"
): string {
  const map: Record<RbacPermissionModule, { zh: string; en: string }> = {
    jp_learning: { zh: "日语学习", en: "Japanese learning" },
    en_learning: { zh: "英语学习", en: "English learning" },
    ko_learning: { zh: "韩语学习", en: "Korean learning" },
  };
  return locale === "zh" ? map[module].zh : map[module].en;
}

/** 日语教师角色不应持有的权限（默认关闭，保存时自动剔除） */
export const RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS = [
  "jp_lesson:read",
  "jp_lesson:operate",
  "jp_vocab:manual_add",
  "jp_vocab:admin",
  "jp_vocab:study",
  /** 带读按账号白名单开放（欣欣等），禁止给全体 jp_vocab 老师开 */
  "jp_vocab:coach",
  "ko_pron:teacher",
  "ko_pron:admin",
  "ko_pron:read",
  "ko_pron:operate",
  "ko_pron:study",
  "nav:ko_teacher",
  /** 关于页仅管理员 */
  "about:view",
] as const;

/** 网上注册用户（学生）不应持有的日语/韩语老师权限；韩语学生端默认不开（见默认权限表） */
export const RBAC_USER_EXCLUDED_PERMISSIONS = [
  "jp_vocab:teacher",
  "jp_vocab:admin",
  "jp_vocab:read",
  "jp_vocab:operate",
  "jp_vocab:manual_add",
  "ko_pron:teacher",
  "ko_pron:admin",
  "ko_pron:read",
  "ko_pron:operate",
  /** 关于页仅管理员 */
  "about:view",
] as const;

/** 英语教师角色不应持有的权限（默认关闭，可由管理员手动开启） */
export const RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS = [
  "en_lesson:read",
  "en_lesson:operate",
  "en_vocab:admin",
  "en_vocab:manual_add",
  "ko_pron:teacher",
  "ko_pron:admin",
  "ko_pron:read",
  "ko_pron:operate",
  "ko_pron:study",
  "nav:ko_teacher",
  /** 关于页仅管理员 */
  "about:view",
] as const;

/** 韩语老师角色不应持有的权限（默认关闭） */
export const RBAC_KO_TEACHER_EXCLUDED_PERMISSIONS = [
  "ko_pron:admin",
  "ko_pron:study",
  /** 关于页仅管理员 */
  "about:view",
] as const;

/** 用户管理：可多选的老师身份（主 role 仍只存一个，其余写入额外权限） */
export type RbacTeacherModule = "jp" | "en" | "ko";

export type RbacTeacherModules = Record<RbacTeacherModule, boolean>;

/** 各老师身份默认权限包（与角色默认一致） */
export const RBAC_TEACHER_MODULE_BUNDLES: Record<RbacTeacherModule, string[]> = {
  jp: [...RBAC_DEFAULT_ROLE_PERMISSIONS.jp_vocab],
  en: [...RBAC_DEFAULT_ROLE_PERMISSIONS.en_vocab],
  ko: [...RBAC_DEFAULT_ROLE_PERMISSIONS.ko_pron],
};

export const RBAC_TEACHER_MODULE_ROLE: Record<RbacTeacherModule, EtrUserRole> = {
  jp: "jp_vocab",
  en: "en_vocab",
  ko: "ko_pron",
};

export function emptyTeacherModules(): RbacTeacherModules {
  return { jp: false, en: false, ko: false };
}

export function teacherModulesFromRole(role: string | undefined): RbacTeacherModules {
  return {
    jp: role === "jp_vocab",
    en: role === "en_vocab",
    ko: role === "ko_pron",
  };
}

/** 根据主角色 + 额外权限还原勾选（有 *:teacher 即视为该身份） */
export function detectTeacherModules(
  role: string | undefined,
  extraPermissions: readonly string[] = []
): RbacTeacherModules {
  const extras = new Set(extraPermissions);
  return {
    jp: role === "jp_vocab" || extras.has("jp_vocab:teacher"),
    en: role === "en_vocab" || extras.has("en_vocab:teacher"),
    ko: role === "ko_pron" || extras.has("ko_pron:teacher"),
  };
}

/**
 * 勾选 → 主 role + 额外权限。
 * 主角色优先级：日语 > 英语 > 韩语（与常见「日语老师兼韩语」一致）；全不勾 → user。
 */
export function teacherModulesToRoleAndExtras(modules: RbacTeacherModules): {
  role: EtrUserRole;
  extra_permissions: string[];
} {
  const order: RbacTeacherModule[] = ["jp", "en", "ko"];
  const selected = order.filter((key) => modules[key]);
  if (!selected.length) {
    return { role: "user", extra_permissions: [] };
  }
  const primary = selected[0];
  const role = RBAC_TEACHER_MODULE_ROLE[primary];
  const extras = new Set<string>();
  for (const key of selected) {
    if (key === primary) continue;
    for (const perm of RBAC_TEACHER_MODULE_BUNDLES[key]) {
      extras.add(perm);
    }
  }
  return { role, extra_permissions: [...extras].sort() };
}

export function formatTeacherModulesLabel(
  modules: RbacTeacherModules,
  locale: "zh" | "en"
): string {
  const parts: string[] = [];
  if (modules.jp) {
    parts.push(locale === "zh" ? "日语教师" : "JP teacher");
  }
  if (modules.en) {
    parts.push(locale === "zh" ? "英语教师" : "EN teacher");
  }
  if (modules.ko) {
    parts.push(locale === "zh" ? "韩语老师" : "KO teacher");
  }
  if (!parts.length) {
    return locale === "zh" ? "普通用户" : "Regular user";
  }
  return parts.join(locale === "zh" ? " + " : " + ");
}

export function parseTeacherModulesInput(
  raw: unknown
): RbacTeacherModules | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    jp: Boolean(obj.jp),
    en: Boolean(obj.en),
    ko: Boolean(obj.ko),
  };
}

export function isAdminSuperuser(role: string | undefined): boolean {
  return role === "admin";
}
