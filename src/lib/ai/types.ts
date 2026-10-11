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

/** Instant / AI-suggested polish chips shown after generate and in the builder. */
export type AiSuggestedAction = {
  id: string;
  label: string;
  description?: string;
  /** When set, applies a deterministic client fix without calling the model. */
  localAction?:
    | "compact_metadata"
    | "widen_notes"
    | "apply_type_widths"
    | "multiline_comments"
    | "ensure_signoff"
    | "questionnaire_columns";
  /** Natural-language refine instruction when the user wants another AI pass. */
  refinePrompt?: string;
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
  /** Recommended next tweaks for a fluid builder experience. */
  suggestedActions?: AiSuggestedAction[];
};

export type GenerateFormSchemaResult = {
  schema: import("@/types/forms").FormSchemaV1;
  extraction?: AiExtractionSummary;
};

export type RefineFormSchemaResult = {
  schema: import("@/types/forms").FormSchemaV1;
  summary?: string;
};
