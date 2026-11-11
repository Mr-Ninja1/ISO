"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, FileUp, LockKeyhole, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { FieldDef, FormSchemaV1 } from "@/types/forms";
import { SOURCE_DOCUMENT_ACCEPT, validateSourceDocument } from "@/lib/ai/sourceDocument";

type DemoForm = { id: string; title: string; schema: FormSchemaV1; source: "sample" | "ai" };
type DemoSubmission = { formTitle: string; submittedAt: string; answers: Record<string, unknown> };
const STORAGE_KEY = "iso-grid-demo-session:v1";
const GENERATION_KEY = "iso-grid-demo-ai-count:v1";
const SESSION_GENERATION_LIMIT = 2;

const starterForms: DemoForm[] = [
  {
    id: "sample-temperature-check",
    title: "Daily temperature check",
    source: "sample",
    schema: { version: 1, title: "Daily temperature check", sections: [{ type: "fields", title: "Cold storage", columns: 1, fields: [
      { id: "area", type: "text", label: "Fridge or area", required: true },
      { id: "temperature", type: "temp", label: "Temperature (°C)", required: true, min: -30, max: 50, alertAbove: 5 },
      { id: "within_range", type: "yesno", label: "Within safe range?", required: true },
      { id: "corrective_action", type: "text", label: "Corrective action or notes", multiline: true },
    ] }] },
  },
  {
    id: "sample-safety-walk",
    title: "Workplace safety walk",
    source: "sample",
    schema: { version: 1, title: "Workplace safety walk", sections: [{ type: "fields", title: "Inspection", columns: 1, fields: [
      { id: "location", type: "text", label: "Area inspected", required: true },
      { id: "walkway", type: "yesno", label: "Walkways clear and safe?", required: true },
      { id: "equipment", type: "yesno", label: "Equipment in good condition?", required: true },
      { id: "finding", type: "text", label: "Observation or follow-up", multiline: true },
      { id: "inspected_on", type: "date", label: "Inspection date", required: true },
    ] }] },
  },
  {
    id: "sample-cleaning-log",
    title: "Cleaning sign-off",
    source: "sample",
    schema: { version: 1, title: "Cleaning sign-off", sections: [{ type: "fields", title: "Completed task", columns: 1, fields: [
      { id: "area", type: "text", label: "Area cleaned", required: true },
      { id: "task", type: "text", label: "Cleaning task", required: true },
      { id: "completed", type: "checkbox", label: "Task completed", required: true },
      { id: "completed_at", type: "time", label: "Time completed" },
    ] }] },
  },
  {
    id: "sample-shift-questionnaire",
    title: "Shift handover questionnaire",
    source: "sample",
    schema: { version: 1, title: "Shift handover questionnaire", sections: [{ type: "fields", title: "Before handing over", columns: 1, fields: [
      { id: "shift", type: "text", label: "Shift or team", required: true },
      { id: "open_tasks", type: "text", label: "What still needs attention?", multiline: true, required: true },
      { id: "hazards", type: "yesno", label: "Any hazards or incidents to report?", required: true },
      { id: "handover_complete", type: "checkbox", label: "Key information handed over", required: true },
    ] }] },
  },
  {
    id: "sample-incident-report",
    title: "Incident report",
    source: "sample",
    schema: { version: 1, title: "Incident report", sections: [{ type: "fields", title: "What happened?", columns: 1, fields: [
      { id: "reported_on", type: "date", label: "Date of incident", required: true },
      { id: "location", type: "text", label: "Location", required: true },
      { id: "description", type: "text", label: "Describe the incident", multiline: true, required: true },
      { id: "immediate_action", type: "text", label: "Immediate action taken", multiline: true },
      { id: "photo", type: "photo", label: "Attach a photo" },
      { id: "reporter_signature", type: "signature", label: "Reporter sign-off" },
    ] }] },
  },
  {
    id: "sample-delivery-log",
    title: "Goods receiving log",
    source: "sample",
    schema: { version: 1, title: "Goods receiving log", sections: [{ type: "fields", title: "Delivery checks", columns: 1, fields: [
      { id: "supplier", type: "text", label: "Supplier", required: true },
      { id: "delivery_date", type: "date", label: "Delivery date", required: true },
      { id: "items", type: "dynamic-table", label: "Record each item", columns: [
        { id: "item", label: "Item", type: "text", required: true },
        { id: "temperature", label: "Temp °C", type: "temp" },
        { id: "accepted", label: "Accepted?", type: "yesno" },
      ] },
      { id: "receiver", type: "signature", label: "Received by" },
    ] }] },
  },
];

