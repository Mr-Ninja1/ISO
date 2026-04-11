# QHSE Product Guidance And To-Do

## Purpose
This document maps the client requirements to the current product status and defines the next implementation backlog.

Use this as the single working to-do for delivery planning, sprinting, and client updates.

## Requirement Coverage Snapshot

Legend:
- Done: available and usable now
- Partial: foundation exists but full module is not complete
- Next: not implemented yet

### 1) User Management
- Status: Partial
- Done now:
  - Secure login and session handling
  - Tenant membership and admin/member roles
- Missing:
  - Full role matrix requested by client (Admin, Manager, Supervisor, Staff)
  - Electronic signatures and user activity trail screens

### 2) Digital Checklists And Forms
- Status: Done
- Done now:
  - Schema-driven custom forms
  - Yes/No, dropdown, text, numeric, checkbox, temperature, signature field types
  - Date/time capture through form inputs
  - Form builder and runtime renderer

### 3) Temperature Monitoring (HACCP CCP)
- Status: Partial
- Done now:
  - Temperature fields and alert thresholds in forms
  - Audit capture and persistence
- Missing:
  - Dedicated CCP trend charts/dashboard
  - Corrective-action linkage from out-of-spec events

### 4) Incident Reporting
- Status: Next
- Missing:
  - Incident capture workflow
  - Investigation flow
  - Incident dashboard

### 5) Corrective Action Management
- Status: Next
- Missing:
  - Assigned owner, due date, status lifecycle (Open/In Progress/Closed)
  - Evidence upload and close-out verification
  - Overdue tracking

### 6) Audit Management
- Status: Partial
- Done now:
  - Internal audit checklists
  - Audit submission and report viewing
  - Template versioning controls for compliance-safe updates
- Missing:
  - Compliance scoring model surfaced in management dashboards
  - Formal tracking board for audit findings

### 7) Dashboard And Reports
- Status: Partial
- Done now:
  - Core audit report page
- Missing:
  - Executive dashboard widgets and trend analytics
  - Export to PDF and Excel for management packs

### 8) Document Management
- Status: Next
- Missing:
  - SOP/policy/HACCP document repository
  - Version control and controlled access

### 9) Notifications And Alerts
- Status: Partial
- Done now:
  - In-app notification modal patterns
  - Form-level threshold highlighting
- Missing:
  - Scheduled reminders (audit reminders, overdue actions)
  - Persistent notification center and delivery preferences

### 10) Technical Requirements
- Android app: Next
- iOS app: Next
- Web dashboard: Done
- Cloud secure storage: Done
- Offline sync: Done

## Current Strengths To Preserve
- Fast cache-first workspace and form loading
- Offline-first draft and sync architecture
- Schema-driven forms with reusable renderer/builder
- Template versioning and compliance-aware edit restrictions
- OCR-assisted form import MVP

## Prioritized Backlog (Execution To-Do)

## P0: Commercially Critical
- [ ] Implement Incident Reporting module (create/read/update/list, photo evidence, severity, category)
- [ ] Implement Corrective Action module (owner, due date, status, evidence)
- [ ] Build overdue action logic and reminder notifications
- [ ] Add management dashboard with compliance KPIs and trend charts
- [ ] Add PDF and Excel export endpoints for reports

## P1: Compliance Depth
- [ ] Introduce full role model: Admin, Manager, Supervisor, Staff
- [ ] Add electronic signature events and immutable audit trail log
- [ ] Implement audit findings register linked to corrective actions
- [ ] Add HACCP CCP trend dashboard and out-of-spec event stream

## P2: Enterprise Controls
- [ ] Build document management module for SOPs, policies, HACCP plans
- [ ] Add document versioning and controlled visibility rules
- [ ] Add approval workflows for controlled documents

## P3: Mobile Delivery
- [ ] Package web experience as PWA baseline
- [ ] Wrap for Android and iOS deployment (Capacitor or React Native path)
- [ ] Add device camera and offline file queue optimizations

## OCR Feature Productization To-Do
- [ ] Add confidence scoring per imported field
- [ ] Add low-confidence review modal before applying schema
- [ ] Add cost controls (quotas, per-tenant limits, fallback model routing)
- [ ] Add telemetry for OCR success rate and correction rate

## Suggested Delivery Phases
- Phase 1 (2-3 weeks): Incident + Corrective Action core workflows
- Phase 2 (2-3 weeks): Dashboards, reporting exports, reminders
- Phase 3 (2-3 weeks): Role expansion, signatures, audit trail, findings register
- Phase 4 (2-3 weeks): Document management and version control
- Phase 5 (1-2 weeks): Mobile packaging, hardening, UAT

## Definition Of Done (Per Feature)
Each feature should only be marked complete when all of the following are true:
- API endpoints implemented with authorization checks
- UI screens implemented for target roles
- Validation and error handling complete
- Offline behavior defined where relevant
- Audit logging included for compliance-sensitive actions
- Basic test coverage added (happy path + key failures)
- Documentation updated in this file

## Working Rules
- Keep this file updated after each major merge
- Move items from Partial/Next to Done only after validation
- Add date and owner for each delivered feature in commit notes
