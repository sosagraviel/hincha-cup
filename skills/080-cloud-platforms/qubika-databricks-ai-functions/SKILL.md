---
name: qubika-databricks-ai-functions
description: "Use Databricks SQL AI functions (`ai_query`, `ai_classify`, `ai_extract`, `ai_summarize`) for Gold-layer LLM enrichment — with Qubika's cost guardrails, model-picking conventions, and watermarked re-run patterns. Read when enriching tabular data with an LLM in SQL rather than Python."
version: 1.0.0
domain: ai
owner: data-platform-team
---

# Qubika Databricks AI Functions

Databricks ships a family of SQL functions (`ai_query`, `ai_classify`, `ai_extract`, `ai_summarize`, `ai_translate`, `ai_mask`, `ai_similarity`, `ai_gen`) that call Foundation Model serving endpoints from inside a SELECT statement. They're how Qubika does LLM-based Gold-layer enrichment — classification, extraction, summarization — without writing a custom Python pipeline.

This skill is opinionated about *when* to use them (batch enrichment, yes; per-row Python UDFs, no) and *how* to make them cheap and reproducible at Qubika scale.

If a project is adding an LLM-enriched column to a Gold table, this is the reference.

**Upstream docs**: https://docs.databricks.com/aws/en/large-language-models/ai-functions

---

## When to Use This Skill

Use this skill when:
- Classifying rows into a fixed set of labels (sentiment, intent, topic, lead-stage)
- Extracting structured fields from free-text columns (entities, dates, amounts, dimensions)
- Summarizing long-form text into a snippet column on Gold
- Generating labels / explanations for downstream BI dashboards
- Doing any LLM enrichment that is **batched** and **periodic** (nightly / hourly), not per-event

Do NOT use this skill when:
- You need LLM-in-the-loop responses *per user interaction* — that's an app, not a pipeline (see Mosaic AI Agents, out of kit scope)
- The data is streaming and you want LLM enrichment in the same micro-batch — possible but expensive; usually better to enrich downstream batch
- A regex or `parse_json` already does the job — those are free, deterministic, and don't depend on a serving endpoint
- The data leaves Qubika's customer's tenancy — confirm the chosen model endpoint stays on-tenant before passing customer data

---

## Quick Start

A complete batch-classification pipeline. Reads new rows from a Silver table, classifies an `inquiry_text` column into a fixed set of categories, materializes the result in a Gold table with a watermark column so the next run only processes new rows:

```sql
-- Run this in a notebook or as a job task; works on serverless SQL warehouses.
-- Replace the endpoint name with the customer's chosen model (see Pattern 6).
USE CATALOG qubika_dev;
USE SCHEMA   analytics_support;

CREATE TABLE IF NOT EXISTS inquiries_classified (
  inquiry_id        STRING NOT NULL,
  inquiry_text      STRING,
  ai_category       STRING,          -- one of: billing / technical / sales / other
  ai_model          STRING,          -- pinned for reproducibility
  ai_classified_at  TIMESTAMP        -- watermark
)
USING DELTA
COMMENT 'Inquiry classification — populated by daily AI enrichment job.'
TBLPROPERTIES (
  'owner'        = 'support-data',
  'domain'       = 'support',
  'pii_contains' = 'true'             -- inquiry_text often contains PII
);

INSERT INTO inquiries_classified
SELECT
  s.inquiry_id,
  s.inquiry_text,
  ai_classify(s.inquiry_text, ARRAY('billing', 'technical', 'sales', 'other'))
    AS ai_category,
  'databricks-claude-haiku-4-5'        AS ai_model,
  current_timestamp()                  AS ai_classified_at
FROM qubika_dev.curated_support.inquiries s
WHERE s.received_at > coalesce(
        (SELECT max(ai_classified_at) FROM inquiries_classified),
        timestamp '1970-01-01'         -- bootstrap
      )
  AND s.inquiry_text IS NOT NULL
  AND length(s.inquiry_text) BETWEEN 10 AND 8000;   -- skip noise + protect token cost
```

The watermark in the WHERE clause is what makes this idempotent and cheap on re-run. The `length()` filter guards against the two cost-spikers: empty rows (waste calls) and outliers > 8k chars (each costs proportionally).

---

## Common Patterns

### Pattern 1: Classification — `ai_classify`

The simplest AI function. Pick one label from a fixed list. Use whenever you'd otherwise hand-write CASE WHEN regex rules.

```sql
SELECT
  ticket_id,
  ai_classify(
    description,
    ARRAY('bug', 'feature_request', 'question', 'spam')
  ) AS triage_label
FROM qubika_dev.curated_support.tickets
WHERE created_at >= current_date() - INTERVAL 1 DAY;
```

