"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Upload,
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
import { SOURCE_DOCUMENT_ACCEPT, validateSourceDocument } from "@/lib/ai/sourceDocument";
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
  sourceFile: File | null;
  onSourceFileChange: (file: File | null) => void;
  sourceFileError?: string | null;
  onSourceFileError?: (message: string | null) => void;
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
        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md border border-foreground/10 bg-background px-4 py-3">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-foreground/50">Reading your request…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[min(100%,22rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[85%] " +
          (isUser
            ? "rounded-br-md bg-[var(--hse-teal)] text-white"
            : "rounded-bl-md border border-foreground/10 bg-background text-foreground")
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
      className="group flex w-full items-start gap-2 rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-left transition-colors hover:border-[color-mix(in_srgb,var(--hse-teal)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_5%,white)] disabled:opacity-50"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)] opacity-70 group-hover:opacity-100" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground">{example.label}</span>
          <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/50">
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
  sourceFile,
  onSourceFileChange,
  sourceFileError,
  onSourceFileError,
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
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<"prompt" | "attach">("attach");

  const canSend = (prompt.trim().length > 0 || sourceFile) && !generating;
  const hasConversation = messages.length > 1 || step === "clarify";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step, generating]);

  useEffect(() => {
    if (!open) {
      setDragOver(false);
      setInputMode("prompt");
    } else {
      window.setTimeout(() => textareaRef.current?.focus(), 180);
    }
  }, [open]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [prompt]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step === "input" && canSend) onSend();
    }
  }

  function handleFileSelect(file: File | null) {
    if (!file) {
      onSourceFileChange(null);
      onSourceFileError?.(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    const validated = validateSourceDocument(file);
    if (!validated.ok) {
      onSourceFileChange(null);
      onSourceFileError?.(validated.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    onSourceFileError?.(null);
    onSourceFileChange(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (generating) return;
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  }

  const groupedExamples = AI_EXAMPLE_PROMPTS.reduce(
    (acc, ex) => {
      if (!acc[ex.formType]) acc[ex.formType] = [];
      acc[ex.formType].push(ex);
      return acc;
    },
    {} as Record<FormType, ExamplePrompt[]>
  );

  return (
    <CenteredOverlay
      open={open}
      maxWidthClass="max-w-2xl"
      zIndexClass="z-[110]"
      variant="sheet"
      panelClassName="!p-0"
      onClose={onClose}
    >
      <div className="relative flex h-[min(100dvh,920px)] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--hse-cream)_25%,white)] sm:h-[min(92dvh,860px)] sm:max-h-[min(92dvh,860px)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--hse-teal) 16%, transparent), color-mix(in srgb, var(--hse-sky) 50%, transparent) 50%, transparent)",
          }}
        />
        {/* Ambient pulse — subtle “engine alive” motion */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-16 h-24 w-24 animate-pulse rounded-full opacity-30 blur-2xl"
          style={{ background: "color-mix(in srgb, var(--hse-teal) 40%, transparent)" }}
        />

        <div className="relative shrink-0 border-b border-foreground/10 bg-background/80 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--hse-teal)_18%,transparent)_0%,_transparent_65%)] opacity-90" aria-hidden />
          <div className="flex justify-center pb-1 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-foreground/15" />
          </div>
          <div className="relative flex items-center justify-between gap-3 px-4 pb-3.5 sm:px-5 sm:pt-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--hse-teal)] text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-background bg-[var(--hse-sky-deep)]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight text-foreground">
                  {DC_AI_SHORT} Form Engine
                </div>
                <div className="truncate text-[11px] text-foreground/55">
                  {step === "clarify"
                    ? "Almost done — answer a few details"
                    : "Attach a form, describe it, or both"}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {aiQuota && !aiQuota.unlimited ? (
                <span
                  className={
                    "hidden rounded-md px-2 py-1 text-[10px] font-medium sm:inline " +
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
                className="flex h-9 w-9 items-center justify-center rounded-xl text-foreground/50 hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                onClick={onClose}
                disabled={generating}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {step === "input" && !hasConversation ? (
            <div className="mb-5 space-y-4">
              {generating ? (
                <div className="mb-2 flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_18%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] px-3 py-2 text-[11px] font-medium text-[var(--hse-teal)]">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--hse-teal)]" />
                  Reading your form structure…
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setInputMode("prompt")}
                  className={
                    "rounded-2xl border p-4 text-left transition-all " +
                    (inputMode === "prompt"
                      ? "border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] shadow-sm"
                      : "border-foreground/10 bg-background/90 hover:border-foreground/20")
                  }
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">Type a prompt</div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/60">Describe the form, fields, sections, or workflow you need.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode("attach")}
                  className={
                    "rounded-2xl border p-4 text-left transition-all " +
                    (inputMode === "attach"
                      ? "border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] shadow-sm"
                      : "border-foreground/10 bg-background/90 hover:border-foreground/20")
                  }
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">Attach PDF or photo</div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/60">Upload a scan or image and let AI rebuild the structure.</p>
                </button>
              </div>

              {inputMode === "attach" ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!generating) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDropFiles}
                  className={
                    "relative overflow-hidden rounded-2xl border-2 border-dashed p-5 transition-all duration-200 sm:p-6 " +
                    (dragOver
                      ? "border-[var(--hse-teal)] bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)]"
                      : "border-[color-mix(in_srgb,var(--hse-teal)_28%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_5%,white)]")
                  }
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--hse-teal)] text-white shadow-sm">
                      <Upload className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground">Drop a form here</h3>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-foreground/60">
                      PDF scan, photo of a paper form, or screenshot. AI rebuilds the structure so you can collect the same information digitally.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={generating}
                        onClick={() => pdfInputRef.current?.click()}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--hse-teal)] px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        <FileText className="h-4 w-4" />
                        Attach PDF
                      </button>
                      <button
                        type="button"
                        disabled={generating}
                        onClick={() => imageInputRef.current?.click()}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-foreground/15 bg-background px-4 text-sm font-semibold text-foreground hover:bg-foreground/[0.03] disabled:opacity-50"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Attach photo
                      </button>
                    </div>
                    <p className="mt-3 text-[10px] text-foreground/45">JPG · PNG · PDF · clear photos work best</p>
                  </div>
                </div>
              ) : null}

              {inputMode === "prompt" ? (
                <div className="rounded-2xl border border-foreground/12 bg-background/90 p-3 shadow-sm">
                  <textarea
                    ref={textareaRef}
                    rows={4}
                    className="max-h-28 min-h-[84px] w-full resize-none rounded-xl border border-foreground/15 bg-foreground/[0.02] px-3.5 py-2.5 text-sm leading-snug placeholder:text-foreground/40 focus:border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)]"
                    placeholder="Quick form description…"
                    value={prompt}
                    disabled={generating}
                    onChange={(e) => onPromptChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>

          {step === "clarify" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background shadow-sm">
              <div className="border-b border-[color-mix(in_srgb,var(--hse-teal)_18%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--hse-teal)]">
                  Quick details
                </div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">Before I build the form</div>
                {assessSummary ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">{assessSummary}</p>
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
                    A few answers help match your process.
                  </p>
                )}
              </div>

              <div className="space-y-3 p-4">
                {questions.map((q, index) => (
                  <div key={q.id} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                    <div className="flex gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--hse-teal)] text-[11px] font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label className="block text-sm font-medium text-foreground">{q.question}</label>
                        {q.hint ? <p className="mt-0.5 text-[11px] text-foreground/55">{q.hint}</p> : null}
                        {q.inputType === "choice" && q.options?.length ? (
                          <select
                            className="mt-2 h-10 w-full rounded-xl border border-foreground/15 bg-background px-3 text-sm"
                            value={answers[q.id] || ""}
                            disabled={generating}
                            onChange={(e) => onAnswersChange({ ...answers, [q.id]: e.target.value })}
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
                            className="mt-2 h-10 w-full rounded-xl border border-foreground/15 bg-background px-3 text-sm"
                            placeholder="Type your answer…"
                            value={answers[q.id] || ""}
                            disabled={generating}
                            onChange={(e) => onAnswersChange({ ...answers, [q.id]: e.target.value })}
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
                  ← Back
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--hse-teal)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={generating}
                  onClick={onGenerate}
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generating ? "Building…" : "Generate form"}
                </button>
              </div>
            </div>
          ) : null}

          <div ref={chatEndRef} />
        </div>

        {step === "input" ? (
          <div className="shrink-0 border-t border-foreground/10 bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {aiQuota && !aiQuota.unlimited ? (
              <div className="mb-2 text-center text-[10px] text-foreground/50 sm:hidden">
                {aiQuota.remaining} AI credit{aiQuota.remaining === 1 ? "" : "s"} left this month
              </div>
            ) : null}

            {sourceFileError ? (
              <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {sourceFileError}
              </div>
            ) : null}

            {sourceFile ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] px-3 py-2.5">
                {sourceFile.type === "application/pdf" ? (
                  <FileText className="h-4 w-4 text-[var(--hse-teal)]" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-[var(--hse-teal)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/75">
                  <span className="font-semibold text-[var(--hse-teal)]">Attached</span>
                  <span className="mx-1 text-foreground/35">·</span>
                  {sourceFile.name}
                </span>
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
                accept={SOURCE_DOCUMENT_ACCEPT}
                className="hidden"
                disabled={generating}
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={generating}
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                className="hidden"
                disabled={generating}
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />

              {inputMode === "prompt" ? (
                <div className="relative min-w-0 flex-1">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    className="max-h-24 min-h-[40px] w-full resize-none rounded-2xl border border-foreground/15 bg-foreground/[0.03] px-3.5 py-2.5 text-sm leading-snug placeholder:text-foreground/40 focus:border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--hse-teal)_25%,transparent)]"
                    placeholder="Add a quick description…"
                    value={prompt}
                    disabled={generating}
                    onChange={(e) => onPromptChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              ) : null}

              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-foreground/15 text-foreground/55 hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                disabled={generating}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach PDF, JPG, or PNG"
                title="Attach PDF, JPG, or PNG"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--hse-teal)] px-4 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-40"
                disabled={!canSend}
                onClick={onSend}
                aria-label={sourceFile && !prompt.trim() ? "Build form from attachment" : "Send form request"}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">
                  {generating ? "Working" : sourceFile && !prompt.trim() ? "Build" : "Send"}
                </span>
              </button>
            </div>

            <p className="mt-2 text-center text-[10px] text-foreground/40">
              Results may not match paper layout exactly — they keep the same important fields · Shift+Enter for new line
            </p>
          </div>
        ) : null}
      </div>
    </CenteredOverlay>
  );
}
