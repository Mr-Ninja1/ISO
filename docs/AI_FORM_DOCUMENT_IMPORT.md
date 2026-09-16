# Form Builder and AI Import Handoff

This document explains the intended behavior of the ISO Grid form builder and its AI document-import assistant. It is written as a handoff for future agents working on form extraction, table support, UX, validation, or export.

## Product goal

Users should be able to attach a readable form exported from Word, Excel, PDF, or a scan and receive a usable digital form with minimal manual work.

The goal is **information fidelity**, not pixel-perfect reproduction. Preserve the information, purpose, labels, data-entry workflow, and important static instructions. Simplify borders, spacing, merged cells, decorative layout, and other visual details when the builder cannot represent them directly.

The ideal flow is:

1. User selects AI mode or manual mode.
2. User attaches a document or describes the form.
3. AI identifies the form type and meaningful elements.
4. AI builds the closest supported schema.
5. AI explains any simplifications or uncertain areas.
6. User reviews the draft, edits if needed, and saves it.

The user should not need to understand grids, schema objects, or AI limitations. The assistant should only ask questions when it cannot safely determine what the form is collecting.

## Current supported source files

The current AI upload accepts:

- PDF
- JPG/JPEG
- PNG

The current upload limit is 10 MB. Direct `.docx` and `.xlsx` parsing is not implemented yet. Word and Excel documents should currently be exported to PDF or an image before upload. A future enhancement could add native Office parsing, but it must preserve the same semantic extraction rules described below.

## Builder capabilities

### Form types

The schema can classify forms as:

- `custom`
- `checklist`
- `questionnaire`
- `answer-sheet`
- `inspection`
- `handwritten`

The AI should choose the closest type based on the form's purpose, not merely its visual appearance.

### Field types

Supported fields are:

- Text, including multiline text
- Date
- Time
- Number
- Temperature with Celsius/Fahrenheit and optional limits
- Yes/no
- Checkbox
- Photo evidence
- Signature
- Display/instruction text

Display fields are read-only. They are appropriate for titles, instructions, warnings, document references, section headings, flattened merged headers, and other text that should remain visible but is not submitted as data.

### Sections and tables

The schema supports:

- Fields sections with 1–4 layout columns
- Repeatable grid/table sections
- Wide tables with as many meaningful source columns as needed
- Horizontally scrollable table editing and data entry
- Static seeded rows, such as printed equipment or checklist item lists
- Read-only columns for fixed item labels
- Merged cells when a user creates them manually in the builder
- Separate sections for separate logical tables

Every grid column has one datatype across its repeated rows. This is the key table constraint. A source table that visually mixes checklist rows, signature rows, instructions, totals, or approvals must be decomposed instead of copied literally.

## AI extraction principles

The AI should:

- Preserve every recognizable meaningful label.
- Preserve document number, issue date, revision, prepared-by, approved-by, site, store, minimum/maximum values, instructions, warnings, and approval information.
- Identify the purpose and classify the form.
- Detect repeated rows and continuing tables across pages.
- Combine pages into one logical grid when the column meaning remains the same.
- Create separate grids when the column meaning changes.
- Use seeded read-only rows for printed item lists.
- Flatten grouped or merged headers into explicit labels.
- Use display fields for static text and instructions.
- Move embedded sign-off rows into separate signature fields.
- Keep identity columns such as serial number, name, and job title together in attendance/status forms.
- Explain adaptations in the extraction summary.
- Keep uncertain content represented where possible and list it for review.
- Never invent data fields that are not supported by the source or the user's request.

The AI should be decisive when a document is readable. Complex layout alone is not a reason to ask questions.

### Datatype inference

The AI must infer field types from both labels and visual evidence. For example, in a cleaning sheet with columns headed `06:00`, `07:00`, `08:00`, and so on, narrow repeated cells intended to be ticked should become checkbox columns such as `06:00 - cleaned`.

Use these rules:

