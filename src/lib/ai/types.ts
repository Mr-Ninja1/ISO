export type AiClarificationQuestion = {
  id: string;
  question: string;
  hint?: string;
  inputType?: "text" | "number" | "choice";
  options?: string[];
  defaultValue?: string;
};

export type AiAssessResult =
  | { status: "ready"; summary?: string }
  | { status: "needs_clarification"; summary?: string; questions: AiClarificationQuestion[] };

/** Post-generate information coverage for document import review. */
export type AiExtractionSummary = {
  summary: string;
  adaptations?: string[];
  uncertainItems?: string[];
  prefilledContent?: string[];
  staticItemCount?: number;
};

export type GenerateFormSchemaResult = {
  schema: import("@/types/forms").FormSchemaV1;
  extraction?: AiExtractionSummary;
};
