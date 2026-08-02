import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * 默认 incrementalCache=dummy → 每次文档请求都进 NextServer（handler.mjs），
 * force-static 壳仍显示 x-nextjs-cache: MISS，冷/忙 isolate 易整页 Error 1102。
 *
 * Static Assets 只读缓存 + cache interception：预渲染路由从 ASSETS 取壳，
 * 尽量不加载页面 JS。本站无 revalidatePath/Tag / ISR 写回，适合只读方案。
 * 见 .cursor/rules/vocab-study-page-html-1102.mdc
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
