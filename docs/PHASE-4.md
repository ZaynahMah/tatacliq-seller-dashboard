# Phase 4 — Seller Communication Automation & Production Hardening

## Goals

- Auto-draft and send "Request Missing Information" emails to sellers when products have unresolved missing fields.
- Auto-process seller replies (re-ingest attachments, re-enrich, close validation issues).
- Make the queue resilient (retries, dead-letter, alerting).
- Submit to seller portal API.
- Production deployment.

## Auto-reply workflow

```mermaid
flowchart LR
    A[Validation finds missing fields] --> B[notify queue]
    B --> C[Gemini drafts polite email body]
    C --> D[Ops review (optional auto-send threshold)]
    D --> E[Gmail API: send via zaynah15mahmood@gmail.com]
    E --> F[Seller replies on same thread]
    F --> G[Gmail webhook / poll detects reply]
    G --> H[Re-parse + re-enrich the product]
    H --> I[Close ValidationIssue rows]
```

## Email template (Gemini-drafted)

System prompt for the drafter:

```
You are an operations associate at TataCLiQ writing to a seller about catalog
fixes. Tone: polite, concise, action-oriented. Format: short paragraphs +
bullet list of missing items. Sign off with: "Catalog Operations Team".
Do NOT mention competitor platforms (Myntra, Ajio, Amazon).
```

## BullMQ resilience

| Queue | Attempts | Backoff |
|-------|----------|---------|
| parse | 3 | exponential, base 2s |
| enrichment | 3 | exponential, base 5s |
| image | 2 | exponential, base 10s |
| validate | 3 | exponential, base 2s |
| sheet | 2 | exponential, base 2s |
| notify | 5 | exponential, base 30s |

Failed jobs after max attempts move to a `dead-letter` set; alert via Slack webhook.

## Notifications

- In-app toast: new email, job completed, validation failed.
- Slack: critical job failures, daily summary.
- Email digest: weekly seller quality scorecard.

## Submit to Seller Portal

A `portal-submit` worker pushes master sheets to the TataCLiQ seller portal API. This requires:

- Portal API credentials (per-seller, stored encrypted).
- Idempotency keys to prevent double-submits.
- Status polling: pending → accepted/rejected.

## Production deployment

- **Containers**: build images for `web`, `api`, `enrichment-worker`, `image-worker`.
- **Orchestration**: ECS Fargate or Kubernetes (image worker needs GPU node pool).
- **Postgres**: RDS Postgres 16 with PITR.
- **Redis**: ElastiCache.
- **S3**: bucket per environment, versioning on, lifecycle to Glacier after 90 days.
- **Secrets**: AWS Secrets Manager. `GEMINI_API_KEY`, Gmail OAuth refresh tokens, portal creds.
- **Observability**: OpenTelemetry traces → Datadog/Grafana; structured JSON logs.
- **CI**: GitHub Actions — lint, typecheck, test, build images, deploy on main.

## Security checklist

- OAuth refresh tokens encrypted at rest (KMS).
- S3 buckets blocked from public access; serve via presigned URLs only.
- Gemini calls rate-limited per ops user.
- RBAC: only `ADMIN` role can submit to portal or change Gmail account.
- Audit log table for every attribute change.
