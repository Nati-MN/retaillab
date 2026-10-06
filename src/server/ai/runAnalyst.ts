import "server-only";
import { blocksForResult, composeAnswer, type ToolFailure } from "@/lib/ai/compose";
import { filterForAI } from "@/lib/ai/privacy";
import { exampleQuestionsFor, routeQuestion } from "@/lib/ai/router";
import type { AnalystResponse, Block, ToolCallRecord, ToolName, ToolResult } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/providers/registry";
import type { AIMessage, AIProvider } from "@/lib/providers/types";
import { getStores } from "../queries";
import type { OrgContext } from "../session";
import { executeTool, ToolInputError, toolSpecs } from "./tools";

/**
 * Answers one question.
 *
 * - No AIProvider (this build): the deterministic router picks the tools, the
 *   tools run, and a pure composer formats the results. mode = "rules".
 * - With an AIProvider: the model may only choose tools and phrase the answer.
 *   It receives tool output after `filterForAI` (organization privacy
 *   settings); the numbers shown to the user still come from the unfiltered
 *   tool results via the same composer. mode = "llm".
 */
export async function runAnalyst(ctx: OrgContext, question: string, pathname?: string | null): Promise<AnalystResponse> {
  const provider = getAIProvider();
  if (provider) {
    try {
      return await runWithProvider(provider, ctx, question, pathname);
    } catch (e) {
      console.error("[analyst] provider failed, falling back to rules", e);
    }
  }
  return runWithRules(ctx, question, pathname);
}

type StoreNames = ReadonlyMap<string, string>;

/** Store ids in tool parameters are shown as "Name (CODE)" so the disclosure is readable. */
function labelInput(input: Record<string, unknown>, names: StoreNames): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && names.has(v)) out[k] = names.get(v)!;
    else if (Array.isArray(v) && v.some((x) => typeof x === "string" && names.has(x))) out[k] = v.map((x) => (typeof x === "string" ? names.get(x) ?? x : String(x))).join(", ");
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function runOne(ctx: OrgContext, tool: string, input: unknown, names: StoreNames): Promise<{ record: ToolCallRecord; outcome: ToolResult | ToolFailure }> {
  try {
    const out = await executeTool(ctx, tool, input);
    return {
      record: { tool: tool as ToolName, description: out.description, input: out.input, inputLabels: labelInput(out.input, names), dataWindow: out.dataWindow, ok: true },
      outcome: out.result,
    };
  } catch (e) {
    if (!(e instanceof ToolInputError)) console.error("[analyst] tool failed", tool, e);
    const error = e instanceof ToolInputError ? e.message : "An internal error occurred while reading the data.";
    return {
      record: { tool: tool as ToolName, description: "", input: (input ?? {}) as Record<string, unknown>, dataWindow: "Nothing was read", ok: false, error },
      outcome: { tool, error },
    };
  }
}

async function runWithRules(ctx: OrgContext, question: string, pathname?: string | null): Promise<AnalystResponse> {
  const stores = await getStores(ctx.orgId);
  const lite = stores.map((s) => ({ id: s.id, name: s.name, code: s.code, city: s.city }));
  const names = new Map(stores.map((s) => [s.id, `${s.name} (${s.code})`]));
  const plan = routeQuestion(question, { pathname, stores: lite });
  const toolCalls: ToolCallRecord[] = [];
  const outcomes: (ToolResult | ToolFailure)[] = [];
  for (const c of plan.calls) {
    const { record, outcome } = await runOne(ctx, c.tool, c.input, names);
    toolCalls.push(record);
    outcomes.push(outcome);
  }
  const blocks = composeAnswer(plan, outcomes, { currency: ctx.org.currency }, exampleQuestionsFor(lite));
  return { mode: "rules", blocks, toolCalls };
}

const MAX_ROUNDS = 3;
const MAX_CALLS = 6;

/** Not reachable in this build (getAIProvider() returns null). Kept small and explicit so a provider can be dropped in. */
async function runWithProvider(provider: AIProvider, ctx: OrgContext, question: string, pathname?: string | null): Promise<AnalystResponse> {
  const stores = await getStores(ctx.orgId);
  const settings = { aiIncludeFinancials: ctx.org.aiIncludeFinancials, aiIncludeStoreNames: ctx.org.aiIncludeStoreNames, aiIncludeResearch: ctx.org.aiIncludeResearch };
  const known = stores.map((s) => ({ name: s.name, code: s.code }));
  const names = new Map(stores.map((s) => [s.id, `${s.name} (${s.code})`]));
  const forAI = (v: unknown) => filterForAI(v, settings, known).value;
  const messages: AIMessage[] = [
    {
      role: "user",
      // The question itself is the user's own text; store names in it are replaced like everywhere else.
      content: String(forAI(`${question}${pathname ? `\n(Current page: ${pathname.replace(/\/stores\/[^/]+/, "/stores/<current store>")})` : ""}`)),
    },
  ];
  const toolCalls: ToolCallRecord[] = [];
  const blocks: Block[] = [];
  let text: string | undefined;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const plan = await provider.plan(messages, toolSpecs());
    if (plan.toolCalls.length === 0) {
      text = plan.text;
      break;
    }
    for (const c of plan.toolCalls) {
      if (toolCalls.length >= MAX_CALLS) break;
      const { record, outcome } = await runOne(ctx, c.name, c.input, names);
      toolCalls.push(record);
      messages.push({ role: "tool", toolName: c.name, content: JSON.stringify(forAI(outcome)) });
      if (!("error" in outcome)) blocks.push(...blocksForResult(outcome, { currency: ctx.org.currency }));
    }
  }
  if (toolCalls.length === 0) return runWithRules(ctx, question, pathname);
  return {
    mode: "llm",
    blocks: [
      ...(text ? [{ type: "text" as const, tone: "interpretation" as const, text: `Wording by ${provider.info.label} (language model). The figures below come from the tools, not from the model.\n${text}` }] : []),
      ...blocks,
    ],
    toolCalls,
  };
}
