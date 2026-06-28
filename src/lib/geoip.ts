import type { Locale } from "@/i18n/messages";
import { COUNTRY_NAMES } from "./country-names";

/** Cloudflare Workers 注入的 IP 地理信息 */
type CfGeo = {
  country?: string;
  region?: string;
  regionCode?: string;
  city?: string;
};

export type ClientGeo = {
  country_code: string | null;
  region: string | null;
  region_code: string | null;
  city: string | null;
};

export type GeoRecord = {
  country_code: string | null;
  geo_region?: string | null;
  geo_region_code?: string | null;
  geo_city?: string | null;
};

/** ISO 3166-2:CN 省级代码 → 中文名（Cloudflare CF-Region-Code） */
const CN_PROVINCE_ZH: Record<string, string> = {
  AH: "安徽省",
  BJ: "北京市",
  CQ: "重庆市",
  FJ: "福建省",
  GD: "广东省",
  GS: "甘肃省",
  GX: "广西壮族自治区",
  GZ: "贵州省",
  HA: "河南省",
  HB: "湖北省",
  HE: "河北省",
  HI: "海南省",
  HK: "香港",
  HL: "黑龙江省",
  HN: "湖南省",
  JL: "吉林省",
  JS: "江苏省",
  JX: "江西省",
  LN: "辽宁省",
  MO: "澳门",
  NM: "内蒙古自治区",
  NX: "宁夏回族自治区",
  QH: "青海省",
  SC: "四川省",
  SD: "山东省",
  SH: "上海市",
  SN: "陕西省",
  SX: "山西省",
  TJ: "天津市",
  TW: "台湾",
  XJ: "新疆维吾尔自治区",
  XZ: "西藏自治区",
  YN: "云南省",
  ZJ: "浙江省",
};

/** 常见英文城市名 → 中文（Cloudflare 对中国 IP 常返回英文） */
const CN_CITY_ZH: Record<string, string> = {
  beijing: "北京",
  shanghai: "上海",
  tianjin: "天津",
  chongqing: "重庆",
  guangzhou: "广州",
  shenzhen: "深圳",
  dongguan: "东莞",
  foshan: "佛山",
  zhuhai: "珠海",
  hangzhou: "杭州",
  ningbo: "宁波",
  wenzhou: "温州",
  nanjing: "南京",
  suzhou: "苏州",
  wuxi: "无锡",
  changzhou: "常州",
  nantong: "南通",
  xuzhou: "徐州",
  chengdu: "成都",
  wuhan: "武汉",
  xian: "西安",
  "xi'an": "西安",
  changsha: "长沙",
  zhengzhou: "郑州",
  qingdao: "青岛",
  jinan: "济南",
  dalian: "大连",
  shenyang: "沈阳",
  harbin: "哈尔滨",
  changchun: "长春",
  shijiazhuang: "石家庄",
  taiyuan: "太原",
  hefei: "合肥",
  fuzhou: "福州",
  xiamen: "厦门",
  quanzhou: "泉州",
  nanchang: "南昌",
  kunming: "昆明",
  guiyang: "贵阳",
  nanning: "南宁",
  haikou: "海口",
  sanya: "三亚",
  urumqi: "乌鲁木齐",
  lhasa: "拉萨",
  yinchuan: "银川",
  xining: "西宁",
  lanzhou: "兰州",
  hohhot: "呼和浩特",
  baotou: "包头",
  zhongshan: "中山",
  huizhou: "惠州",
  jiaxing: "嘉兴",
  shaoxing: "绍兴",
  jinhua: "金华",
  taizhou: "台州",
  yantai: "烟台",
  weifang: "潍坊",
  zibo: "淄博",
  tangshan: "唐山",
  baoding: "保定",
  langfang: "廊坊",
  zhenjiang: "镇江",
  yangzhou: "扬州",
  hongkong: "香港",
  "hong kong": "香港",
  macau: "澳门",
  macao: "澳门",
  taipei: "台北",
  kaohsiung: "高雄",
  taichung: "台中",
};

function readHeader(request: Request, name: string): string | null {
  const value =
    request.headers.get(name) ??
    request.headers.get(name.toLowerCase()) ??
    request.headers.get(name.toUpperCase());
  const trimmed = value?.trim();
  return trimmed || null;
}

function readCfGeo(request: Request): CfGeo | undefined {
  return (request as Request & { cf?: CfGeo }).cf;
}

