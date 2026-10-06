import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseAnalystRequest } from "@/lib/ai/request";
import { suggestionsFor } from "@/lib/ai/router";
import { getAIProvider } from "@/lib/providers/registry";
import { runAnalyst } from "@/server/ai/runAnalyst";
import { getStores } from "@/server/queries";
import { enforceRateLimit, RateLimitError } from "@/server/rateLimit";
import { requireOrg, type OrgContext } from "@/server/session";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * Route handlers must answer with JSON, not with the redirect that
 * requireOrg() issues for pages. So: check the session first (401), then let
 * requireOrg() resolve the membership and translate its redirect (a user
 * without an organization) into 403.
 */
async function apiContext(): Promise<{ ctx: OrgContext } | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { response: json({ error: "Not signed in." }, 401) };
  try {
    return { ctx: await requireOrg() };
  } catch (e) {
    const digest = typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) return { response: json({ error: "You are not a member of an organization." }, 403) };
    throw e;
  }
}

/** Context for the panel: what the current page is, which questions fit it, and which mode answers. */
export async function GET(req: Request) {
  const r = await apiContext();
  if ("response" in r) return r.response;
  const { ctx } = r;
  const raw = new URL(req.url).searchParams.get("pathname") ?? "";
  const pathname = /^\/[^\s]{0,300}$/.test(raw) ? raw : "/";
  const stores = await getStores(ctx.orgId);
  const storeId = /^\/stores\/([^/?#]+)/.exec(pathname)?.[1];
  const store = stores.find((s) => s.id === storeId) ?? null;
  const cities = [...new Set(stores.map((s) => s.city))];
  const exampleStores = cities.length >= 2 ? cities : stores.map((s) => s.name);
  const provider = getAIProvider();
  return json({
    mode: provider ? "llm" : "rules",
    provider: provider?.info.label ?? null,
    store: store ? { id: store.id, name: store.name, code: store.code } : null,
    organization: ctx.org.name,
    isDemo: ctx.org.isDemo,
    storeCount: stores.length,
    suggestions: suggestionsFor(pathname, store?.name, exampleStores),
  });
}

export async function POST(req: Request) {
  const r = await apiContext();
  if ("response" in r) return r.response;
  const { ctx } = r;

  const parsed = parseAnalystRequest(await req.text().catch(() => ""));
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  try {
    await enforceRateLimit("analyst", ctx.userId);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return json({ error: e.message, retryAfterSeconds: e.retryAfterSeconds }, 429, { "Retry-After": String(e.retryAfterSeconds) });
    }
    throw e;
  }

  try {
    return json(await runAnalyst(ctx, parsed.data.question, parsed.data.pathname));
  } catch (e) {
    console.error("[analyst]", e);
    return json({ error: "The analyst could not complete this request." }, 500);
  }
}
