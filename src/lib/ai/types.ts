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
  | { status: "needs_clarification"; summary?: string; questions: AiClarificationQuestion[] }
  | { status: "rejected"; summary: string; suggestion?: string };

export type AiDocumentAnalysis = {
  pagesInspected?: number;
  tablesDetected?: number;
  controlsDetected?: number;
  confidence?: number;
  coverage?: "complete" | "partial" | "uncertain";
  omittedContent?: string[];
};

/** Post-generate information coverage for document import review. */
export type AiExtractionSummary = {
  summary: string;
  analysis?: AiDocumentAnalysis;
  adaptations?: string[];
  uncertainItems?: string[];
  prefilledContent?: string[];
  staticItemCount?: number;
  /** Labels of grid columns marked as static text (for clear user guidance). */
  staticColumns?: string[];
};

export type GenerateFormSchemaResult = {
  schema: import("@/types/forms").FormSchemaV1;
  extraction?: AiExtractionSummary;
};
