import type { FormType } from "@/types/forms";

export type ExamplePrompt = {
  id: string;
  formType: FormType;
  label: string;
  prompt: string;
};

export const AI_WELCOME_MESSAGE =
  "Describe the form you need — the more specific, the better the draft. You can also attach a photo or PDF of an existing paper form.";

/** Always-visible guide in the form builder AI modal. */
export const AI_FORM_BUILDER_GUIDE: ExamplePrompt = {
  id: "guide-featured",
  formType: "custom",
  label: "Example prompt",
  prompt:
    "Daily fridge temperature log: header with Location and Date, table with 12 rows, columns Time | Temperature (°C) | Initials | Verified by (signature)",
};

export const AI_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: "temp-log",
    formType: "custom",
    label: "Temperature log",
    prompt:
      "Daily fridge temperature log: header with Location + Date, table with 12 rows, columns Time | Temperature (°C) | Initials | Verified by (signature)",
  },
  {
    id: "opening-checklist",
    formType: "checklist",
    label: "Opening checklist",
    prompt:
      "Kitchen opening checklist: 15 rows, columns Task | OK? (yes/no) | Notes | Photo evidence, header with Date and Shift",
  },
  {
    id: "closing-walkthrough",
    formType: "checklist",
    label: "Closing walkthrough",
    prompt:
      "Store closing safety walkthrough: 20 checklist rows with Task, Pass/Fail yes-no, Comments, and Photo for failures",
  },
  {
    id: "staff-feedback",
    formType: "questionnaire",
    label: "Staff feedback",
    prompt:
      "Anonymous staff feedback questionnaire: 8 questions mixing yes/no, rating text, and open comments — no data table",
  },
  {
    id: "incident-report",
    formType: "questionnaire",
    label: "Incident report",
    prompt:
      "Workplace incident report: fields for Date, Location, Description, Witnesses, Injury yes/no, Photo evidence, Reporter signature",
  },
  {
    id: "site-inspection",
    formType: "inspection",
    label: "Site inspection",
    prompt:
      "Monthly site safety inspection: header Site + Inspector + Date, 10-row table Item | Frequency | Status (yes/no) | Notes | Photo, footer supervisor signature",
  },
  {
    id: "equipment-audit",
    formType: "inspection",
    label: "Equipment audit",
    prompt:
      "Fire equipment inspection log: header Location and Date, table with 8 rows — Equipment | Last checked | Condition OK? | Action needed | Photo",
  },
  {
    id: "training-quiz",
    formType: "answer-sheet",
    label: "Training quiz",
    prompt:
      "Food hygiene training quiz: 10 written-answer questions with space for multiline responses, header Name and Date",
  },
  {
    id: "visitor-signin",
    formType: "handwritten",
    label: "Visitor sign-in",
    prompt:
      "Visitor sign-in sheet: table with 8 rows, columns Visitor name | Company | Time in | Time out | Signature",
  },
  {
    id: "delivery-log",
    formType: "custom",
    label: "Delivery log",
    prompt:
      "Goods-in delivery log: header Supplier and Date, 10-row table Product | Batch | Temp check | Accepted yes/no | Receiver initials",
  },
];

export function getExamplesByFormType(formType?: FormType): ExamplePrompt[] {
  if (!formType) return AI_EXAMPLE_PROMPTS;
  const typed = AI_EXAMPLE_PROMPTS.filter((e) => e.formType === formType);
  return typed.length > 0 ? typed : AI_EXAMPLE_PROMPTS;
}

/** Suggest an example when the user has typed a short or vague prompt. */
export function getSuggestionForPartialPrompt(text: string): ExamplePrompt | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 40) return null;

  const keywords: Array<{ match: RegExp; id: string }> = [
    { match: /temp|fridge|cold|freezer/, id: "temp-log" },
    { match: /checklist|opening|closing|walk/, id: "opening-checklist" },
    { match: /question|survey|feedback|quiz/, id: "staff-feedback" },
    { match: /inspect|audit|safety/, id: "site-inspection" },
    { match: /train|quiz|answer/, id: "training-quiz" },
    { match: /sign|visitor|handwritten/, id: "visitor-signin" },
    { match: /deliver|goods|supplier/, id: "delivery-log" },
    { match: /incident|accident/, id: "incident-report" },
  ];

  for (const { match, id } of keywords) {
    if (match.test(trimmed)) {
      return AI_EXAMPLE_PROMPTS.find((e) => e.id === id) ?? null;
    }
  }

  return null;
}
