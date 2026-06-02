---
name: qubika-databricks-vector-search
description: "Build and query Databricks Vector Search indexes for RAG on Qubika data. Covers Delta Sync indexes from Delta tables, SQL `vector_search()` + Python SDK queries, metadata filters for tenancy isolation, hybrid search, and the reindex flow when embedding models change. Read when standing up RAG / similarity search on top of Gold or curated data."
version: 1.0.0
domain: ai
owner: data-platform-team
---

# Qubika Databricks Vector Search

Databricks Vector Search is a managed vector index that sits on top of a Delta table. You point it at a text column, pick an embedding model, and Databricks keeps the index in sync as the source table changes. Queries come in via SQL (`vector_search()` function) or the Python SDK (`VectorSearchClient`) and return ranked rows from the source table.

This skill covers the patterns Qubika uses to build RAG / similarity / recommendation features on top of curated data — with metadata-filtered queries so customer-tenancy doesn't bleed across, and the reindex discipline that keeps the index from drifting when models change.

If a project is building a "search this Slack thread / customer ticket / product doc" capability on top of Databricks, this is the reference.

**Upstream docs**: https://docs.databricks.com/aws/en/generative-ai/vector-search

---

## When to Use This Skill

Use this skill when:
- Standing up RAG over curated text data (support tickets, product docs, internal wikis, customer-facing knowledge bases)
- Adding similarity-search / "find related rows" to a Gold-layer application
- Replacing a hand-rolled embedding-table-plus-cosine-similarity setup
- Combining metadata filters (customer_id, domain, language) with vector ranking
- Doing hybrid search (keyword + vector) — common for product search

Do NOT use this skill when:
- The dataset is < ~10k rows and `ai_similarity()` (or even a single embedding model call per query) is enough — Vector Search has fixed serving-endpoint cost
- You need real-time per-user-write indexing — Delta Sync indexes are near-real-time (seconds-to-minutes), not millisecond
- The data is binary (audio, image, PDF pages without OCR) — Vector Search indexes text; pre-extract text first
- You want generative output, not retrieval — pair this with `qubika-databricks-ai-functions` for the generation step

---

## Quick Start

A complete end-to-end RAG-source setup: a Delta Sync index over the `support tickets` curated table, queried via SQL with a tenancy filter:

```python
# Run this in a notebook with `databricks-vectorsearch` installed.
# One-time setup — the index reuses the source table's storage; we just declare
# the schema and which column to embed.

from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# 1. Endpoint = the compute that serves queries. One per workspace is usually enough.
#    Qubika convention: `qubika-vs-shared` for cross-domain workloads.
vsc.create_endpoint_and_wait(
    name="qubika-vs-shared",
    endpoint_type="STANDARD",       # vs "STORAGE_OPTIMIZED" for >100M-row indexes
)

# 2. Source Delta table must have a primary key + CDC enabled.
# Qubika convention: source tables for vector search live in {env}.curated_*,
# never in raw — embeddings get expensive, only run them once Bronze→Silver has
# happened.
spark.sql("""
ALTER TABLE qubika_dev.curated_support.tickets
  SET TBLPROPERTIES (delta.enableChangeDataFeed = true)
""")

# 3. Create the Delta Sync index. Databricks computes embeddings using the
# chosen managed model and keeps them in sync via CDF.
vsc.create_delta_sync_index_and_wait(
    endpoint_name="qubika-vs-shared",
    index_name="qubika_dev.vectorsearch.support_tickets_idx",
    source_table_name="qubika_dev.curated_support.tickets",
    pipeline_type="TRIGGERED",      # 'CONTINUOUS' for near-real-time (more cost)
    primary_key="ticket_id",
    embedding_source_column="ticket_body",
    embedding_model_endpoint_name="databricks-gte-large-en",   # the default (see Pattern 6)
)
```

Then from SQL:

```sql
-- Query the index. Returns the top 5 most-similar tickets to the input text,
-- restricted to the calling customer's tenancy.
SELECT
  search.ticket_id,
  search.ticket_body,
  search.created_at,
  search.score                                          -- 0..1; higher = closer
FROM vector_search(
  index => 'qubika_dev.vectorsearch.support_tickets_idx',
  query => 'My SSO is failing after the password reset',
  num_results => 5,
  query_type => 'ANN',                                  -- approximate nearest neighbour (fast)
  filters => map('customer_id', 'cust-12345')           -- tenancy filter — see Pattern 4
) AS search;
```

