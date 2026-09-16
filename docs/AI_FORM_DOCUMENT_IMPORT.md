## AI document import behavior

AI import preserves the form's meaning, not every visual detail. It uses the form builder's supported field types, repeatable grids, display fields, static seeded rows, and signatures.

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

### Clarification behavior

The importer should proceed automatically when the labels and purpose are readable, even if the source has merged headers, multiple pages, or unusual spacing. It should ask questions only when the source is unreadable or the intended data cannot be determined reliably.
