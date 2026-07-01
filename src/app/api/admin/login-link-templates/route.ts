import { requireAdmin } from "@/lib/admin-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import {
  createLoginLinkTemplate,
  deleteLoginLinkTemplate,
  listLoginLinkTemplates,
  updateLoginLinkTemplate,
} from "@/lib/etr-login-link-template-db";

export async function GET(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const templates = await listLoginLinkTemplates(env.DB);
    return jsonResponse({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await request.json()) as {
      action?: string;
      id?: number;
      name?: string;
      body?: string;
      sort_order?: number;
    };

    if (body.action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return jsonResponse({ ok: false, error: "template_id_invalid" }, 400);
      }

      const result = await updateLoginLinkTemplate(env.DB, id, {
        name: body.name,
        body: body.body,
        sort_order:
          body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      });

      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true, template: result.template });
    }

    const name = typeof body.name === "string" ? body.name : "";
    const templateBody = typeof body.body === "string" ? body.body : "";
    const sortOrder =
      body.sort_order !== undefined ? Number(body.sort_order) : 0;

    const result = await createLoginLinkTemplate(
      env.DB,
      name,
      templateBody,
      sortOrder
    );
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse({ ok: true, template: result.template });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ ok: false, error: "template_id_invalid" }, 400);
    }

    const result = await deleteLoginLinkTemplate(env.DB, id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
