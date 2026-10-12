"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { CenteredOverlay } from "@/components/ui/CenteredOverlay";
import type { AiClarificationQuestion } from "@/lib/ai/types";
import { DC_AI_SHORT } from "@/lib/ai/deepControl";
import {
  AI_EXAMPLE_PROMPTS,
  type ExamplePrompt,
} from "@/lib/ai/examplePrompts";
import { getFormBuilderConfig } from "@/lib/formBuilderConfig";
import { validateSourceDocument } from "@/lib/ai/sourceDocument";
import { AiBlueprintingLoader } from "@/components/forms/AiBlueprintingLoader";

export type AiChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachmentName?: string;
  isTyping?: boolean;
  /** Shown while isTyping — e.g. Checking… / Building… */
  typingLabel?: string;
  /** Multi-stage AI blueprinting UI instead of bounce dots */
  blueprint?: boolean;
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
    if (message.blueprint) {
      return (
        <div className="flex justify-start">
          <div className="w-full max-w-[min(100%,22rem)] sm:max-w-[92%]">
            <AiBlueprintingLoader
              active
              compact
              title={message.typingLabel || "Building your form"}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md border border-foreground/10 bg-background px-4 py-3">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--hse-teal)] [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-foreground/50">{message.typingLabel || "Checking…"}</span>
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
      title={example.prompt}
      className="group inline-flex h-9 max-w-[13rem] shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 bg-background/90 px-3 text-left transition-colors hover:border-[color-mix(in_srgb,var(--hse-teal)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--hse-teal)_5%,white)] disabled:opacity-50"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)] opacity-70 group-hover:opacity-100" />
      <span className="min-w-0 truncate text-[11px] font-medium text-foreground">{example.label}</span>
      <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] text-foreground/50">
        {config.label}
      </span>
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
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);

  const canSend = (prompt.trim().length > 0 || sourceFile) && !generating;
  const hasConversation = messages.length > 1 || step === "clarify";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step, generating]);

  useEffect(() => {
    if (!open) {
      setDragOver(false);
      setAttachmentMenuOpen(false);
    } else {
      window.setTimeout(() => textareaRef.current?.focus(), 180);
    }
  }, [open]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!attachmentMenuRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setAttachmentMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [attachmentMenuOpen]);

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
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    const validated = validateSourceDocument(file);
    if (!validated.ok) {
      onSourceFileChange(null);
      onSourceFileError?.(validated.error);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    onSourceFileError?.(null);
    onSourceFileChange(file);
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

  return (
    <CenteredOverlay
      open={open}
      maxWidthClass="max-w-2xl"
      zIndexClass="z-[110]"
      variant="sheet"
      panelClassName="!p-0"
      onClose={onClose}
    >
      <div
        className={
          "relative flex h-[min(100dvh,920px)] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--hse-cream)_25%,white)] transition-shadow sm:h-[min(92dvh,860px)] sm:max-h-[min(92dvh,860px)] " +
          (dragOver ? "ring-2 ring-inset ring-[var(--hse-teal)]" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (!generating) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={onDropFiles}
      >
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
                  {DC_AI_SHORT} Form Builder
                </div>
                <div className="truncate text-[11px] text-foreground/55">
                  {step === "clarify"
                    ? "Almost done — answer a few details"
                    : "Describe a form or attach an existing one"}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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

        <div
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        >
          {step === "input" && !hasConversation ? (
            <div className="mx-auto max-w-2xl py-2 sm:py-6">
              {generating ? <AiBlueprintingLoader active compact title="Reading your request" className="mb-4" /> : null}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="max-w-xl rounded-2xl rounded-tl-md border border-foreground/10 bg-background px-4 py-3 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">What form can I help you create?</div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/60">
                    Describe the form you need, or attach a PDF or photo of an existing one. You can review and edit the draft before saving.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">Try a starting point</span>
                  <span className="text-[10px] text-foreground/40">Choose one to edit</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {AI_EXAMPLE_PROMPTS.slice(0, 6).map((example) => (
                    <ExampleChip
                      key={example.id}
                      example={example}
                      disabled={generating}
                      onSelect={() => {
                        onExampleSelect(example);
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                    />
                  ))}
                </div>
              </div>
              {dragOver ? (
                <div className="pointer-events-none mt-4 rounded-xl border border-dashed border-[var(--hse-teal)] bg-background/90 px-4 py-3 text-center text-xs font-medium text-[var(--hse-teal)]">
                  Drop the PDF or image to attach it
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {messages.filter((msg) => msg.content.trim() || msg.isTyping || msg.attachmentName).map((msg) => (
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
                  {generating ? "Blueprinting…" : "Generate form"}
                </button>
              </div>
            </div>
          ) : null}

          <div ref={chatEndRef} />
        </div>

        {step === "input" ? (
          <div className="shrink-0 border-t border-foreground/10 bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
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

              <div className="flex items-end gap-2 rounded-2xl border border-foreground/15 bg-background p-2 shadow-sm transition focus-within:border-[color-mix(in_srgb,var(--hse-teal)_42%,transparent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)]">
                <div ref={attachmentMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground/55 transition hover:bg-foreground/5 hover:text-[var(--hse-teal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hse-teal)] disabled:opacity-40"
                    disabled={generating}
                    onClick={() => setAttachmentMenuOpen((current) => !current)}
                    aria-label="Add a file"
                    aria-expanded={attachmentMenuOpen}
                    aria-controls="ai-form-attachment-options"
                    title="Add a file"
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  {attachmentMenuOpen ? (
                    <div
                      id="ai-form-attachment-options"
                      role="group"
                      aria-label="Choose an attachment type"
                      className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-foreground/10 bg-background p-1.5 shadow-xl shadow-foreground/10"
                    >
                      <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/40">
                        Add a reference
                      </div>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hse-teal)]"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          pdfInputRef.current?.click();
                        }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--hse-teal)_9%,white)] text-[var(--hse-teal)]">
                          <FileText className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-foreground">PDF document</span>
                          <span className="block text-[10px] text-foreground/50">Use an existing form or guide</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hse-teal)]"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          imageInputRef.current?.click();
                        }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--hse-teal)_9%,white)] text-[var(--hse-teal)]">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-foreground">Photo or image</span>
                          <span className="block text-[10px] text-foreground/50">Choose a JPG or PNG</span>
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="max-h-28 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-snug placeholder:text-foreground/40 focus:outline-none disabled:opacity-60"
                  placeholder="Describe the form you need…"
                  value={prompt}
                  disabled={generating}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Describe the form you need"
                />
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
                  disabled={!canSend}
                  onClick={onSend}
                  aria-label={sourceFile && !prompt.trim() ? "Build form from attachment" : "Send form request"}
                  title={sourceFile && !prompt.trim() ? "Build form" : "Send"}
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 px-1">
              <p className="text-[10px] text-foreground/40">Attach a PDF, JPG, or PNG · Shift+Enter for a new line</p>
              {aiQuota && !aiQuota.unlimited ? (
                <p className={"text-[10px] " + (aiQuota.remaining <= 1 ? "text-amber-700" : "text-foreground/40")}>
                  {aiQuota.remaining} AI credit{aiQuota.remaining === 1 ? "" : "s"} left
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </CenteredOverlay>
  );
}