**Key points:**
- The label list is the contract. Add/remove labels = retroactive re-classification (see Pattern 7).
- Labels are case-sensitive; the function returns one of them verbatim, or `NULL` on failure.
- For multi-label use `ai_query` with a JSON-array prompt; `ai_classify` is single-label by design.

---

### Pattern 2: Extraction — `ai_extract`

Pull structured fields out of free text. Returns a struct with one field per requested key.

```sql
SELECT
  invoice_id,
  raw_text,
  ext.amount,
  ext.currency,
  ext.due_date,
  ext.vendor_name
FROM qubika_dev.raw_finance.invoices_ocr
LATERAL VIEW AS_STRUCT(
  ai_extract(raw_text, ARRAY('amount', 'currency', 'due_date', 'vendor_name'))
) AS ext
WHERE raw_text IS NOT NULL;
```

**Key points:**
- The model returns *its best guess* per field — always typed as STRING. Cast and validate downstream.
- Field names work as the prompt — `amount_usd` will bias the model toward USD. Pick names carefully.
- For non-trivial schemas use `ai_query` with an explicit JSON-schema prompt (Pattern 3).

---

### Pattern 3: Custom prompts — `ai_query`

The escape hatch. Use when `ai_classify` / `ai_extract` aren't expressive enough.

```sql
SELECT
  customer_id,
  ai_query(
    'databricks-claude-haiku-4-5',
    concat(
      'You are a CRM enrichment bot. Given the support thread below, return a JSON ',
      'object with keys: sentiment (positive|neutral|negative), churn_risk (low|med|high), ',
      'next_action (one short sentence). Respond ONLY with the JSON, no markdown.\n\n',
      'Thread:\n', conversation_text
    ),
    returnType => 'STRUCT<sentiment STRING, churn_risk STRING, next_action STRING>'
  ).*
FROM qubika_dev.curated_crm.support_threads
WHERE conversation_text IS NOT NULL
  AND length(conversation_text) < 16000;
```

**Key points:**
- `returnType` is the killer feature — Databricks parses the model's JSON for you and validates against the schema. **Use it.** Without it you get a STRING and have to JSON-parse manually.
- Pin the model in the function call (first arg). Don't read it from a config table per-row — the cost of resolving the config dominates the work.
- The prompt is the contract. Materialize it (see Pattern 5).

---

### Pattern 4: Bulk enrichment job — the canonical Qubika pattern

Every recurring AI-enrichment job at Qubika follows this shape: watermarked source read, length-guarded predicate, materialized prompt + model, audit columns.

```sql
-- Recommended as a SQL task in a daily DAB job (see qubika-databricks-bundles).
-- The watermark + length guard together cap each run's cost.

INSERT INTO qubika_dev.analytics_crm.leads_enriched
WITH
  -- 1. Pull only the slice that hasn't been enriched yet.
  unprocessed AS (
    SELECT *
    FROM qubika_dev.curated_crm.leads s
    WHERE s.created_at > coalesce(
            (SELECT max(ai_enriched_at) FROM qubika_dev.analytics_crm.leads_enriched),
            timestamp '1970-01-01'
          )
      AND s.notes IS NOT NULL
      AND length(s.notes) BETWEEN 20 AND 6000
  )
SELECT
  u.lead_id,
  u.notes,
  ai_classify(u.notes, ARRAY('hot', 'warm', 'cold', 'invalid'))         AS ai_temperature,
  ai_extract(u.notes, ARRAY('industry', 'employee_count', 'use_case'))  AS ai_extracted,
  'databricks-claude-haiku-4-5'                                          AS ai_model,
  'enrich_leads_v3'                                                      AS ai_prompt_id,   -- see Pattern 5
  current_timestamp()                                                    AS ai_enriched_at
FROM unprocessed u;
```

**Key points:**
- `ai_prompt_id` is a version string. When the prompt changes, bump the version; Pattern 7 explains how to back-fill.
- `ai_enriched_at` is the watermark for the *next* run — must include it on every output row.
- Schedule the job hourly only if the lead volume justifies it; daily is the default.

---

### Pattern 5: Materialize the prompt — reproducibility

LLM outputs depend on the prompt + model. If you can't reproduce the inputs, you can't debug the outputs. Qubika convention: every AI-enriched table has a `_prompt_registry` companion.