- `checkbox`: independent completion marks, tick boxes, or empty mark-only cells
- `yesno`: explicit Yes/No, Pass/Fail, OK/Not OK, or similar decisions
- `number`: quantities, counts, balances, or measurements
- `date` / `time`: values the user enters as dates or times, not labels for a tick interval
- `signature`: visible signing areas or columns explicitly marked sign/signature
- `text`: names, initials, comments, notes, or ambiguous free-form entries

Cell width alone is not enough evidence for a checkbox. If the cells visibly contain space for numbers, initials, dates, or comments, preserve those types. If the visual evidence is ambiguous, use the least destructive supported type and list the uncertainty in the extraction report.

## Table normalization rules

### Tables with complex visual structure

The importer should keep one logical grid when the same table continues across pages. It should flatten merged or grouped headers into clear labels and explain that adaptation in the extraction notes.

A grid column has one datatype for every repeated row. If a source table contains signature, approval, instruction, total, or summary rows mixed into the checklist rows, the importer must not force those rows into the grid. It should keep the repeated checklist as a grid and create separate fields outside the grid. For example, daily HSEQ and manager sign-off rows become separate signature fields named for their role and day.

### Common table patterns

The importer should recognize these patterns without requiring the user to explain the layout:

- Stock cards: preserve item, size, minimum, maximum, store, received, issued, balance, expiry, and verification information. Flatten grouped headers into explicit column labels.
- Attendance or status matrices: preserve identity columns such as serial number, full name, and job title, then create consistent status or confirmation columns for each day or period.
- Hygiene and inspection checklists: preserve the instruction text and questions, then separate the repeated staff/date/status matrix from the explanatory content.
- Multiple logical tables on one page: create separate sections or grids when the column meaning changes.
- A table continuing across pages with the same columns: combine it into one logical grid and preserve all rows.

Static document labels such as document number, issue date, revision, prepared by, approved by, site, store, minimum/maximum values, and instructions must remain visible in the generated form. They should become fields when users need to enter them, or display fields when they are fixed instructions or reference text.

This means a visually complex source may not look identical after import, but users can still capture every meaningful value and understand why the layout was simplified.

## Common source patterns

### Weekly cleaning checklist

Typical structure:

- Item and frequency columns
- Repeated day columns with subcolumns such as cleaned by and supervisor sign
- Embedded HSEQ and manager signature rows

Expected representation:

- One cleaning-item grid
- Explicit labels such as `Monday - cleaned by` and `Monday - supervisor sign`
- Separate signature fields for embedded sign-off rows
- Static location, week, month, year, and instructions preserved as fields or display text

### Stock management card

Typical structure:

- Item, size, minimum, maximum, and store details
- Grouped movement headers such as received, issued, and in stock
- Verification/audit columns

Expected representation:

- Header fields for item, size, minimum, maximum, and store
- One movement grid with explicit labels for supplier, quantity, dates, expiry, issued-to, balance, and verification
- Grouped headers flattened without dropping subcolumns

### Staff hygiene or status matrix

Typical structure:

- Long instructions and hygiene questions
- Staff identity columns
- Repeated day/status/comment columns
- Manager or supervisor sign-off

Expected representation:

- Display fields for instructions
- Question fields or a checklist grid for hygiene requirements
- Separate attendance/status grid with consistent datatypes
- Separate signature fields for manager/supervisor approval

## Ask, proceed, or reject

### Proceed automatically

Proceed when the document is readable enough to identify its purpose, labels, fields, or table structure. This includes:

- Merged or grouped headers
- Wide tables
- Multi-page forms
- Tables that continue across pages
- Word/Excel-style borders and formatting
- Embedded sign-off rows that can be separated
- Unusual but understandable layouts

### Ask clarification questions

Ask no more than five focused questions when a missing detail blocks a reliable form. Examples:

