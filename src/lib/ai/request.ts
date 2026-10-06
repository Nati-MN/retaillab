import { z } from "zod";

/** Body of POST /api/analyst. Pure so the validation is unit-tested. */
export const MAX_QUESTION_LENGTH = 500;

export const analystRequestSchema = z
  .object({
    question: z
      .string({ required_error: "question is required", invalid_type_error: "question must be a string" })
      .trim()
      .min(1, "Ask a question.")
      .max(MAX_QUESTION_LENGTH, `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`),
    pathname: z
      .string()
      .max(300)
      .regex(/^\/[^\s]*$/, "pathname must be an app path")
      .optional(),
  })
  .strict();

export type AnalystRequest = z.infer<typeof analystRequestSchema>;

export type ParsedAnalystRequest =
  | { ok: true; data: AnalystRequest }
  | { ok: false; status: 400; error: string };

/** Parses a raw request body (text). Never throws. */
export function parseAnalystRequest(raw: string): ParsedAnalystRequest {
  if (raw.length > 4_000) return { ok: false, status: 400, error: "Request body is too large." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "Request body must be JSON." };
  }
  const parsed = analystRequestSchema.safeParse(json);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  return { ok: true, data: parsed.data };
}
