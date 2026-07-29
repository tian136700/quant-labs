import { sanitizeJpVocabWordExampleSentences } from "@/lib/jp-vocab-example-sentences";
import type { JpVocabWord } from "@/lib/types";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";

/** 页面可见时增量拉取间隔（备注等多端实时同步） */
export const JP_VOCAB_POLL_MS = 5_000;

/** 标签页在后台时降频，避免浪费 Worker 配额 */
export const JP_VOCAB_POLL_HIDDEN_MS = 20_000;

/** 老师抽查卡片：学生是否自行查看 */
export const JP_VOCAB_QUIZ_LIVE_POLL_MS = 8_000;

/** 学生端：老师当前抽查词提示（比老师端更慢） */
export const JP_VOCAB_STUDY_QUIZ_LIVE_POLL_MS = 15_000;

/** 学生端：老师当前抽查词提示（后台） */
export const JP_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS = 45_000;

/** 今日抽查目标跨域名同步（D1 读取，不必与词条补丁同频） */
export const JP_VOCAB_TEACHER_VISIBLE_POLL_MS = 30_000;

/** 学生复习页：共享列表轮询（可见 5s，课堂勾选后尽快弹卡；≥ 下限 JP_VOCAB_POLL_MS） */
export const JP_VOCAB_STUDY_POLL_MS = 5_000;

/** 学生复习页：后台轮询 */
export const JP_VOCAB_STUDY_POLL_HIDDEN_MS = 45_000;

/** 学生复习页：每隔 N 次列表轮询再拉一次抽查进度 */
export const JP_VOCAB_STUDY_QUIZ_EVERY_N = 12;

/** 老师今日抽查已全部完成：词条增量同步（可见 / 后台） */
export const JP_VOCAB_POLL_IDLE_COMPLETE_MS = 120_000;

export const JP_VOCAB_POLL_IDLE_COMPLETE_HIDDEN_MS = 300_000;

/** 老师今日抽查已全部完成：今日抽查目标跨域同步 */
export const JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS = 300_000;

/** 老师今日抽查已全部完成：学生「请老师发送」轮询 */
export const JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_MS = 120_000;

export const JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_HIDDEN_MS = 300_000;

/** 按夜间静默 / 测试账号 /「今日已抽完」选择轮询间隔 */
export function jpVocabPollIntervalMs(
  activeMs: number,
  hiddenMs: number,
  idleCompleteMs: number,
  idleCompleteHiddenMs: number,
  idleComplete: boolean,
  opts?: { username?: string | null }
): number {
  return resolveVocabPollIntervalMs({
    activeMs,
    hiddenMs,
    idleCompleteMs,
    idleCompleteHiddenMs,
    idleComplete,
    username: opts?.username,
  });
}

export function maxJpVocabUpdatedAt(words: JpVocabWord[]): string {
  let max = "";
  for (const w of words) {
    if (w.updated_at > max) max = w.updated_at;
  }
  return max;
}

/** 用服务端较新的词条补丁合并本地列表（按 updated_at）；顺带规范化例句译义行 */
export function mergeJpVocabSyncPatches(
  current: JpVocabWord[],
  patches: JpVocabWord[]
): JpVocabWord[] {
  if (!patches.length) return current;
  const byId = new Map(patches.map((w) => [w.id, w]));
  return current.map((w) => {
    const patch = byId.get(w.id);
    if (!patch || patch.updated_at <= w.updated_at) {
      return sanitizeJpVocabWordExampleSentences(w);
    }
    return sanitizeJpVocabWordExampleSentences({ ...w, ...patch });
  });
}
