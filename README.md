# HFN Command Center

Processing Command Center MVP for Homeland Financial Network. All displayed data is synthetic and public-dashboard safe.

## Run

Requires Node.js 18+. From this directory:

```powershell
npm test
npm start
```

Then open `http://localhost:4173`.

For a development-only synthetic intake test, POST a **synthetic** payload to `/api/development/arive/synthetic-event`. The production-shaped Zapier route is `POST /api/integrations/arive/events`; it is local-only in this prototype and does not initiate any connection to Zapier or ARIVE.

## Included in first pass

- Processing, assistant, leaderboard, attention, and public-safe loan-detail dashboard views.
- Synthetic records representing different team workloads, completed/outstanding tasks, breached and approaching SLAs, and CTC risk.
- PostgreSQL-oriented normalized schema in `db/schema.sql`.
- SLA engine and automated tests.
- HFN calendar defaults of Monday–Friday, 8:30 AM–5:00 PM Pacific, plus data-configured federal holidays.
- Idempotent historical-event ingestion model, automatic post-approval task creation, and an Integration Health/audit view using synthetic event records.
- Architectural guardrails and the ARIVE ingestion boundary in `ARCHITECTURE.md`.

## Before ARIVE/Zapier work

Implement the server API/database migration and configure authentication/authorization. Populate the holiday calendar, map/test real webhook/API payloads, and verify the exact Zapier/ARIVE triggers for each supported historical event. No ARIVE integration has been claimed or implemented.
