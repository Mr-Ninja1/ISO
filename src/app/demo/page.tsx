"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ClipboardList, FileText, FileUp, LockKeyhole, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type SignatureCanvas from "react-signature-canvas";
import type { SignatureCanvasProps } from "react-signature-canvas";
import type { FieldDef, FormSchemaV1 } from "@/types/forms";
import { SOURCE_DOCUMENT_ACCEPT, validateSourceDocument } from "@/lib/ai/sourceDocument";
import { compressPhotoEvidence } from "@/lib/photoEvidenceImage";
import { SIGNATURE_CANVAS_PEN } from "@/lib/signatureCanvasProps";

type DemoForm = { id: string; title: string; schema: FormSchemaV1; source: "sample" | "ai" };
type DemoSubmission = { formTitle: string; submittedAt: string; answers: Record<string, unknown> };
const STORAGE_KEY = "iso-grid-demo-session:v1";
const GENERATION_KEY = "iso-grid-demo-ai-count:v1";
const SESSION_GENERATION_LIMIT = 2;
type DemoView = "forms" | "form" | "builder" | "submissions";

const starterForms: DemoForm[] = [
  {
    id: "sample-temperature-check",
    title: "Daily temperature check",
    source: "sample",
    schema: { version: 1, title: "Daily temperature check", sections: [{ type: "fields", title: "Cold storage", columns: 1, fields: [
      { id: "area", type: "text", label: "Fridge or area", required: true },
      { id: "temperature", type: "temp", label: "Temperature (°C)", required: true, min: -30, max: 50, alertAbove: 5 },
      { id: "within_range", type: "yesno", label: "Within safe range?", required: true },
      { id: "checked_at", type: "time", label: "Time checked", required: true },
      { id: "checked_by", type: "text", label: "Checked by", required: true },
      { id: "corrective_action", type: "text", label: "Corrective action or notes", multiline: true },
      { id: "manager_reviewed", type: "checkbox", label: "Manager notified if outside range" },
    ] }] },
  },
  {
    id: "sample-safety-walk",
    title: "Workplace safety walk",
    source: "sample",
    schema: { version: 1, title: "Workplace safety walk", sections: [{ type: "fields", title: "Inspection", columns: 1, fields: [
      { id: "location", type: "text", label: "Area inspected", required: true },
      { id: "inspected_by", type: "text", label: "Inspector name", required: true },
      { id: "walkway", type: "yesno", label: "Walkways clear and safe?", required: true },
      { id: "equipment", type: "yesno", label: "Equipment in good condition?", required: true },
      { id: "ppe", type: "yesno", label: "Required PPE available and in use?", required: true },
      { id: "exits", type: "yesno", label: "Emergency exits unobstructed?", required: true },
      { id: "finding", type: "text", label: "Observation or follow-up", multiline: true },
      { id: "follow_up_required", type: "checkbox", label: "Follow-up action required" },
      { id: "inspected_on", type: "date", label: "Inspection date", required: true },
    ] }] },
  },
  {
    id: "sample-cleaning-log",
    title: "Cleaning sign-off",
    source: "sample",
    schema: { version: 1, title: "Cleaning sign-off", sections: [{ type: "fields", title: "Completed task", columns: 1, fields: [
      { id: "area", type: "text", label: "Area cleaned", required: true },
      { id: "cleaned_on", type: "date", label: "Date", required: true },
      { id: "task", type: "text", label: "Cleaning task", required: true },
      { id: "cleaner", type: "text", label: "Completed by", required: true },
      { id: "chemical", type: "text", label: "Cleaning product used" },
      { id: "completed", type: "checkbox", label: "Task completed", required: true },
      { id: "checked", type: "yesno", label: "Area checked after cleaning?", required: true },
      { id: "issues", type: "text", label: "Issues or follow-up notes", multiline: true },
      { id: "completed_at", type: "time", label: "Time completed" },
    ] }] },
  },
  {
    id: "sample-shift-questionnaire",
    title: "Shift handover questionnaire",
    source: "sample",
    schema: { version: 1, title: "Shift handover questionnaire", sections: [{ type: "fields", title: "Before handing over", columns: 1, fields: [
      { id: "shift", type: "text", label: "Shift or team", required: true },
      { id: "outgoing_lead", type: "text", label: "Outgoing lead", required: true },
      { id: "incoming_lead", type: "text", label: "Incoming lead", required: true },
      { id: "open_tasks", type: "text", label: "What still needs attention?", multiline: true, required: true },
      { id: "hazards", type: "yesno", label: "Any hazards or incidents to report?", required: true },
      { id: "equipment_status", type: "yesno", label: "Is all key equipment operational?", required: true },
      { id: "stock_status", type: "text", label: "Low stock or supplies to flag?", multiline: true },
      { id: "handover_complete", type: "checkbox", label: "Key information handed over", required: true },
      { id: "handover_time", type: "time", label: "Handover time", required: true },
    ] }] },
  },
  {
    id: "sample-incident-report",
    title: "Incident report",
    source: "sample",
    schema: { version: 1, title: "Incident report", sections: [{ type: "fields", title: "What happened?", columns: 1, fields: [
      { id: "reported_on", type: "date", label: "Date of incident", required: true },
      { id: "reported_at", type: "time", label: "Time of incident" },
      { id: "reporter", type: "text", label: "Person completing this report", required: true },
      { id: "location", type: "text", label: "Location", required: true },
      { id: "people_involved", type: "text", label: "People involved or affected" },
      { id: "description", type: "text", label: "Describe the incident", multiline: true, required: true },
      { id: "immediate_action", type: "text", label: "Immediate action taken", multiline: true },
      { id: "injury", type: "yesno", label: "Was anyone injured?", required: true },
      { id: "witnesses", type: "text", label: "Witnesses or contact details" },
      { id: "follow_up", type: "text", label: "Recommended follow-up", multiline: true },
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
      { id: "reference", type: "text", label: "Delivery or invoice reference" },
      { id: "received_by", type: "text", label: "Received by", required: true },
      { id: "packaging", type: "yesno", label: "Packaging in acceptable condition?", required: true },
      { id: "items", type: "dynamic-table", label: "Record each item", columns: [
        { id: "item", label: "Item", type: "text", required: true },
        { id: "temperature", label: "Temp °C", type: "temp" },
        { id: "accepted", label: "Accepted?", type: "yesno" },
      ] },
      { id: "delivery_notes", type: "text", label: "Notes or rejected items", multiline: true },
      { id: "receiver", type: "signature", label: "Receiver signature", required: true },
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
  if (field.type === "signature") return <DemoSignatureField field={field} value={value} onChange={onChange}/>;
  if (field.type === "photo") return <DemoPhotoField field={field} value={value} onChange={onChange}/>;
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

function DemoSignatureField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const [Canvas, setCanvas] = useState<React.ComponentClass<SignatureCanvasProps & { onEnd?: () => void }> | null>(null);
  const dataUrl = typeof value === "string" && value.startsWith("data:image/") ? value : "";

  useEffect(() => {
    let active = true;
    import("react-signature-canvas").then((module) => {
      if (active) setCanvas(() => module.default as unknown as React.ComponentClass<SignatureCanvasProps & { onEnd?: () => void }>);
    }).catch(() => {
      if (active) setCanvas(null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!Canvas || !dataUrl || !signatureRef.current) return;
    try {
      if (signatureRef.current.isEmpty()) signatureRef.current.fromDataURL(dataUrl);
    } catch { /* Ignore stale or invalid demo signature data. */ }
  }, [Canvas, dataUrl]);

  return <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 sm:p-3"><div className="overflow-hidden rounded-lg border border-dashed border-slate-300 bg-[linear-gradient(to_bottom,transparent_94%,#e2e8f0_95%)]"><div className="flex h-36 w-full items-center justify-center sm:h-40">{Canvas ? <Canvas ref={(instance) => { signatureRef.current = instance as SignatureCanvas | null; }} clearOnResize={false} {...SIGNATURE_CANVAS_PEN} canvasProps={{ width: 900, height: 240, "aria-label": `${field.label} signature canvas`, className: "h-full w-full", style: { touchAction: "none" } }} onEnd={() => { const signature = signatureRef.current?.toDataURL("image/png"); if (signature) onChange(signature); }}/> : <span className="text-xs text-slate-400">Loading signature pad…</span>}</div></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-500">Sign with your finger or mouse</span><button type="button" className="min-h-10 rounded-lg px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50" onClick={() => { signatureRef.current?.clear(); onChange(""); }}>Clear signature</button></div></div>;
}

function DemoPhotoField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photos = Array.isArray(value) ? value.filter((photo): photo is string => typeof photo === "string" && photo.startsWith("data:image/")) : [];

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const available = Math.max(0, 3 - photos.length);
      if (!available) throw new Error("You can attach up to three photos.");
      const compressed = await Promise.all(Array.from(files).slice(0, available).map((file) => compressPhotoEvidence(file)));
      onChange([...photos, ...compressed]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This photo could not be attached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">Add photo evidence</p>
          <p className="mt-1 text-xs text-slate-500">Take a photo or choose an image from your device. Up to three photos.</p>
        </div>
        <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-teal-700/40 hover:bg-teal-50 ${busy || photos.length >= 3 ? "pointer-events-none opacity-50" : ""}`}>
          <FileUp className="h-4 w-4"/>{busy ? "Preparing photo…" : "Take or choose photo"}
          <input className="sr-only" type="file" accept="image/*" capture="environment" multiple aria-label={`Attach photo for ${field.label}`} disabled={busy || photos.length >= 3} onChange={(event) => { void addPhotos(event.target.files); event.currentTarget.value = ""; }}/>
        </label>
      </div>
      {photos.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{photos.map((photo, index) => (
        <div key={`${field.id}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={`${field.label} ${index + 1}`} className="h-32 w-full object-cover"/>
          <button type="button" aria-label={`Remove photo ${index + 1}`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950" onClick={() => onChange(photos.filter((_, photoIndex) => photoIndex !== index))}><X className="h-4 w-4"/></button>
        </div>
      ))}</div> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

function SubmissionAnswer({ value, label }: { value: unknown; label: string }) {
  const images = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.startsWith("data:image/")) : [];
  if (typeof value === "string" && value.startsWith("data:image/")) {
    return <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt={label} className="mt-1 max-h-24 max-w-full rounded-lg border border-slate-200 object-contain"/>
    </>;
  }
  if (images.length) {
    return <div className="mt-1 flex flex-wrap gap-2">{images.map((image, index) => <span key={`${label}-${index}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`${label} ${index + 1}`} className="h-20 w-24 rounded-lg border border-slate-200 object-cover"/>
    </span>)}</div>;
  }
  return <dd className="mt-1 break-words text-sm text-slate-800">{typeof value === "object" && value !== null ? JSON.stringify(value) : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value || "—")}</dd>;
}

export default function DemoPage() {
  const [view, setView] = useState<DemoView>("forms");
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
      setForms((current) => [form, ...current]); setSelectedId(form.id); setAnswers({}); setPrompt(""); setSourceFile(null); setView("form");
      setMessage("Your AI form is ready. Try filling it in and submit it here.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI form creation failed.");
    } finally { setGenerating(false); }
  }

  function submitLocalForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = fields.find((field) => {
      const value = answers[field.id];
      if (!field.required) return false;
      if (field.type === "checkbox") return value !== true;
      if (field.type === "photo") return !Array.isArray(value) || value.length === 0;
      if (field.type === "signature") return typeof value !== "string" || !value.startsWith("data:image/");
      if (field.type === "dynamic-table") return !value || typeof value !== "object" || Object.keys(value).length === 0;
      return value == null || value === "";
    });
    if (missing) {
      setMessage(`Please complete: ${missing.label}`);
      return;
    }
    setSubmissions((current) => [{ formTitle: selected.title, submittedAt: new Date().toISOString(), answers }, ...current].slice(0, 30));
    setAnswers({});
    setMessage("Form submitted successfully.");
    setView("submissions");
  }

  function resetDemo() {
    setForms(starterForms); setSelectedId(starterForms[0].id); setAnswers({}); setSubmissions([]); setMessage(""); setView("forms");
    setGenerationCount(0);
    try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(GENERATION_KEY); } catch { /* ignore */ }
  }

  const panelTitle = view === "form" ? selected.title : view === "builder" ? "Create a form with AI" : "Submitted forms";
  return (
    <main className="min-h-dvh bg-[#f4f7f6] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {view !== "forms" ? <button type="button" onClick={() => { setView("forms"); setMessage(""); }} aria-label="Back to My forms" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronLeft className="h-5 w-5"/></button> : null}
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="ISO Grid home"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-800 text-xs font-bold text-white">ISO</span><span><span className="block text-sm font-semibold">ISO Grid</span><span className="block text-[11px] text-slate-500">Quality in motion</span></span></Link>
            {view !== "forms" ? <h1 className="ml-1 truncate text-sm font-semibold sm:ml-3 sm:text-base">{panelTitle}</h1> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2"><button type="button" onClick={resetDemo} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 sm:w-auto sm:gap-2 sm:px-3" aria-label="Reset demo"><RotateCcw className="h-4 w-4"/><span className="hidden text-sm sm:inline">Reset</span></button><Link href="/signup" className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-900 sm:px-4 sm:text-sm">Create account<ArrowRight className="h-4 w-4"/></Link></div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {message ? <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-teal-800/15 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Check className="mt-0.5 h-4 w-4 shrink-0"/>{message}</div> : null}

        {view === "forms" ? <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-800">Demo workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">My forms</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Try a sample form or make your own. Everything here stays in this browser session.</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" onClick={() => { setMessage(""); setView("builder"); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-800 px-3 text-sm font-semibold text-white hover:bg-teal-900 sm:px-4"><Sparkles className="h-4 w-4"/>Build with AI</button><button type="button" onClick={() => setView("submissions")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:px-4"><ClipboardList className="h-4 w-4"/>Submissions <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{submissions.length}</span></button></div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{forms.map((form) => <button key={form.id} type="button" onClick={() => { setSelectedId(form.id); setAnswers({}); setMessage(""); setView("form"); }} className="group flex min-h-36 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-700/30 hover:shadow-md sm:p-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><FileText className="h-5 w-5"/></span><span className="mt-4 flex w-full items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{form.title}</span><ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-800"/></span><span className="mt-1 text-xs text-slate-500">{form.source === "ai" ? "AI form · this session" : "Sample form · ready to try"}</span></button>)}</div>
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><p className="text-sm font-semibold">A private playground</p><p className="mt-1 text-xs leading-5 text-white/65">Forms and submissions clear when you reset the demo or end this browser session.</p></div><Link href="/signup" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900">Ready for your team?<ArrowRight className="h-4 w-4"/></Link></div>
        </div> : null}

        {view === "builder" ? <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="bg-[radial-gradient(ellipse_at_top_right,_rgba(45,212,191,.24),_transparent_65%),linear-gradient(135deg,#0f2928,#164e4a)] p-5 text-white sm:p-7"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-teal-100"><Sparkles className="h-4 w-4"/>AI form studio</div><p className="mt-2 text-sm leading-6 text-white/75">Describe a form or upload a PDF or photo. AI will turn it into an interactive form you can try.</p></div><div className="p-4 sm:p-7"><form onSubmit={createWithAi} className="space-y-3"><label className="block text-sm font-medium text-slate-800" htmlFor="demo-prompt">What form do you need?</label><textarea id="demo-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1500} placeholder="For example: Create a daily kitchen opening checklist with yes/no checks and a manager sign-off." className="min-h-36 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10"/><div className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-teal-700 hover:bg-teal-50/50"><FileUp className="h-4 w-4 shrink-0 text-teal-800"/><span className="min-w-0 flex-1 truncate">{sourceFile ? sourceFile.name : "Add a PDF or photo"}</span>{sourceFile ? <button type="button" aria-label="Remove source file" className="rounded-lg p-1 hover:bg-slate-200" onClick={() => setSourceFile(null)}><X className="h-4 w-4"/></button> : <label className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50">Choose<input type="file" className="sr-only" accept={SOURCE_DOCUMENT_ACCEPT} disabled={generating || generationCount >= SESSION_GENERATION_LIMIT} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const result = validateSourceDocument(file); if (!result.ok) { setMessage(result.error); event.target.value = ""; return; } setSourceFile(file); setMessage(""); }}/></label>}</div><button disabled={generating || (generationCount < SESSION_GENERATION_LIMIT && !prompt.trim() && !sourceFile)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin"/> : generationCount >= SESSION_GENERATION_LIMIT ? <LockKeyhole className="h-4 w-4"/> : <Sparkles className="h-4 w-4"/>}{generating ? "Building your form…" : generationCount >= SESSION_GENERATION_LIMIT ? "Create an account to continue" : "Build with AI"}</button></form><div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>AI generations left in this session</span><span className="font-semibold text-slate-700">{Math.max(0, SESSION_GENERATION_LIMIT - generationCount)} of {SESSION_GENERATION_LIMIT}</span></div></div></section> : null}

        {view === "form" ? <section className="mx-auto max-w-3xl space-y-4"><div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => setAccountGateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-teal-700/30"><LockKeyhole className="h-4 w-4"/>PDF export</button><button type="button" onClick={() => setAccountGateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-teal-700/30"><LockKeyhole className="h-4 w-4"/>Share</button></div><form onSubmit={submitLocalForm} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{selected.title}</h2><p className="mt-2 text-sm text-slate-500">Complete the fields and submit when finished.</p><div className="mt-6 space-y-5">{(selected.schema.sections || []).map((section, index) => <div key={`section-${index}`}><h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">{section.title || "Form details"}</h3><div className="grid gap-4 sm:grid-cols-2">{(section.type === "fields" ? section.fields : section.columns).filter((field) => field.isActive !== false).map((field) => <div key={field.id} className={`block text-sm font-medium text-slate-700 ${field.type === "display" || field.type === "static" || field.type === "dynamic-table" || field.type === "photo" || field.type === "signature" || (field.type === "text" && field.multiline) ? "sm:col-span-2" : ""}`}>{field.type !== "checkbox" ? <span>{field.label}{field.required ? <span className="ml-1 text-rose-600">*</span> : null}</span> : null}<DemoField field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}/></div>)}</div></div>)}</div><div className="mt-6 border-t border-slate-100 pt-4"><button type="submit" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-black sm:w-auto">Submit form<ArrowRight className="h-4 w-4"/></button></div></form></section> : null}

        {view === "submissions" ? <section className="mx-auto max-w-3xl"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-800">This browser session</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Submitted forms</h2><p className="mt-2 text-sm text-slate-600">Your records are shown newest first.</p></div>{submissions.length ? <div className="space-y-3">{submissions.map((submission, index) => <article key={`${submission.submittedAt}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h3 className="font-semibold">{submission.formTitle}</h3><time className="text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</time></div><dl className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">{Object.entries(submission.answers).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium capitalize text-slate-500">{key.split("_").join(" ")}</dt><SubmissionAnswer value={value} label={key.split("_").join(" ")}/></div>)}</dl></article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-12"><ClipboardList className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-3 font-semibold">No submissions yet</h3><p className="mt-1 text-sm text-slate-500">Open one of the sample forms and submit it to see the record here.</p><button type="button" onClick={() => setView("forms")} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white">Browse My forms<ArrowRight className="h-4 w-4"/></button></div>}</section> : null}
      </div>
      {accountGateOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountGateOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="demo-account-title" className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><LockKeyhole className="h-5 w-5"/></div><h2 id="demo-account-title" className="mt-4 text-xl font-semibold text-slate-950">Unlock the full workspace</h2><p className="mt-2 text-sm leading-6 text-slate-600">PDF export and sharing are turned off in the demo. Create an account to keep forms, share them with your team, and export completed records.</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><Link href="/signup" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900">Create account<ArrowRight className="h-4 w-4"/></Link><button type="button" onClick={() => setAccountGateOpen(false)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Keep exploring</button></div></section></div> : null}
    </main>
  );
}
