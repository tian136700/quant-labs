import { NextResponse } from "next/server";
import { APP_DEPLOY_VERSION } from "@/lib/app-deploy-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 公开、极轻：开标签页轮询检测是否有新部署。
 * 必须 no-store，否则 CDN/浏览器会一直看到旧版本戳。
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      version: APP_DEPLOY_VERSION,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
