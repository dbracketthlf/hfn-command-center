# HFN Command Center architecture

## First-pass decision

This repository is a dependency-free, runnable dashboard prototype backed by synthetic data. It demonstrates the product and protects the domain model from ARIVE. It is intentionally not yet a production authentication, API, or database deployment.

The production path is a single web application with a server-side API, PostgreSQL, and a scheduled/webhook ingestion worker. This keeps deployment small while allowing later HFN modules to share users, loans, events, and metrics.

```
ARIVE / Zapier webhooks → inbound_events (raw audit) → mapper/validator → HFN normalized tables → server API → Command Center UI
```

## Key design choices

- `loan_stage_events` is append-only historical evidence. The system never derives earlier stage timestamps from the mutable current stage field.
- `inbound_events` retains only an allowlisted operational audit representation, its receipt time, and a SHA-256 fingerprint of the original delivery. It never persists the unredacted payload.
- SLAs are evaluated from normalized events/assignments. The calendar config is explicit: 8:30–5 Pacific, Monday–Friday, with a configurable holiday table. CTC alone is calendar-day based.
- Conditions reviewed are represented by `manual_events`; no automatic source is implied.
- Assistant task records include four individually visible orders plus the `post_approval_orders` aggregate bundle.
- The public dashboard only uses the loan ID, operational ownership, stage, general city/state, purpose, and SLA data. Private borrower detail must be separately authorized.

## Known integration decision

Initial-disclosure completion is `DISCLOSED`; the start is the later of `LOAN_SETUP` and processor-assistant assignment. Loan Setup completion remains a deliberately separate manual/future event (`loan_setup_completed`) because no ARIVE completion event exists.

## Integration trigger mapping status

The event processor supports all agreed internal event names and idempotency. No live ARIVE/Zapier workflow has been tested in this prototype. The supplied field list identifies current loan status and dates, but this repository has no actual Zapier trigger export to verify whether it emits each historical transition. Before live work, map and test: current-status transitions for `LOAN_SETUP`, `DISCLOSED`, `UNDERWRITING_SUBMITTED`, `APPROVED_WITH_CONDITION`, `CLEAR_TO_CLOSE`, `CD_SENT`, and `LOAN_FUNDED`; the assignment field/change for processor assistant; and the ITP-signed event. If Zapier only supplies a changing snapshot, capture it on receipt into `inbound_events` and derive a single stage event—never backfill a fabricated occurrence time.

## Future modules

Sales, lead-company, executive, and AI modules belong in separate feature areas but use the same normalized loan/event foundation. They are not included in this MVP.
