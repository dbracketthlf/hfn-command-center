# Friday MVP deployment

## Recommended target

Use one Render Node web service plus Render Postgres in the same region. It is the smallest managed Node/PostgreSQL setup for this MVP: Render supports Node web services and managed PostgreSQL, provides private internal database URLs within a region, and documents encrypted PostgreSQL storage and TLS for external connections. [Render service types](https://render.com/docs/service-types), [Render Postgres connection and encryption](https://render.com/docs/postgresql-creating-connecting)

## Required environment

`NODE_ENV=production` · `DATABASE_URL` (Render internal PostgreSQL URL) · `ARIVE_WEBHOOK_SECRET` (long random secret) · `PORT` (hosting-provided; Render sets it automatically).

Optional local-only: `HFN_DEMO_MODE=true`. It is rejected in production.

## Deploy steps

1. Create a paid Render Postgres instance and a Node web service in the same region; use the database's **internal** URL.
2. Add the required environment variables as service secrets. Do not place them in the repository or Zap payload.
3. Build command: `npm install`. Start command: `npm start`.
4. Run `npm run db:migrate` once against the production `DATABASE_URL` before enabling the webhook.
5. Confirm `GET /health` returns `200`, then confirm `GET /api/integrations/arive/health` is borrower-safe.
6. Create the Zapier webhook action only after HFN approves the test. Point it at `POST https://<service>/api/integrations/arive/events`.

## Webhook authentication

Set either `Authorization: Bearer <ARIVE_WEBHOOK_SECRET>` (preferred) or `X-HFN-Webhook-Secret: <ARIVE_WEBHOOK_SECRET>`. Requests without a valid secret get `401` before audit or processing.

## Payload privacy

The service never persists an unredacted ARIVE/Zapier delivery. Each inbound-audit record stores a SHA-256 fingerprint plus an allowlisted operational representation only: ARIVE System GUID and Display Loan ID; status/update dates; processor/assistant/team roles; city/state; purpose/type; and permitted milestone dates. Borrower identity, contact data, street address, DOB, and financial fields are discarded before audit persistence. There is no production raw-payload debug mode.

## Manual HFN configuration

- Generate and store the secret in an approved secret manager and configure it in Zapier.
- Restrict who can access raw webhook-audit records; they may contain borrower PII.
- Confirm database backups, retention period, database access roles, and HTTPS/custom domain.
- Send one synthetic Zapier test first; only then approve real loan status events.