export function clientCountryCode(request: Request): string | null {
  const cf = readCfGeo(request);
  const cc = cf?.country ?? readHeader(request, "CF-IPCountry");
  if (!cc || cc === "XX" || cc.length !== 2) return null;
  return cc.toUpperCase();
}

/** 从 Cloudflare 请求读取省/市（区县级 IP 库通常无法提供） */
export function clientGeoFromRequest(request: Request): ClientGeo {
  const cf = readCfGeo(request);
  const country_code = clientCountryCode(request);
  const region = cf?.region ?? readHeader(request, "CF-Region");
  const region_code = cf?.regionCode ?? readHeader(request, "CF-Region-Code");
  const city = cf?.city ?? readHeader(request, "CF-IPCity");

  return {
    country_code,
    region: region || null,
    region_code: region_code ? region_code.toUpperCase() : null,
    city: city || null,
  };
}

/** 首次访问时按 IP 国家建议默认语言（中国大陆、港、台、澳默认中文） */
const ZH_GEO_COUNTRIES = new Set(["CN", "HK", "TW", "MO"]);

export function localeFromCountry(countryCode: string | null): Locale {
  if (countryCode && ZH_GEO_COUNTRIES.has(countryCode)) return "zh";
  return "en";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cnCityZh(city: string | null | undefined): string | null {
  if (!city) return null;
  const key = normalizeKey(city);
  return CN_CITY_ZH[key] ?? city.trim();
}

function cnProvinceZh(
  countryCode: string | null,
  regionCode: string | null | undefined,
  region: string | null | undefined
): string | null {
  const cc = countryCode?.toUpperCase();
  if (cc === "HK") return "香港";
  if (cc === "MO") return "澳门";
  if (cc === "TW") return "台湾";

  const code = regionCode?.toUpperCase();
  if (code && CN_PROVINCE_ZH[code]) return CN_PROVINCE_ZH[code];

  if (region) {
    const mapped = CN_CITY_ZH[normalizeKey(region)];
    if (mapped) return mapped.endsWith("市") || mapped.endsWith("省") ? mapped : `${mapped}省`;
    return region.trim();
  }
  return null;
}

function isSamePlace(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeKey(a).replace(/(省|市|自治区|壮族|回族|维吾尔)/g, "");
  const nb = normalizeKey(b).replace(/(省|市|自治区|壮族|回族|维吾尔)/g, "");
  return na === nb || na.includes(nb) || nb.includes(na);
}

function formatCnLocation(record: GeoRecord): string {
  const province = cnProvinceZh(
    record.country_code,
    record.geo_region_code,
    record.geo_region
  );
  const city = cnCityZh(record.geo_city);

  if (province && city && !isSamePlace(province, city)) {
    const cityLabel = city.endsWith("市") ? city : `${city}市`;
    return `${province} ${cityLabel}`;
  }
  if (province) return province;
  if (city) return city.endsWith("市") ? city : `${city}市`;
  return "未知地区";
}

function formatIntlLocation(record: GeoRecord, locale: Locale): string {
  const parts: string[] = [];
  if (record.geo_city) parts.push(record.geo_city);
  if (record.geo_region && !isSamePlace(record.geo_region, record.geo_city ?? "")) {
    parts.push(record.geo_region);
  }
  const cc = record.country_code?.toUpperCase();
  if (cc) {
    const country = COUNTRY_NAMES[cc];
    parts.push(country ? country[locale] : cc);
  }
  return parts.length ? parts.join(", ") : locale === "zh" ? "未知" : "Unknown";
}

/** 后台展示 IP 地区：中国 IP 显示省/市，不显示「中国」 */
export function geoLocationDisplay(record: GeoRecord, locale: Locale): string {
  const cc = record.country_code?.toUpperCase();
  const hasDetail =
    Boolean(record.geo_city?.trim()) ||
    Boolean(record.geo_region?.trim()) ||
    Boolean(record.geo_region_code?.trim());

  if (cc === "CN" || cc === "HK" || cc === "TW" || cc === "MO") {
    if (hasDetail) return formatCnLocation(record);
    return locale === "zh" ? "未知地区" : "Unknown region";
  }

  if (hasDetail) return formatIntlLocation(record, locale);
  return countryDisplayName(record.country_code, locale);
}

export function countryDisplayName(
  countryCode: string | null,
  locale: Locale
): string {
  if (!countryCode) {
    return locale === "zh" ? "未知" : "Unknown";
  }
  const code = countryCode.toUpperCase();
  const entry = COUNTRY_NAMES[code];
  if (entry) return entry[locale];
  return code;
}
