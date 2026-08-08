import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  getJpLessonBoardDocxMeta,
  listJpLessonsNeedingBoardDocx,
  markJpLessonBoardDocxUploaded,
} from "@/lib/jp-lesson-board-docx-db";
import {
  getJpLessonBoardDocxBytes,
  putJpLessonBoardDocxFile,
} from "@/lib/jp-lesson-board-docx-server";
import { jpLessonRefDownloadBasename } from "@/lib/jp-vocab-ref-shared";
import { requireJpLessonRead } from "@/lib/jp-lesson-auth";
import { verifyUploadAuth } from "@/lib/jp-review";

const MAX_BYTES = 25 * 1024 * 1024;
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * 日语新课板书 Word（含 OJAD 读音）
 * - POST list_missing / upload：Bearer JP_REVIEW_UPLOAD_TOKEN（Mac 定时）
 * - GET ?lesson_id=&download=1：已登录可读日语新课 → 下预生成文件
 */
export async function GET(request: Request) {
  try {
    const { env, allowed } = await requireJpLessonRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "Forbidden" }, 403);
    }

    const url = new URL(request.url);
    const lessonId = Number(url.searchParams.get("lesson_id") || "");
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_required" }, 400);
    }

    const meta = await getJpLessonBoardDocxMeta(env.DB, lessonId);
    if (!meta) {
      return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);
    }

    const wantDownload =
      url.searchParams.get("download") === "1" ||
      url.searchParams.get("download") === "true";

    if (!wantDownload) {
      return jsonResponse({
        ok: true,
        lesson_id: meta.lesson_id,
        ready: Boolean(meta.board_docx_r2_key),
        board_docx_r2_key: meta.board_docx_r2_key,
        board_docx_fingerprint: meta.board_docx_fingerprint,
        board_docx_updated_at: meta.board_docx_updated_at,
      });
    }

    if (!meta.board_docx_r2_key) {
      return jsonResponse({ ok: false, error: "board_docx_not_ready" }, 404);
    }

    const bytes = await getJpLessonBoardDocxBytes(
      env,
      meta.board_docx_r2_key,
      lessonId
    );
    if (!bytes?.byteLength) {
      return jsonResponse({ ok: false, error: "board_docx_missing_file" }, 404);
    }

    const basename = jpLessonRefDownloadBasename({
      id: meta.lesson_id,
      kind: meta.kind === "grammar" ? "grammar" : "word",
      content: meta.content,
    });
    const filename = `${basename}-分页-读音.docx`;
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": DOCX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();
    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const mode = String(form.get("mode") || "upload").trim();
      if (mode !== "upload") {
        return jsonResponse({ ok: false, error: "invalid_mode" }, 400);
      }
      const lessonId = Number(form.get("lesson_id") || "");
      const fingerprint = String(form.get("fingerprint") || "").trim();
      const file = form.get("file");
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return jsonResponse({ ok: false, error: "lesson_id_required" }, 400);
      }
      if (!fingerprint) {
        return jsonResponse({ ok: false, error: "fingerprint_required" }, 400);
      }
      if (!(file instanceof File) || file.size <= 0) {
        return jsonResponse({ ok: false, error: "file_required" }, 400);
      }
      if (file.size > MAX_BYTES) {
        return jsonResponse({ ok: false, error: "File too large (max 25MB)" }, 413);
      }
      const bytes = await file.arrayBuffer();
      const stored = await putJpLessonBoardDocxFile(env, lessonId, bytes);
      const lesson = await markJpLessonBoardDocxUploaded(env.DB, lessonId, {
        r2Key: stored.r2_key,
        fingerprint,
      });
      if (!lesson) {
        return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);
      }
      return jsonResponse({
        ok: true,
        mode: "upload",
        lesson_id: lessonId,
        r2_key: stored.r2_key,
        storage: stored.storage,
        fingerprint,
        board_docx_updated_at: lesson
          ? (
              await getJpLessonBoardDocxMeta(env.DB, lessonId)
            )?.board_docx_updated_at ?? null
          : null,
      });
    }

    let body: {
      mode?: string;
      limit?: number;
      lesson_id?: number;
      fingerprint?: string;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      /* empty → list_missing */
    }

    const mode = (body.mode || "list_missing").trim();
    if (mode === "list_missing") {
      const missing = await listJpLessonsNeedingBoardDocx(
        env.DB,
        typeof body.limit === "number" ? body.limit : 10
      );
      return jsonResponse({
        ok: true,
        mode: "list_missing",
        missing,
        total_missing: missing.length,
      });
    }

    return jsonResponse(
      { ok: false, error: "use_multipart_for_upload_or_list_missing" },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
