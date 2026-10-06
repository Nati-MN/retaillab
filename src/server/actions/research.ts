"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RESEARCH_RADII } from "@/lib/research/findings";
import { formToObject, safeAction, type ActionState } from "../action";
import { runLocationResearch } from "../research/run";
import { requireWriter } from "../session";

const schema = z.object({
  storeId: z.string().min(1, "Choose a store."),
  radiusM: z.coerce.number().refine((r) => (RESEARCH_RADII as readonly number[]).includes(r), "Choose one of the listed radii."),
  query: z.string().max(300).optional(),
});

export interface ResearchActionData {
  status: "UNAVAILABLE";
  reason: string;
}

/**
 * Runs location research for one store. On success redirects to the stored
 * result; when research is unavailable it returns the reason and stores nothing.
 */
export async function runResearchAction(_prev: ActionState<ResearchActionData>, formData: FormData): Promise<ActionState<ResearchActionData>> {
  return safeAction<ResearchActionData>(async () => {
    const input = schema.parse(formToObject(formData));
    const ctx = await requireWriter();
    const outcome = await runLocationResearch(ctx, input.storeId, input.radiusM, input.query);
    if (outcome.status === "UNAVAILABLE") return { data: { status: "UNAVAILABLE", reason: outcome.reason } };
    revalidatePath("/research");
    revalidatePath("/map");
    revalidatePath(`/stores/${input.storeId}`);
    redirect(`/research?store=${input.storeId}&result=${outcome.resultId}`);
  });
}