- A header is readable but its field purpose is unclear.
- A table has two possible interpretations for a repeated column.
- A blurry area could contain either a signature or a text field.
- It is unclear whether printed item names should be fixed read-only rows or user-entered rows.
- A page is cropped or rotated enough that important labels cannot be read.

Questions should be about missing meaning, not visual preferences the system can safely simplify.

### Reject or stop generation

Do not generate a fake form when the source is:

- Blank or nearly blank
- Only a logo, cover page, decorative poster, or letter with no data-capture workflow
- Too blurry, dark, cropped, or damaged to identify meaningful labels or fields
- A non-form document with no questions, records, checklist items, table data, approvals, or other information to collect
- So contradictory that no safe interpretation exists
- An unsupported file type or an upload over the file-size limit

The rejection should explain the reason in plain language and suggest a useful next action, such as uploading a clearer scan, attaching the relevant pages, or describing the data the form should collect.

The AI should not reject a form merely because it contains complex tables. Complex tables are the expected hard case and should be normalized.

## User-facing extraction report

After generation, show a concise report containing:

- Detected form type
- Sections, fields, and grids created
- Pages inspected, tables detected, controls detected, confidence, and coverage status
- Static rows imported
- Adaptations made
- Uncertain labels or regions
- Content that needs user review

Example:

> Detected an inspection checklist with one repeated table and 24 static items. Flattened grouped day headers into clear columns and moved the embedded daily sign-off rows into separate signature fields. Review the two blurry approval labels before saving.

The report should help the user understand what happened without exposing internal implementation details.

The assess phase may return `rejected` before generation. The client must show the reason and suggested next action, and must not create a placeholder schema or consume a generation for blank, decorative, non-data, or fundamentally unreadable documents.

## Export and usability

Wide tables must remain usable in the builder through horizontal scrolling. PDF export should never silently discard columns or rows. It should choose portrait or landscape based on the content and fit the table without clipping.

For extremely wide tables, shrinking the entire table until it is unreadable is not ideal. A future export improvement should split a wide table across linked landscape pages while repeating identifying columns such as item, name, or date.

## Current limits and future improvements

Current limits:

- PDF/JPG/PNG uploads only
- 10 MB source file limit
- Seeded item rows are capped at 200
- Numeric grid row defaults are bounded for safety, while dynamic grids support longer lists
- AI output depends on source readability and model quality

Potential future improvements:

1. Native `.docx` and `.xlsx` import using structured parsers.
2. PDF page-count and per-page quality checks.
3. Page coverage reporting so users know which pages contributed data.
4. Explicit AI rejection responses for decorative or non-data documents.
5. Better recognition of merged/grouped headers and table continuation.
6. Automatic column splitting across PDF pages for very wide tables.
7. A user-editable extraction review before the form is saved.
8. Test fixtures based on real stock cards, cleaning checklists, attendance matrices, and inspection forms.

## Implementation reference

Important implementation files:

- `src/types/forms.ts` — schema, field types, sections, grids, merged cells
- `src/lib/ai/formEnginePrompt.ts` — AI capabilities and extraction rules
- `src/lib/ai/generateFormSchema.ts` — AI response parsing and schema sanitization
- `src/lib/ai/sourceDocument.ts` — upload validation and current file limits
- `src/app/api/templates/ai-generate/route.ts` — assess/generate API flow
- `src/components/forms/AiFormChatModal.tsx` — AI upload and clarification UI
- `src/app/[tenantSlug]/templates/new/page.tsx` — generation flow and review modal
- `src/components/forms/FormBuilder.tsx` — manual field and grid builder
- `src/lib/gridLayout.ts` — grid rendering and merged-cell layout logic
- `src/lib/pdfGenerator.ts` — PDF fitting and orientation logic

## Clarification behavior

The importer should proceed automatically when the labels and purpose are readable, even if the source has merged headers, multiple pages, or unusual spacing. It should ask questions only when the source is unreadable or the intended data cannot be determined reliably.
