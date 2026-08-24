/**
 * 日语新课：把教案文件字节写到 lesson-{id} 并更新 jp_lesson.ref_key。
 * 单课替换与批量挂教案共用。
 */

import {
  getJpLessonById,
  syncJpLessonTitleByRefKey,
  updateJpLessonRefKey,
} from "@/lib/jp-lesson-db";
import {
  assignJpLessonsMaterialGroup,
  newJpLessonMaterialGroupId,
} from "@/lib/jp-lesson-material-group";
import {
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import {
  saveJpVocabRefFileMeta,
  updateJpVocabWordsRefKey,
} from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { jpLessonRefKey } from "@/lib/jp-vocab-ref-shared";
import type {
  CloudflareEnv,
  JpLessonRecord,
  JpVocabMediaType,
  JpVocabRef,
} from "@/lib/types";

export const JP_LESSON_REF_ATTACH_MAX_BYTES = 20 * 1024 * 1024;
export const JP_LESSON_REF_ATTACH_BATCH_MAX = 10;

export type AttachJpLessonRefFileOk = {
  ok: true;
  lesson: JpLessonRecord;
  ref: JpVocabRef;
  storage: string;
  view_path: string;
  ref_key: string;
};

export type AttachJpLessonRefFileResult =
  | AttachJpLessonRefFileOk
  | { ok: false; error: string };

export async function attachJpLessonRefFile(
  env: CloudflareEnv,
  lesson: JpLessonRecord,
  bytes: ArrayBuffer,
  opts: {
    mediaType: JpVocabMediaType;
    title?: string | null;
  }
): Promise<AttachJpLessonRefFileResult> {
  if (!bytes.byteLength) {
    return { ok: false, error: "empty_file" };
  }

  const lessonId = lesson.id;
  const targetRefKey = jpLessonRefKey(lessonId);
  const oldRefKey = lesson.ref_key;
  const title =
    opts.title != null && String(opts.title).trim()
      ? String(opts.title).trim()
      : lesson.title;

  const stored = await putJpVocabRefFile(
    env,
    targetRefKey,
    opts.mediaType,
    bytes
  );
  const ref = await saveJpVocabRefFileMeta(
    env.DB,
    targetRefKey,
    title,
    opts.mediaType,
    stored.r2_key
  );

  let updatedLesson = lesson;
  if (oldRefKey !== targetRefKey) {
    const next = await updateJpLessonRefKey(env.DB, lessonId, targetRefKey);
    if (!next) {
      return { ok: false, error: "update_failed" };
    }
    updatedLesson = next;

    if (lesson.completed && oldRefKey) {
      const items = parseLessonContent(lesson.content);
      const itemKinds = resolveJpLessonItemKinds(
        lesson.kind,
        items.length,
        lesson.grammar_item_count
      );
      const words: string[] = [];
      const grammars: string[] = [];
      items.forEach((word, index) => {
        if (itemKinds[index] === "grammar") grammars.push(word);
        else words.push(word);
      });
      if (words.length) {
        await updateJpVocabWordsRefKey(
          env.DB,
          words,
          "word",
          oldRefKey,
          targetRefKey
        );
      }
      if (grammars.length) {
        await updateJpVocabWordsRefKey(
          env.DB,
          grammars,
          "grammar",
          oldRefKey,
          targetRefKey
        );
      }
    }
  } else if (title !== lesson.title) {
    await syncJpLessonTitleByRefKey(env.DB, targetRefKey, title);
    updatedLesson = { ...updatedLesson, title, updated_at: ref.updated_at };
  } else {
    // 同 ref_key 覆盖文件时刷新 lesson 时间戳（列表 refs 靠 updated_at）
    const refreshed = await getJpLessonById(env.DB, lessonId);
    if (refreshed) updatedLesson = refreshed;
  }

  // 单课挂图：尚无教材组则自建一组（仅自己）；已有组保留（换图不拆组）
  if (!(updatedLesson.material_group_id || "").trim()) {
    const gid = newJpLessonMaterialGroupId();
    const assigned = await assignJpLessonsMaterialGroup(env.DB, [lessonId], gid);
    if (assigned.ok) {
      const withGroup = await getJpLessonById(env.DB, lessonId);
      if (withGroup) updatedLesson = withGroup;
      else updatedLesson = { ...updatedLesson, material_group_id: gid };
    }
  }

  return {
    ok: true,
    lesson: updatedLesson,
    ref,
    storage: stored.storage,
    view_path: `/api/jp-vocab/ref/${targetRefKey}`,
    ref_key: targetRefKey,
  };
}

/** 解析 multipart 里的 lesson_ids（JSON 数组或重复字段） */
export function parseJpLessonAttachBatchIds(
  form: FormData
): { ok: true; ids: number[] } | { ok: false; error: string } {
  const rawList = form.getAll("lesson_ids");
  const ids: number[] = [];
  const seen = new Set<number>();

  const pushId = (n: number) => {
    if (!Number.isInteger(n) || n <= 0) return;
    if (seen.has(n)) return;
    seen.add(n);
    ids.push(n);
  };

  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!Array.isArray(parsed)) {
          return { ok: false, error: "lesson_ids_invalid" };
        }
        for (const item of parsed) {
          pushId(Number(item));
        }
      } catch {
        return { ok: false, error: "lesson_ids_invalid" };
      }
      continue;
    }
    // 逗号分隔或单个数字
    for (const part of trimmed.split(/[,，\s]+/)) {
      if (!part) continue;
      pushId(Number(part));
    }
  }

  // 兼容 lesson_id 单字段
  const single = form.get("lesson_id");
  if (typeof single === "string" && single.trim()) {
    pushId(Number(single.trim()));
  }

  if (!ids.length) {
    return { ok: false, error: "lesson_ids_required" };
  }
  if (ids.length > JP_LESSON_REF_ATTACH_BATCH_MAX) {
    return { ok: false, error: "lesson_ids_too_many" };
  }
  return { ok: true, ids };
}