```sql
CREATE TABLE IF NOT EXISTS qubika_dev.analytics_crm._prompt_registry (
  prompt_id     STRING NOT NULL,
  prompt_text   STRING NOT NULL,
  model         STRING NOT NULL,
  return_type   STRING,
  created_at    TIMESTAMP NOT NULL,
  created_by    STRING,
  status        STRING                          -- 'active' / 'deprecated'
)
USING DELTA
COMMENT 'One row per (prompt, model) version used by AI-enrichment jobs in this catalog.';

INSERT INTO qubika_dev.analytics_crm._prompt_registry VALUES (
  'enrich_leads_v3',
  'You are a CRM lead-classifier. Given the lead notes below, classify the temperature...',
  'databricks-claude-haiku-4-5',
  'STRUCT<temperature STRING, industry STRING>',
  current_timestamp(),
  current_user(),
  'active'
);
```

**Key points:**
- An enriched row's `ai_prompt_id` must always resolve to a row in `_prompt_registry`. CI can assert this; treat as an FK.
- Never DELETE from `_prompt_registry` — mark `status='deprecated'`. Old enriched rows still reference the old version.
- The `_` prefix on the table name signals "internal — not for BI consumers".

---

### Pattern 6: Picking the model

| Model endpoint                              | When to use                                                        | Cost relative                  |
|---------------------------------------------|--------------------------------------------------------------------|--------------------------------|
| `databricks-claude-haiku-4-5`               | Default for classification, extraction, short summarization. Fast. | 1x (Qubika baseline)           |
| `databricks-claude-sonnet-4-6`              | When Haiku misclassifies in evaluation. Multi-step extraction.     | ~5x                            |
| `databricks-claude-opus-4-7`                | Last resort. Reasoning-heavy tasks. Cap concurrency.               | ~25x                           |
| `databricks-meta-llama-3-3-70b-instruct`    | Open-weight preference. Lower variance per token.                  | 2-3x                           |
| Custom Mosaic AI serving endpoint           | Customer-fine-tuned models. On-tenant data sensitivity.            | depends                        |

**Rule of thumb**: start with Haiku, evaluate on a 100-row sample (see Pattern 8), only upgrade if accuracy is unacceptable. The cost ratio between Haiku and Opus is ~25x — that's the difference between "$30/day" and "$750/day" on a 100k-row pipeline.

---

### Pattern 7: Re-enriching when the prompt changes

Prompts evolve. When you change `prompt_id` from v3 to v4, you usually need to re-enrich every row.

```sql
-- 1. Register the new prompt
INSERT INTO _prompt_registry VALUES ('enrich_leads_v4', '...new prompt...', '...', '...', current_timestamp(), current_user(), 'active');
UPDATE _prompt_registry SET status='deprecated' WHERE prompt_id='enrich_leads_v3';

-- 2. Re-enrich. The watermark predicate is what makes this controllable:
--    set ai_enriched_at to NULL on the rows you want to re-process. The next
--    job run will see them as "unprocessed".
UPDATE qubika_dev.analytics_crm.leads_enriched
SET ai_enriched_at = NULL
WHERE ai_prompt_id = 'enrich_leads_v3';
-- … then the daily job picks them up and re-enriches with v4.

-- For an immediate re-enrichment (no waiting for the schedule):
-- run the job's notebook ad-hoc against the same target table.
```

**Key points:**
- Don't TRUNCATE + reload — you lose history. Mark + re-pick is the canonical Qubika pattern.
- Re-enrichment cost ≈ "one full pipeline run". Budget accordingly.
- A side-by-side comparison table (`SELECT v3.label, v4.label, count(*) FROM …`) before deprecating v3 lets the team eyeball the regression.

---

### Pattern 8: Evaluate on a sample before going wide

Don't ship an enrichment pipeline without first running it on 100 representative rows and reading the output. The cheapest bug-fix is "before the 100k-row job ran".

```sql
-- Sample 100 rows stratified by category if you have one, else random.
WITH sample AS (
  SELECT *
  FROM qubika_dev.curated_crm.leads
  WHERE notes IS NOT NULL
  ORDER BY rand()
  LIMIT 100
)
SELECT
  lead_id,
  left(notes, 100) AS notes_preview,
  ai_classify(notes, ARRAY('hot', 'warm', 'cold', 'invalid')) AS ai_label
FROM sample;
-- Read the result. Disagree with > 5%? Tune the prompt before going wide.
```

Pair the eyeball check with `qubika-pipeline-testing`-style assertions if the labels are critical (e.g., they drive a downstream automated action).

---

## Anti-Patterns

