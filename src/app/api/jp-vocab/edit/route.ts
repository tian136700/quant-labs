import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { updateJpVocabWordEntry } from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { redactJpVocabMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import type { JpVocabKind } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to edit.",
  zh: "请登录后再编辑。",
};

const ERR = {
  en: {
    word_required: "Word / grammar cannot be empty",
    word_duplicate: "This entry already exists",
    not_found: "Entry not found",
    usage_missing_level: "Each usage must end with (N5)/(N4)/…",
    usage_not_chinese: "Usage notes must be in Chinese",
    usage_has_connection: "Put conjugation in the connection field, not usage",
    invalid_numbering: "Usage must be numbered 1. 2. …",
    need_one_point: "Grammar needs at least one usage",
    empty: "Usage cannot be empty",
  },
  zh: {
    word_required: "单词 / 语法不能为空",
    word_duplicate: "该词条已存在",
    not_found: "未找到该词条",
    usage_missing_level: "每条用法句末须标注 (N5)/(N4) 等等级",
    usage_not_chinese: "用法须为中文说明",
    usage_has_connection: "用法正文不要写接续；接续请填在接序栏",
    invalid_numbering: "用法须用 1. 2. 编号",
    need_one_point: "语法至少写一条用法",
    empty: "用法不能为空",
  },
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      word_id?: number;
      kind?: JpVocabKind;
      word?: string;
      reading?: string | null;
      meaning?: string | null;
      pos?: string | null;
      class_notes?: string | null;
      mnemonic?: string | null;
      example_sentences?: string | null;
      usage?: string | null;
      connection?: string | null;
    };

    const wordId = Number(body.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    const { isAdmin } = await requireAdmin(request);
    if (body.mnemonic !== undefined && !isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const result = await updateJpVocabWordEntry(
      env.DB,
      wordId,
      {
        kind: body.kind,
        word: body.word,
        reading: body.reading,
        meaning: body.meaning,
        pos: body.pos,
        class_notes: body.class_notes,
        example_sentences: body.example_sentences,
        usage: body.usage,
        connection: body.connection,
        ...(isAdmin && body.mnemonic !== undefined
          ? { mnemonic: body.mnemonic }
          : {}),
      },
      user.username
    );

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

    return jsonResponse({
      ok: true,
      word: redactJpVocabMnemonicForClient(result.word, isAdmin),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
