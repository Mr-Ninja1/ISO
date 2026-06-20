"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  HelpCircle,
  ImageIcon,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import type { AiClarificationQuestion } from "@/lib/ai/types";
import { DC_AI_SHORT } from "@/lib/ai/deepControl";
import {
  AI_EXAMPLE_PROMPTS,
  AI_FORM_BUILDER_GUIDE,
  getSuggestionForPartialPrompt,
  type ExamplePrompt,
} from "@/lib/ai/examplePrompts";
import { getFormBuilderConfig } from "@/lib/formBuilderConfig";
import type { FormType } from "@/types/forms";

export type AiChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachmentName?: string;
  isTyping?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  generating: boolean;
  step: "input" | "clarify";
  messages: AiChatMessage[];
  prompt: string;
  onPromptChange: (value: string) => void;
  imageFile: File | null;
  onImageChange: (file: File | null) => void;
  questions: AiClarificationQuestion[];
  answers: Record<string, string>;
  onAnswersChange: (answers: Record<string, string>) => void;
  assessSummary: string;
  onSend: () => void;
  onGenerate: () => void;
  onBack: () => void;
  onExampleSelect: (example: ExamplePrompt) => void;
  aiQuota?: {
    used: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
  } | null;
};

function MessageBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === "user";

  if (message.isTyping) {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md border border-foreground/10 bg-foreground/[0.04] px-4 py-3">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-foreground/50">Thinking…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[min(100%,20rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[85%] " +
          (isUser
            ? "rounded-br-md bg-[var(--hse-teal)] text-white"
            : "rounded-bl-md border border-foreground/10 bg-foreground/[0.04] text-foreground")
        }
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.attachmentName ? (
          <div
            className={
              "mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] " +
              (isUser ? "bg-white/20 text-white/90" : "bg-foreground/5 text-foreground/60")
            }
          >
            <Paperclip className="h-3 w-3" />
            {message.attachmentName}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExampleChip({
  example,
  onSelect,
  disabled,
}: {
  example: ExamplePrompt;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const config = getFormBuilderConfig(example.formType);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="group flex w-full items-start gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-left transition-colors hover:border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_5%,white)] disabled:opacity-50"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)] opacity-70 group-hover:opacity-100" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{example.label}</span>
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/50">
            {config.label}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/55">{example.prompt}</p>
      </div>
    </button>
  );
}

export function AiFormChatModal({
  open,
  onClose,
  generating,
  step,
  messages,
  prompt,
  onPromptChange,
  imageFile,
  onImageChange,
  questions,
  answers,
  onAnswersChange,
  assessSummary,
  onSend,
  onGenerate,
  onBack,
  onExampleSelect,
  aiQuota,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showHints, setShowHints] = useState(false);

  const suggestion = step === "input" ? getSuggestionForPartialPrompt(prompt) : null;
  const canSend = (prompt.trim().length > 0 || imageFile) && !generating;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step, generating, showHints]);

  useEffect(() => {
    if (!open) setShowHints(false);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step === "input" && canSend) onSend();
    }
  }

  function handleFileSelect(file: File | null) {
    onImageChange(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const groupedExamples = AI_EXAMPLE_PROMPTS.reduce(
    (acc, ex) => {
      if (!acc[ex.formType]) acc[ex.formType] = [];
      acc[ex.formType].push(ex);
      return acc;
    },
    {} as Record<FormType, ExamplePrompt[]>,
  );

  return (
    <CenteredOverlay open={open} maxWidthClass="max-w-lg" zIndexClass="z-[110]" onClose={onClose}>
      <div className="flex max-h-[min(90dvh,720px)] min-h-0 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-foreground/10 bg-gradient-to-r from-[color-mix(in_srgb,var(--hse-teal)_12%,white)] to-background px-3 py-3 sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{DC_AI_SHORT} · Form builder</div>
              <div className="truncate text-[11px] text-foreground/55">
                {step === "clarify"
                  ? "Step 2 of 2 — answer a few questions"
                  : "Step 1 of 2 — describe it, attach a photo, or both"}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {aiQuota && !aiQuota.unlimited ? (
              <span
                className={
                  "hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline " +
                  (aiQuota.remaining <= 0
                    ? "bg-red-100 text-red-800"
                    : aiQuota.remaining <= 1
                      ? "bg-amber-100 text-amber-900"
                      : "bg-foreground/[0.06] text-foreground/60")
                }
              >
                {aiQuota.remaining} credit{aiQuota.remaining === 1 ? "" : "s"} left
              </span>
            ) : null}
            <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          {step === "input" ? (
            <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] p-3">
              <div className="flex items-start gap-2">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hse-teal)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground/85">
                    {AI_FORM_BUILDER_GUIDE.label}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/65">
                    {AI_FORM_BUILDER_GUIDE.prompt}
                  </p>
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => onExampleSelect(AI_FORM_BUILDER_GUIDE)}
                    className="mt-2 inline-flex h-7 items-center rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)] bg-white px-3 text-[11px] font-medium text-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] disabled:opacity-50"
                  >
                    Use this example
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>

          {step === "clarify" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)] bg-background shadow-sm">
              <div className="border-b border-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--hse-teal)]">
                  Questions for you
                </div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">
                  Before I make the form
                </div>
                {assessSummary ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">{assessSummary}</p>
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
                    A few quick answers help me build the right layout for you.
                  </p>
                )}
              </div>

              <div className="space-y-4 p-4">
                {questions.map((q, index) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"
                  >
                    <div className="flex gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--hse-teal)] text-[11px] font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label className="block text-sm font-medium text-foreground">{q.question}</label>
                        {q.hint ? (
                          <p className="mt-0.5 text-[11px] text-foreground/55">{q.hint}</p>
                        ) : null}
                        {q.inputType === "choice" && q.options?.length ? (
                          <select
                            className="mt-2 h-9 w-full rounded-lg border border-foreground/15 bg-background px-2 text-sm"
                            value={answers[q.id] || ""}
                            disabled={generating}
                            onChange={(e) =>
                              onAnswersChange({ ...answers, [q.id]: e.target.value })
                            }
                          >
                            <option value="">Choose an option…</option>
                            {q.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={q.inputType === "number" ? "number" : "text"}
                            className="mt-2 h-9 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm"
                            placeholder="Type your answer…"
                            value={answers[q.id] || ""}
                            disabled={generating}
                            onChange={(e) =>
                              onAnswersChange({ ...answers, [q.id]: e.target.value })
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-foreground/10 px-4 py-3">
                <button
                  type="button"
                  className="text-xs font-medium text-foreground/55 underline hover:text-foreground"
                  disabled={generating}
                  onClick={onBack}
                >
                  ← Back to description
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--hse-teal)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={generating}
                  onClick={onGenerate}
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generating ? "Building your form…" : "Generate my form"}
                </button>
              </div>
            </div>
          ) : null}

          <div ref={chatEndRef} />
        </div>

        {/* Hints panel */}
        {showHints && step === "input" ? (
          <div className="border-t border-foreground/10 bg-foreground/[0.02] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground/70">Example prompts</span>
              <span className="text-[10px] text-foreground/45">Tap to use · be specific for best results</span>
            </div>
            <div className="max-h-48 space-y-3 overflow-y-auto">
              {(Object.entries(groupedExamples) as [FormType, ExamplePrompt[]][]).map(
                ([type, examples]) => (
                  <div key={type}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      {getFormBuilderConfig(type).label}
                    </div>
                    <div className="space-y-1.5">
                      {examples.map((ex) => (
                        <ExampleChip
                          key={ex.id}
                          example={ex}
                          disabled={generating}
                          onSelect={() => {
                            onExampleSelect(ex);
                            setShowHints(false);
                            textareaRef.current?.focus();
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null}

        {/* Composer — input step only */}
        {step === "input" ? (
          <div className="shrink-0 border-t border-foreground/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            {aiQuota && !aiQuota.unlimited ? (
              <div className="mb-2 text-center text-[10px] text-foreground/50 sm:hidden">
                {aiQuota.remaining} AI credit{aiQuota.remaining === 1 ? "" : "s"} left this month
              </div>
            ) : null}
            {suggestion ? (
              <button
                type="button"
                className="mb-2 flex w-full items-start gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_4%,white)] px-3 py-2 text-left text-[11px] text-foreground/65 hover:bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)]"
                disabled={generating}
                onClick={() => onExampleSelect(suggestion)}
              >
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)]" />
                <span>
                  <span className="font-medium text-foreground/80">Try: </span>
                  {suggestion.label} — {suggestion.prompt.slice(0, 80)}
                  {suggestion.prompt.length > 80 ? "…" : ""}
                </span>
              </button>
            ) : null}

            {imageFile ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5">
                {imageFile.type === "application/pdf" ? (
                  <FileText className="h-4 w-4 text-foreground/50" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-foreground/50" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/70">{imageFile.name}</span>
                <button
                  type="button"
                  className="text-foreground/40 hover:text-foreground"
                  disabled={generating}
                  onClick={() => handleFileSelect(null)}
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={generating}
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />

              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/55 hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                disabled={generating}
                onClick={() => setShowHints((v) => !v)}
                aria-label="Example prompts"
                title="Example prompts"
              >
                <Lightbulb className={`h-4 w-4 ${showHints ? "text-[var(--hse-teal)]" : ""}`} />
              </button>

              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/55 hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                disabled={generating}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach photo or PDF"
                title="Attach photo or PDF"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <div className="relative min-w-0 flex-1">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="max-h-28 min-h-[36px] w-full resize-none rounded-2xl border border-foreground/15 bg-foreground/[0.03] px-3.5 py-2 text-sm leading-snug placeholder:text-foreground/40 focus:border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)]"
                  placeholder="Describe your form…"
                  value={prompt}
                  disabled={generating}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hse-teal)] text-white hover:opacity-90 disabled:opacity-40"
                disabled={!canSend}
                onClick={onSend}
                aria-label="Send"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            <p className="mt-2 text-center text-[10px] text-foreground/40">
              Short prompts work — specific ones work better · Shift+Enter for new line
            </p>
          </div>
        ) : null}
      </div>
    </CenteredOverlay>
  );
}