| Anti-pattern                                                          | Why it's wrong                                                                | Correct alternative                                                  |
|-----------------------------------------------------------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Calling `ai_query` inside a Python UDF                                | One API call per row, no batching — pays the per-call overhead N times       | Use the SQL function directly; Databricks batches under the hood     |
| Re-classifying every row on every job run                             | Burns money; output is identical for rows that haven't changed                | Watermark predicate (Pattern 4)                                      |
| `WHERE notes IS NOT NULL` without a length guard                      | One stray 200k-char row spikes a single batch's cost 10x                      | `length() BETWEEN 20 AND 8000` (or appropriate per use case)         |
| Hardcoded `'databricks-claude-opus-4-7'` everywhere                   | Hidden 25x cost premium for tasks Haiku would handle                          | Default to Haiku; upgrade per-job with measured justification        |
| No `_prompt_registry`                                                 | Six months later, no one remembers what prompt produced "category=other"      | Materialize prompt + model + version; FK from enriched rows          |
| Passing raw customer text to a general-cloud endpoint                 | Possible data-residency / customer-NDA breach                                 | Confirm endpoint stays in-tenancy; use a Mosaic AI serving endpoint  |
| Using `ai_classify` for binary yes/no with `ARRAY('yes','no')`        | Wastes a model call on something `CASE WHEN regex` does deterministically     | Regex first; ai_classify only when patterns aren't enumerable        |
| Logging full prompts to stdout for "debugging"                        | Prompts often contain PII from the input column                               | Log `ai_prompt_id` + row id; the registry has the prompt text        |
| Renaming an AI-output column without a migration                      | Dashboards break silently — `ai_category` and `triage_label` are the same     | Add the new column, populate, switch consumers, drop the old in v+1  |

---

## Reference

**External**
- AI Functions overview — https://docs.databricks.com/aws/en/large-language-models/ai-functions
- `ai_query` reference — https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_query
- `ai_classify` reference — https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_classify
- `ai_extract` reference — https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_extract
- Foundation Model APIs (token rates, latency targets) — https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis

**Internal**
- `qubika-medallion-architecture` — AI-enriched columns belong in `qubika_*.analytics.*` (Gold), not `raw` or `curated`
- `qubika-data-quality` — DQX rules on `ai_category` columns (allowed-values check, null rate)
- `qubika-databricks-bundles` — packaging the daily enrichment job as a DAB task
- `qubika-cost-investigator` (agent) — when a `ai_query`-heavy job's DBU spend spikes
- `qubika-unity-catalog-governance` — masking on `notes` / `inquiry_text` columns that feed AI functions

---

## FAQ

| Question | Answer |
|----------|--------|
| Do AI functions work on a classic (non-serverless) warehouse? | Yes, but serverless gives consistent endpoint resolution. Prefer serverless for AI-heavy SQL. |
| What model do AI functions use by default? | `ai_classify`, `ai_extract`, `ai_summarize` etc. without an explicit endpoint use the workspace default. Pin it explicitly (Pattern 6) to avoid silent drift after a Databricks UI change. |
| How do I run AI functions against a customer-deployed (Mosaic AI) endpoint? | `ai_query('my-mosaic-endpoint-name', prompt, …)`. The endpoint name comes from `databricks serving-endpoints list`. |
| What's the token budget per call? | Endpoint-specific. Haiku 4.5 ≈ 200k context window; the function truncates inputs at the model's limit and may return NULL on overflow. The `length() BETWEEN …` guard in Pattern 4 prevents this implicitly. |
| Can I cache AI outputs? | The function doesn't cache. The watermark pattern (Pattern 4) achieves the same effect at the table level — once a row's enriched, it doesn't re-run. |
| What about cost monitoring? | `system.billing.usage` shows DBU spend by sku; the `qubika-cost-investigator` agent (or `/de-audit --deep`) surfaces the warehouses where AI-function jobs run. Tag the job and grep. |
| Are these functions deterministic? | No — same prompt + same model + same row can yield different outputs across calls. For reproducibility, materialize the output (Pattern 4); for *audit*, materialize the prompt (Pattern 5). |

---

## Related Skills

- `qubika-medallion-architecture` — Gold-layer catalog conventions for AI-enriched columns
- `qubika-data-quality` — DQX assertions over `ai_*` columns (null rate, allowed values)
- `qubika-databricks-bundles` — scheduling the enrichment job
- `qubika-unity-catalog-governance` — column masks on PII-bearing source text
- `qubika-pipeline-testing` — pytest patterns for the watermarked job
- `qubika-cost-investigator` (agent) — diagnosing cost spikes from AI-function-heavy jobs

---

## Changelog

| Version | Date       | Change          |
|---------|------------|-----------------|
| 1.0.0   | 2026-05-22 | Initial version |
