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