---

## Common Patterns

### Pattern 1: Delta Sync index — the default

Use this whenever the source data already lives in a Delta table (which at Qubika is always). Databricks handles embedding, indexing, and incremental sync.

```python
vsc.create_delta_sync_index_and_wait(
    endpoint_name="qubika-vs-shared",
    index_name="qubika_dev.vectorsearch.product_docs_idx",
    source_table_name="qubika_dev.curated_product.docs",
    primary_key="doc_id",
    embedding_source_column="content",
    embedding_model_endpoint_name="databricks-gte-large-en",
    pipeline_type="TRIGGERED",
    columns_to_sync=["doc_id", "content", "version", "language", "owner_team"],
)
```

**Key points:**
- `pipeline_type="TRIGGERED"` is the cheaper default — index syncs only when you trigger it (or on a schedule).
- `pipeline_type="CONTINUOUS"` syncs within seconds of a source-table write. Use when stale-by-minutes is unacceptable, otherwise the cost diff is real.
- `columns_to_sync` is what comes back in query results — include any column you'll filter on (Pattern 4) or display.

---

### Pattern 2: Direct Vector Access — bring-your-own embeddings

Use when the customer has already computed embeddings with a model Databricks doesn't host, or when you want full control over chunking.

```python
vsc.create_direct_access_index_and_wait(
    endpoint_name="qubika-vs-shared",
    index_name="qubika_dev.vectorsearch.custom_emb_idx",
    primary_key="doc_id",
    embedding_dimension=1536,                  # match your model's output dim
    embedding_vector_column="embedding",
    schema={
        "doc_id":     "string",
        "content":    "string",
        "embedding":  "array<float>",
        "domain":     "string",
    },
)

# Then write rows directly:
index = vsc.get_index("qubika-vs-shared", "qubika_dev.vectorsearch.custom_emb_idx")
index.upsert([
    {"doc_id": "doc-1", "content": "...", "embedding": [0.01, 0.04, ...], "domain": "support"},
])
```

**Key points:**
- You own the embedding pipeline — typically a notebook that reads from a curated table, calls the model, and `index.upsert()`s the result.
- Direct Access indexes don't auto-sync. If the source rows change, you must re-upsert.
- Prefer Delta Sync unless there's a hard reason not to (custom model, custom chunking).

---

### Pattern 3: Query via SQL — best for joins

`vector_search()` is a table-valued function. Treat it like any other source; join, filter, paginate.

```sql
WITH ranked AS (
  SELECT *
  FROM vector_search(
    index => 'qubika_dev.vectorsearch.support_tickets_idx',
    query => :user_question,
    num_results => 10,
    filters => map('customer_id', :customer_id, 'status', 'resolved')
  )
)
SELECT
  r.ticket_id,
  r.ticket_body,
  r.score,
  c.satisfaction_score AS resolution_quality
FROM ranked r
LEFT JOIN qubika_dev.curated_support.csat c
  ON c.ticket_id = r.ticket_id
ORDER BY r.score DESC;
```

**Key points:**
- The `query` arg is the *text*; Databricks embeds it for you using the same model as the index. Don't pre-embed.
- Use `:param`-style binds in production — never f-string the user query into SQL (prompt-injection through the query path is real, even when the query just becomes embeddings).
- `score` is 0..1 cosine similarity; higher is closer. Empirically anything < 0.3 on `gte-large-en` is "weak match" — surface but flag.

---

### Pattern 4: Metadata filters — tenancy, language, version

The metadata filter is what keeps customer A's data from leaking into customer B's search results. Always pass it explicitly.

```sql
-- Single-key filter
filters => map('customer_id', 'cust-12345')

-- Multi-key filter (AND across keys)
filters => map(
  'customer_id', 'cust-12345',
  'language',    'en',
  'status',      'resolved'
)

-- Multi-value (OR within a key) — pass a JSON list
filters => map('domain', '["product", "billing"]')

-- NOT filter — keys prefixed with NOT
filters => map('NOT status', 'spam')
```

**Key points:**
- The filter keys must match `columns_to_sync` on the index. Add them at index-creation time; you can't filter on a column the index doesn't carry.
- For tenancy isolation, write a helper view that injects the filter — never trust callers to remember the tenancy param.
- Filters apply *before* vector ranking. They're cheap; use them liberally.

---

### Pattern 5: Hybrid search — keyword + vector

