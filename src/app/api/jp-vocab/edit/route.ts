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
    gloss_has_yakuwen_label: 'Do not write Japanese「訳文：」; use「译文：」+ Chinese only',
    gloss_not_chinese: "Gloss must be Chinese (no Japanese kana/sentences)",
    lemma_placeholder_in_sentence: "Do not leave ～ placeholders in examples",
    incomplete_kanji_furigana: "Every kanji needs furigana",
    i_adj_past_deshita: "i-adjective past uses です, not でした (no かったでした)",
    aida_fake_state_predicate:
      "Do not use Adj+間です for “I’m busy”; teach 間 as between/during (AとBの間 / ～の間)",
    gloss_aida_ni_as_after:
      "の間に means within/during, not “after” (❌一小时后 → ✅一小时内)",
    chuui_suru_wo_particle:
      "注意する takes に, not を (❌約束を注意 → ✅約束に注意)",
    soudan_particle_gloss_mismatch:
      "相談する: に＝向/找某人商量；と＝和某人一起商量 (don’t swap glosses)",
    missing_chinese_gloss: "Each example needs a 译文： line",
    missing_sentence_final_punct: "Japanese lines need sentence-final punctuation",
    need_more_japanese_lines: "Not enough example sentences",
    need_four_lines: "Example block incomplete",
    grammar_not_used: "Examples must use this grammar",
    invalid_japanese_line: "Invalid Japanese example line",
    related_compounds_word_only: "Related compounds are for words only",
    related_compounds_bad_line: "Each related compound line: 漢字(かな)：中文",
    related_compounds_too_many: "At most 5 related compounds",
    related_compounds_unrelated: "Related compounds must share this word’s kanji/reading",
    related_compounds_is_self: "Do not list the word itself as a related compound",
    related_compounds_gloss_not_chinese: "Related compound gloss must be Chinese",
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
    gloss_has_yakuwen_label: "译文不要写日文「訳文：」，只需「译文：」+中文",
    gloss_not_chinese: "译文须为中文，不能夹日语假名或日语句子",
    lemma_placeholder_in_sentence: "例句里不能写「～」占位，请换成具体内容",
    incomplete_kanji_furigana: "句中汉字须全部标注假名",
    i_adj_past_deshita: "一类形容词过去式后用「です／ですね」，不要叠「でした」（❌面白かったでした → ✅面白かったです）",
    aida_fake_state_predicate:
      "不要写「忙しい間です」这类假句；「間」须体现之间／期间（✅本とノートの間に…／会議の間…）",
    gloss_aida_ni_as_after:
      "「の間に」是之内／期间，不要译成「……后」（❌一小时后 → ✅一小时内）",
    chuui_suru_wo_particle:
      "「注意する」小心某事须接「に」（❌約束を注意 → ✅約束に注意／車に注意）",
    soudan_particle_gloss_mismatch:
      "「相談する」：に＝向/找某人商量；と＝和某人一起商量（译文勿与助词对调）",
    missing_chinese_gloss: "每条例句下一行须有「译文：」",
    missing_sentence_final_punct: "日语例句须有句末标点",
    need_more_japanese_lines: "例句条数不够",
    need_four_lines: "例句格式不完整",
    grammar_not_used: "例句须用到该语法",
    invalid_japanese_line: "日语例句格式无效",
    related_compounds_word_only: "相关构词仅用于单词",
    related_compounds_bad_line: "相关构词每行格式：漢字(かな)：中文",
    related_compounds_too_many: "相关构词最多 5 条",
    related_compounds_unrelated: "相关构词须含本词汉字或同一读音族",
    related_compounds_is_self: "不要把本词自己写成相关构词",
    related_compounds_gloss_not_chinese: "相关构词释义须为中文",
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
      related_compounds?: string | null;
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
        related_compounds: body.related_compounds,
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