function fieldsFor(schema: FormSchemaV1): FieldDef[] {
  if (schema.sections?.length) return schema.sections.flatMap((section) => section.type === "fields" ? section.fields : section.columns);
  return schema.fields || [];
}

function DemoField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10";
  if (field.type === "display" || field.type === "static") return <p className="text-sm text-slate-600">{field.label}</p>;
  if (field.type === "checkbox") return <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-teal-700" />{field.label}{field.required ? " *" : ""}</label>;
  if (field.type === "yesno") return <select className={inputClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={field.required}><option value="">Choose yes or no</option><option value="yes">Yes</option><option value="no">No</option></select>;
  if (field.type === "signature") return <button type="button" className="mt-1.5 flex h-14 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-600 hover:border-teal-700 hover:text-teal-900" onClick={() => onChange(value ? "" : "Signed in demo")}>{value ? "Signed · click to clear" : "Tap to add a demo signature"}</button>;
  if (field.type === "photo") return <button type="button" className="mt-1.5 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-600 hover:border-teal-700 hover:text-teal-900" onClick={() => onChange(value ? "" : "Demo photo attached")}>{value ? "Photo attached · click to clear" : "Tap to simulate attaching a photo"}</button>;
  if (field.type === "dynamic-table") {
    const rows = (value && typeof value === "object" ? value : {}) as Record<string, Record<string, unknown>>;
    return <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[420px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{field.columns.map((column) => <th key={column.id} className="px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead><tbody>{[0, 1, 2].map((rowIndex) => <tr key={rowIndex} className="border-t border-slate-100">{field.columns.map((column) => <td key={column.id} className="p-2">{column.type === "yesno" ? <select aria-label={`${column.label}, row ${rowIndex + 1}`} className="h-9 w-full min-w-24 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-teal-700" value={String(rows[String(rowIndex)]?.[column.id] ?? "")} onChange={(event) => onChange({ ...rows, [String(rowIndex)]: { ...rows[String(rowIndex)], [column.id]: event.target.value } })}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select> : <input aria-label={`${column.label}, row ${rowIndex + 1}`} className="h-9 w-full min-w-24 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-teal-700" type={column.type === "temp" ? "number" : "text"} value={String(rows[String(rowIndex)]?.[column.id] ?? "")} onChange={(event) => onChange({ ...rows, [String(rowIndex)]: { ...rows[String(rowIndex)], [column.id]: event.target.value } })} />}</td>)}</tr>)}</tbody></table></div>;
  }
  if (field.type === "text" && field.multiline) return <textarea className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10" placeholder={field.helpText || "Add details"} value={String(value ?? "")} required={field.required} onChange={(event) => onChange(event.target.value)} />;
  const type: "text" | "date" | "time" | "number" = field.type === "date" || field.type === "time"
    ? field.type
    : field.type === "number" || field.type === "temp"
      ? "number"
      : "text";
  return <input className={inputClass} type={type} placeholder={field.helpText || "Enter a value"} value={String(value ?? "")} required={field.required} onChange={(event) => onChange(event.target.value)} />;
}

export default function DemoPage() {
  const [forms, setForms] = useState<DemoForm[]>(starterForms);
  const [submissions, setSubmissions] = useState<DemoSubmission[]>([]);
  const [selectedId, setSelectedId] = useState(starterForms[0].id);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [accountGateOpen, setAccountGateOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const savedGenerationCount = Number(sessionStorage.getItem(GENERATION_KEY) || 0);
      setGenerationCount(Number.isFinite(savedGenerationCount) ? Math.max(0, Math.min(SESSION_GENERATION_LIMIT, savedGenerationCount)) : 0);
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { forms?: DemoForm[]; submissions?: DemoSubmission[] };
      if (Array.isArray(saved.forms)) setForms([...starterForms, ...saved.forms.filter((form) => form.source === "ai")]);
      if (Array.isArray(saved.submissions)) setSubmissions(saved.submissions.slice(0, 30));
    } catch { /* private browsing or stale local demo data */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ forms: forms.filter((form) => form.source === "ai"), submissions })); }
    catch { /* demo remains usable even when browser storage is unavailable */ }
  }, [forms, submissions]);

  const selected = useMemo(() => forms.find((form) => form.id === selectedId) || forms[0], [forms, selectedId]);
  const fields = useMemo(() => fieldsFor(selected.schema).filter((field) => field.isActive !== false), [selected]);

  async function createWithAi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating) return;
    if (generationCount >= SESSION_GENERATION_LIMIT) {
      setMessage("You’ve used both AI form generations in this demo session. Create an account to keep building.");
      setAccountGateOpen(true);
      return;
    }
    if (!prompt.trim() && !sourceFile) return;
    setGenerating(true); setMessage("");
    try {
      const formData = new FormData();
      formData.set("prompt", prompt.trim());
      if (sourceFile) formData.set("file", sourceFile);
      const response = await fetch("/api/demo/forms", { method: "POST", body: formData });
      const nextCount = generationCount + 1;
      setGenerationCount(nextCount);
      try { sessionStorage.setItem(GENERATION_KEY, String(nextCount)); } catch { /* server quota still applies */ }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI form creation failed.");
      const schema = data.schema as FormSchemaV1;
      const form: DemoForm = { id: `ai-${crypto.randomUUID()}`, title: schema.title || "AI form", schema, source: "ai" };
      setForms((current) => [form, ...current]); setSelectedId(form.id); setAnswers({}); setPrompt(""); setSourceFile(null);
      setMessage("Your AI form is ready. Try filling it in and submit it here.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI form creation failed.");
    } finally { setGenerating(false); }
  }

  function submitLocalForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissions((current) => [{ formTitle: selected.title, submittedAt: new Date().toISOString(), answers }, ...current].slice(0, 30));
    setAnswers({});
    setMessage("Submitted in this browser session. Nothing was sent to a brand or saved to the database.");
  }

  function resetDemo() {
    setForms(starterForms); setSelectedId(starterForms[0].id); setAnswers({}); setSubmissions([]); setMessage("Demo reset.");
    setGenerationCount(0);
    try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(GENERATION_KEY); } catch { /* ignore */ }
  }

  return (
    <main className="min-h-dvh bg-[#f4f7f6] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="ISO Grid home"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-sm font-bold text-white">ISO</span><span><span className="block text-sm font-semibold">ISO Grid</span><span className="block text-xs text-slate-500">Interactive demo</span></span></Link>
          <div className="flex items-center gap-2"><button type="button" onClick={resetDemo} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-600 hover:bg-slate-100"><RotateCcw className="h-4 w-4"/><span className="hidden sm:inline">Reset demo</span></button><Link href="/signup" className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900">Create account<ArrowRight className="h-4 w-4"/></Link></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:py-9">
        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-teal-900/10 bg-white shadow-sm">
            <div className="bg-[radial-gradient(ellipse_at_top_right,_rgba(45,212,191,.24),_transparent_65%),linear-gradient(135deg,#0f2928,#164e4a)] p-4 text-white">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-100"><Sparkles className="h-4 w-4"/>AI form studio</div>
              <p className="mt-2 text-sm leading-6 text-white/75">Start with a prompt, a PDF or a photo. Your form appears in My forms, ready to try.</p>
            </div>
            <div className="p-4">
            <form onSubmit={createWithAi} className="mt-3 space-y-2">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1500} placeholder="Describe the form you need: checks, fields, pass/fail rules…" className="min-h-28 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10" />
              <div className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-teal-700 hover:bg-teal-50/50">
                <FileUp className="h-4 w-4 shrink-0 text-teal-800"/><span className="min-w-0 flex-1 truncate">{sourceFile ? sourceFile.name : "Add a PDF or photo"}</span>
                {sourceFile ? <button type="button" aria-label="Remove source file" className="rounded-lg p-1 hover:bg-slate-200" onClick={() => setSourceFile(null)}><X className="h-4 w-4"/></button> : <label className="cursor-pointer text-xs font-medium text-teal-800">Choose<input type="file" className="sr-only" accept={SOURCE_DOCUMENT_ACCEPT} disabled={generating || generationCount >= SESSION_GENERATION_LIMIT} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const result = validateSourceDocument(file); if (!result.ok) { setMessage(result.error); event.target.value = ""; return; } setSourceFile(file); setMessage(""); }} /></label>}
              </div>
              <button disabled={generating || (generationCount < SESSION_GENERATION_LIMIT && !prompt.trim() && !sourceFile)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin"/> : generationCount >= SESSION_GENERATION_LIMIT ? <LockKeyhole className="h-4 w-4"/> : <Sparkles className="h-4 w-4"/>}{generating ? "Building your form…" : generationCount >= SESSION_GENERATION_LIMIT ? "Create an account to continue" : "Build with AI"}</button>
            </form>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>AI generations in this session</span><span className="font-semibold text-slate-700">{Math.max(0, SESSION_GENERATION_LIMIT - generationCount)} of {SESSION_GENERATION_LIMIT} left</span></div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">My forms</h2><span className="text-xs text-slate-400">{forms.length} ready</span></div>
            <div className="space-y-1">{forms.map((form) => <button key={form.id} type="button" onClick={() => { setSelectedId(form.id); setAnswers({}); setMessage(""); }} className={`w-full rounded-xl px-3 py-3 text-left transition ${selected.id === form.id ? "bg-teal-50 text-teal-950 ring-1 ring-teal-700/15" : "text-slate-700 hover:bg-slate-50"}`}><span className="block text-sm font-medium">{form.title}</span><span className="mt-1 block text-xs text-slate-500">{form.source === "ai" ? "Created with AI · session only" : "Sample form · ready to try"}</span></button>)}</div>
          </section>
          <section className="rounded-2xl bg-slate-900 p-4 text-white"><p className="text-sm font-semibold">A private playground</p><p className="mt-1 text-xs leading-5 text-white/65">This demo works in your browser. Forms and submissions clear when you reset the demo or end this browser session.</p></section>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"><ChevronLeft className="h-4 w-4"/>ISO Grid</Link><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-800">My forms · interactive demo</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{selected.title}</h1></div><div className="flex items-center gap-2"><button type="button" onClick={() => setAccountGateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-teal-700/30 hover:text-teal-900"><LockKeyhole className="h-4 w-4"/>PDF export</button><button type="button" onClick={() => setAccountGateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-teal-700/30 hover:text-teal-900"><LockKeyhole className="h-4 w-4"/>Share</button></div></div>
          {message ? <div role="status" className="flex items-start gap-2 rounded-xl border border-teal-800/15 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Check className="mt-0.5 h-4 w-4 shrink-0"/>{message}</div> : null}
          <form onSubmit={submitLocalForm} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            {(selected.schema.sections || []).map((section, index) => section.title ? <h2 key={`section-${index}`} className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">{section.title}</h2> : null)}
            <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <div key={field.id} className={`block text-sm font-medium text-slate-700 ${field.type === "display" || field.type === "static" || field.type === "dynamic-table" || (field.type === "text" && field.multiline) ? "sm:col-span-2" : ""}`}>{field.type !== "checkbox" ? <span>{field.label}{field.required ? <span className="ml-1 text-rose-600">*</span> : null}</span> : null}<DemoField field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}/></div>)}</div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Submitting creates a local demo record only.</p><button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-black">Submit demo form<ArrowRight className="h-4 w-4"/></button></div>
          </form>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Recent submissions</h2><p className="mt-1 text-xs text-slate-500">Stored in this browser session</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{submissions.length}</span></div>{submissions.length ? <div className="mt-3 divide-y divide-slate-100">{submissions.slice(0, 5).map((submission, index) => <div key={`${submission.submittedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm font-medium">{submission.formTitle}</span><time className="text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</time></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">Fill out the form above and submit it to see how records appear here.</p>}</section>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-900/10 bg-teal-50/80 p-4 sm:p-5"><div><p className="text-sm font-semibold text-teal-950">Ready to use this with your team?</p><p className="mt-1 text-xs text-teal-950/70">Create a workspace to save and share real forms.</p></div><Link href="/signup" className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900">Get started<ArrowRight className="h-4 w-4"/></Link></div>
        </section>
      </div>
      {accountGateOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountGateOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="demo-account-title" className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><LockKeyhole className="h-5 w-5"/></div><h2 id="demo-account-title" className="mt-4 text-xl font-semibold text-slate-950">Unlock the full workspace</h2><p className="mt-2 text-sm leading-6 text-slate-600">PDF export and sharing are turned off in the demo. Create an account to keep forms, share them with your team, and export completed records.</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><Link href="/signup" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900">Create account<ArrowRight className="h-4 w-4"/></Link><button type="button" onClick={() => setAccountGateOpen(false)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep exploring</button></div></section></div> : null}
    </main>
  );
}
