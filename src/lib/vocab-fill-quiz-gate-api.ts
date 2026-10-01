import "server-only";

import { jsonResponse } from "@/lib/cloudflare-env";
import {
  evaluateJpVocabFillScheduleGate,
  type JpVocabFillScheduleGateResult,
} from "@/lib/jp-vocab-fill-schedule-gate";

/**
 * fill-* 热路径：Mac stage 开跑前已查门禁，但 batch 中途老师开抽时仍会打
 * fill-next / pitch。每次请求再查一次；quiet 时返回空候选 / 空列表，勿再扫 D1 重活。
 */
export async function vocabFillQuietGateOrNull(
  db: D1Database
): Promise<JpVocabFillScheduleGateResult | null> {
  const gate = await evaluateJpVocabFillScheduleGate(db);
  return gate.quiet ? gate : null;
}

export function vocabFillNextCandidateQuietResponse(
  gate: JpVocabFillScheduleGateResult
) {
  return jsonResponse({
    ok: true,
    mode: "next_candidate",
    candidate: null,
    quiz_gate_quiet: true,
    quiz_gate_reason: gate.reason,
    quiz_gate_detail: gate.detail,
  });
}

export function vocabFillListMissingQuietResponse(
  gate: JpVocabFillScheduleGateResult,
  mode: string
) {
  return jsonResponse({
    ok: true,
    mode,
    items: [],
    updates: [],
    quiz_gate_quiet: true,
    quiz_gate_reason: gate.reason,
    quiz_gate_detail: gate.detail,
  });
}

export function vocabFillApplyQuietResponse(gate: JpVocabFillScheduleGateResult) {
  return jsonResponse(
    {
      ok: false,
      error: "quiz_gate_quiet",
      reason: gate.reason,
      detail: gate.detail,
    },
    503
  );
}