When users type exact identifiers (product SKUs, error codes) alongside semantic intent, pure vector search loses the exact match. Hybrid combines BM25 keyword scoring with vector ranking.

```sql
SELECT *
FROM vector_search(
  index => 'qubika_dev.vectorsearch.product_docs_idx',
  query => 'troubleshoot error CODE-4501 on Linux',
  num_results => 10,
  query_type => 'HYBRID'                       -- vs 'ANN' (vector only)
);
```

**Key points:**
- Hybrid is the right default for *product* search; vector-only is the right default for *concept* search (e.g., "give me tickets like this one").
- Hybrid is slightly more expensive per query — not enough to default-disable, but enough to be aware.

---

### Pattern 6: Picking the embedding model

| Model endpoint                              | Dim | When to use                                        |
|---------------------------------------------|----:|----------------------------------------------------|
| `databricks-gte-large-en`                   | 1024| **Qubika default.** English-only, balanced cost/quality.|
| `databricks-bge-large-en`                   | 1024| Alternate — sometimes better recall on FAQ-style data. Pilot on a sample first. |
| `databricks-bge-m3`                         | 1024| Multilingual (100+ languages). Pick when content isn't English-only. |
| Custom Mosaic AI serving endpoint           | varies | Customer fine-tunes the embedding model. Pin the version in the index. |

**Rule of thumb**: start with `gte-large-en`, evaluate recall@5 against a 50-query labeled set (see Pattern 7). Swap to BGE or a custom model only with measured improvement.

---

### Pattern 7: Reindex when the embedding model changes

You can't change the embedding model on an existing index — the embeddings are baked in at create time. Switching models = creating a new index.

```python
# Don't try to edit. Create a new index with a versioned name.
vsc.create_delta_sync_index_and_wait(
    endpoint_name="qubika-vs-shared",
    index_name="qubika_dev.vectorsearch.support_tickets_v2_idx",
    source_table_name="qubika_dev.curated_support.tickets",
    primary_key="ticket_id",
    embedding_source_column="ticket_body",
    embedding_model_endpoint_name="databricks-bge-m3",      # the new model
    columns_to_sync=["ticket_id", "ticket_body", "created_at", "customer_id"],
)

# 1. Let it build. Embedding 1M rows on gte-large-en is on the order of minutes
#    of endpoint time at a reasonable rate.
# 2. Run a recall-comparison notebook against v1 vs v2 on a held-out query set.
# 3. Swap the application's index_name config to v2.
# 4. After 7 days of stable v2 use, delete v1 to free serving cost.
```

**Qubika convention**: index names always carry a version suffix (`_v1`, `_v2`). Application configs reference the version explicitly; cutover is a config change, not an index mutation.

---

### Pattern 8: Cost sizing

Two cost dimensions:

1. **Endpoint capacity** — a STANDARD endpoint serves queries with bounded latency. One endpoint can host many indexes; queries share it. Scale up only when query rate exceeds the endpoint's capacity.
2. **Sync compute** — Delta Sync indexes use a managed pipeline that runs on Databricks Serverless. TRIGGERED pipelines pay only when sync runs; CONTINUOUS pays for the always-on stream.

```sql
-- Find sync cost by warehouse / endpoint (system.billing.usage has sku
-- entries for "vector search" and "vector search pipeline").
SELECT
  usage_metadata,
  SUM(usage_quantity) AS dbus
FROM system.billing.usage
WHERE sku_name LIKE '%VECTOR_SEARCH%'
  AND usage_start_time >= current_timestamp() - INTERVAL 7 DAYS
GROUP BY usage_metadata
ORDER BY dbus DESC;
```

**Key points:**
- One endpoint can usually host every index in a workspace until query volume crosses ~hundreds-per-second. Don't pre-emptively create per-index endpoints.
- TRIGGERED + a daily/hourly trigger costs roughly 1/10th of CONTINUOUS at typical Qubika volumes. Default TRIGGERED.

---

## Anti-Patterns

