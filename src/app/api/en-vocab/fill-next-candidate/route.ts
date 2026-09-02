import { vocabFillRouteErrorResponse } from "@/lib/vocab-fill-route-error";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { pickNextEnVocabFillCandidate } from "@/lib/en-vocab-fill-next-candidate";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillNextCandidateBody = {
  mode?: "next_candidate";
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const limited = await enforceVocabFillRouteRateLimit(
      env.DB,
      request,
      "/api/en-vocab/fill-next-candidate"
    );
    if (limited) return limited;

    let body: FillNextCandidateBody = {};
    try {
      body = (await request.json()) as FillNextCandidateBody;
    } catch {
      /* empty body → next_candidate */
    }

    if (body.mode && body.mode !== "next_candidate") {
      return jsonResponse({ ok: false, error: "unsupported_mode" }, 400);
    }

    const candidate = await pickNextEnVocabFillCandidate(env.DB);
    return jsonResponse({
      ok: true,
      mode: "next_candidate",
      candidate,
    });
  } catch (err) {
    return vocabFillRouteErrorResponse(request, err);
  }
}
