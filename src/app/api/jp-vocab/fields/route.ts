import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { updateJpVocabWordFields } from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";

const AUTH_MSG = {
  en: "Please log in to edit.",
  zh: "请登录后再编辑。",
};

const ERR = {
  en: {
    word_required: "Word / grammar cannot be empty",
    word_duplicate: "This entry already exists",
    not_found: "Entry not found",
  },
  zh: {
    word_required: "单词 / 语法不能为空",
    word_duplicate: "该词条已存在",
    not_found: "未找到该词条",
  },
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      word_id?: number;
      word?: string;
      meaning?: string | null;
      pos?: string | null;
    };

    const wordId = Number(body.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    if (
      body.word === undefined &&
      body.meaning === undefined &&
      body.pos === undefined
    ) {
      return jsonResponse({ ok: false, error: "fields_required" }, 400);
    }

    const fields: { word?: string; meaning?: string | null; pos?: string | null } = {};
    if (body.word !== undefined) fields.word = body.word;
    if (body.meaning !== undefined) fields.meaning = body.meaning;
    if (body.pos !== undefined) fields.pos = body.pos;

    const result = await updateJpVocabWordFields(env.DB, wordId, fields);

    if (!result.ok) {
      const msg = ERR[locale][result.error as keyof (typeof ERR)["zh"]];
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "word_duplicate" || result.error === "word_required"
            ? 400
            : 400;
      return jsonResponse({ ok: false, error: msg || result.error }, status);
    }

    return jsonResponse({ ok: true, word: result.word });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