| Anti-pattern                                                          | Why it's wrong                                                                | Correct alternative                                                  |
|-----------------------------------------------------------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Querying without a metadata filter when the table has tenancy        | Customer A's data leaks into customer B's results                             | Always pass `filters => map('customer_id', …)` — wrap in a view if you can |
| Embedding a source column that's actually JSON or HTML                | Embeds the markup; recall plummets                                            | Extract a clean text column in Silver, embed that                     |
| Index name without a version suffix                                   | The day you change embedding models, you have to coordinate a rename          | `index_name_v1`, `index_name_v2` — version from day one              |
| Hardcoded customer-id in `columns_to_sync` filter list                | Index has the wrong columns; can't filter by tenancy later                   | Plan `columns_to_sync` for *every* metadata you'll filter on later   |
| `pipeline_type="CONTINUOUS"` on a stale-tolerant use case             | Pays for the always-on stream when TRIGGERED is enough                       | Default TRIGGERED; CONTINUOUS only with a freshness SLA              |
| f-stringing user input into the SQL `query` arg                       | Prompt injection through the embedding path; also breaks param caching       | `:param` binds; sanitize at the application layer                    |
| Creating a separate endpoint per index "for isolation"                | Pays for capacity that goes unused                                            | One endpoint per workspace until query rate genuinely exceeds it     |
| Treating `score` < 0.3 as a valid match                               | At that threshold the model is guessing                                       | Empirically calibrate a per-domain threshold; flag low scores in UI  |
| Pre-embedding the query in Python before passing to SQL              | Wastes a model call; risks model mismatch with the index                     | Pass the *text* to `vector_search()`; let Databricks embed           |
| Updating source-table rows without enabling CDF first                 | Delta Sync index falls silently behind                                       | `ALTER TABLE … SET TBLPROPERTIES (delta.enableChangeDataFeed = true)` |

---

## Reference

**External**
- Vector Search overview — https://docs.databricks.com/aws/en/generative-ai/vector-search
- `vector_search()` SQL function — https://docs.databricks.com/aws/en/sql/language-manual/functions/vector_search
- Python SDK reference — https://api-docs.databricks.com/python/vector-search/latest
- Foundation Model embedding endpoints — https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/embedding-models

**Internal**
- `qubika-databricks-ai-functions` — pair this skill with that one for end-to-end RAG (retrieve here, generate there)
- `qubika-medallion-architecture` — indexes go in `{env}.vectorsearch.*`, sourced from `{env}.curated_*`
- `qubika-unity-catalog-governance` — grants on `vectorsearch` schema follow the same patterns as other domain schemas
- `qubika-data-quality` — DQX assertions on the embedding source column (non-null, length bounds)
- `qubika-cost-investigator` (agent) — diagnose Vector Search DBU spend

---

## FAQ

| Question | Answer |
|----------|--------|
| How fresh is a TRIGGERED Delta Sync index? | As fresh as you trigger it. Common pattern: schedule a daily sync via a DAB job. For hourly freshness, use a 1-hour cron. Sub-hour → switch to CONTINUOUS. |
| Can I query the same index from a Databricks App? | Yes — apps can call the Python SDK or hit the index via the SQL `vector_search()` function over a warehouse. Apps usually go SDK because they want a JSON response, not a SQL result. |
| What's the typical p50 query latency? | On a STANDARD endpoint with a warm cache, single-digit-ms p50 for 1024-dim indexes up to ~10M rows. Hybrid adds a few ms. p99 climbs with index size; benchmark for your scale. |
| Is the index encrypted at rest? | Yes, inherits encryption from the Delta source table + Databricks-managed storage encryption. |
| What happens to the index when I delete the source table? | The index breaks. Always delete the index *first*, then the source. The `qubika-databricks-bundles` destroy ordering doesn't help you here — use the Python SDK to drop the index. |
| How do I monitor recall in production? | Sample queries weekly, label expected results, compute recall@5. There's no built-in recall dashboard; treat it as a manual evaluation pass. The Databricks `.test/`-style harness is overkill for v1 — start with a notebook. |
| Can I filter on a struct sub-field? | No. Flatten the field into a top-level column before indexing, or hash it. |

---

## Related Skills

- `qubika-databricks-ai-functions` — generation side of RAG (retrieve here → generate there)
- `qubika-medallion-architecture` — index naming + catalog placement
- `qubika-unity-catalog-governance` — schema-level grants on `vectorsearch.*`
- `qubika-data-quality` — DQX on the embedded source column
- `qubika-databricks-bundles` — packaging the index-create / re-sync job
- `qubika-databricks-sdk` — `WorkspaceClient.vector_search_indexes` for management calls
- `qubika-pipeline-testing` — pytest patterns for the recall-comparison notebook
- `qubika-cost-investigator` (agent) — diagnose endpoint cost spikes

---

## Changelog

| Version | Date       | Change          |
|---------|------------|-----------------|
| 1.0.0   | 2026-05-22 | Initial version |
