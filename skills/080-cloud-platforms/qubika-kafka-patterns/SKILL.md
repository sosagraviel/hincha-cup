---
name: qubika-kafka-patterns
description: "Kafka-specific patterns for Databricks streaming — Schema Registry + Avro, offset / DLQ / dedup strategies, EventHub Kafka-protocol mode, schema evolution, and the gotchas that bite in production. Read when integrating Kafka beyond a single hello-world topic."
version: 1.0.0
domain: streaming
owner: data-platform-team
---

# Qubika Kafka Patterns

[`qubika-streaming-pipelines`](../qubika-streaming-pipelines/SKILL.md) shows the minimum viable Kafka read (`spark.readStream.format("kafka")` + JSON parse). **This skill picks up where that one stops** — the patterns that matter once a project moves past the proof-of-concept: schema registry, offset strategies, dead-letter queues, exactly-once semantics, EventHub via Kafka protocol, and the schema-evolution discipline that keeps Bronze pipelines from breaking on every producer-team release.

If a project is shipping Kafka-sourced Bronze tables to staging or prod, this is the reference.

**Upstream docs**: https://spark.apache.org/docs/latest/structured-streaming-kafka-integration.html

---

## When to Use This Skill

Use this skill when:
- Integrating with a Schema Registry (Confluent or Apicurio) — Avro / Protobuf / JSON Schema
- Picking the right `startingOffsets` for a new pipeline or a backfill
- Designing dead-letter handling for malformed messages
- Subscribing to >1 topic, or to a topic pattern
- Sourcing from Azure Event Hub via its Kafka-protocol endpoint
- Running Kafka producer code from Spark (less common, but real Qubika engagements)
- Reviewing a streaming PR and spotting `failOnDataLoss=false` without justification

Do NOT use this skill when:
- The streaming use case is satisfied by Auto Loader (cloud storage) — that's `qubika-streaming-pipelines` Pattern 1
- The pipeline is batch (`readStream` not needed) — Kafka has a batch reader, but if you're doing batch, prefer the JDBC connector or an export-and-Auto-Loader pattern

---

## Quick Start

A complete Schema Registry + Avro consumer with explicit offsets, idempotent Delta writes, and a checkpoint location that survives cluster restarts:

```python
from pyspark.sql import functions as F
from pyspark.sql.avro.functions import from_avro
import requests

# Secrets live in a kit-managed scope, never in code.
BOOTSTRAP   = dbutils.secrets.get("qubika-kafka", "bootstrap-servers")
SR_URL      = dbutils.secrets.get("qubika-kafka", "schema-registry-url")
SR_AUTH     = dbutils.secrets.get("qubika-kafka", "schema-registry-auth")  # "user:password"
TOPIC       = "qubika.events.orders.v1"
CHECKPOINT  = "abfss://checkpoints@qubikastorage.dfs.core.windows.net/kafka/orders/"

# Resolve the latest schema once at build time, NOT per-batch.
# Schema Registry returns Confluent-wire-format Avro (5-byte prefix + payload).
def fetch_latest_schema(subject: str) -> str:
    r = requests.get(
        f"{SR_URL}/subjects/{subject}/versions/latest",
        auth=tuple(SR_AUTH.split(":", 1)),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["schema"]

value_schema = fetch_latest_schema(f"{TOPIC}-value")

# Confluent wire format: 1 magic byte + 4 schema-id bytes + Avro payload.
# from_avro consumes the raw Avro; we strip the 5-byte prefix manually.
stream = (
    spark.readStream
        .format("kafka")
        .options(**{
            "kafka.bootstrap.servers":           BOOTSTRAP,
            "kafka.security.protocol":           "SASL_SSL",
            "kafka.sasl.mechanism":              "PLAIN",
            "kafka.sasl.jaas.config":            (
                "org.apache.kafka.common.security.plain.PlainLoginModule "
                f'required username="{dbutils.secrets.get("qubika-kafka", "api-key")}" '
                f'password="{dbutils.secrets.get("qubika-kafka", "api-secret")}";'
            ),
            "subscribe":                          TOPIC,
            "startingOffsets":                    "earliest",   # explicit — see Pattern 2
            "maxOffsetsPerTrigger":               "100000",
            "failOnDataLoss":                     "true",       # default — see Pattern 7
        })
        .load()
        .select(
            F.col("topic"),
            F.col("partition"),
            F.col("offset"),
            F.col("timestamp").alias("kafka_timestamp"),
            F.expr("substring(value, 6, length(value) - 5)").alias("avro_payload"),
            F.col("value").alias("raw_value"),                   # keep for DLQ
        )
        .withColumn("payload", from_avro(F.col("avro_payload"), value_schema))
        .select(
            "topic", "partition", "offset", "kafka_timestamp",
            "raw_value", "payload.*",
            F.current_timestamp().alias("_ingested_at"),
        )
)

(
    stream
      .writeStream
      .format("delta")
      .option("checkpointLocation", CHECKPOINT)
      .trigger(processingTime="30 seconds")
      .outputMode("append")
      .toTable("qubika_dev.raw.events.orders")
)
```

The checkpoint location is what makes this pipeline restart-safe — Spark records committed offsets there. **Do not change the checkpoint path on an existing pipeline**; it forces a full re-read.

---

## Common Patterns

### Pattern 1: Schema Registry — Avro

Confluent's `_confluent-wire-format` prefixes every Avro message with 5 bytes: 1 magic byte + 4-byte schema ID. Spark's `from_avro` does not understand this prefix. Two options:

```python
# Option A: Strip the prefix and use latest schema (most common at Qubika)
.withColumn("payload", from_avro(F.expr("substring(value, 6, length(value) - 5)"), latest_avro_schema))

# Option B: Use Databricks' from_avro with schema-id-aware mode (DBR 13.3+)
# This handles the prefix and resolves the schema per-message — slower but correct
# when producers run mixed schema versions.
.withColumn("payload", from_avro(
    F.col("value"),
    None,                                  # schema resolved per-message
    options={"mode": "PERMISSIVE", "schemaRegistryUrl": SR_URL,
             "schemaRegistryAuth": SR_AUTH, "schemaRegistrySubject": f"{TOPIC}-value"}
))
```

**Key points:**
- Option A is fine when producers are pinned to one schema version. Most internal Qubika pipelines.
- Option B is required when producers from multiple teams produce mixed versions to the same topic.
- Always pin the `schema-registry-url` + auth in `qubika-kafka` secret scope. Never embed in code.

---

### Pattern 2: Offset strategies — picking `startingOffsets`

`startingOffsets` controls where Spark starts reading **on a brand-new checkpoint**. After the checkpoint exists, Spark resumes from the last committed offset and **ignores** this setting.

| Value | Semantics | When to use |
|-------|-----------|-------------|
| `earliest` | From the topic's `log.start.offset` (compacted topics: beginning of retained data) | Production Bronze — you want every event. Backfills. |
| `latest` | Only events that arrive after the pipeline starts | Demo / sanity checks. Almost never the right call in prod. |
| `{"topic-name":{"0":12345,"1":67890}}` | Specific offsets per partition | Replaying a window. Rare but supported. |
| `{"topic-name":{"0":-2,"1":-2}}` | `-2` = earliest, `-1` = latest, per partition | Mixed strategy. Rare. |

**Anti-pattern:** shipping a new Bronze pipeline with `startingOffsets: "latest"`. Once the checkpoint exists, late events that arrived during the pipeline's first hour are gone forever — you can't redo it without starting a new checkpoint. **Default to `"earliest"` for any Bronze pipeline; use `"latest"` only for demos.**

To restart from a known offset:

```python
# Don't edit an existing checkpoint. Delete it, then re-start with explicit offsets:
dbutils.fs.rm(CHECKPOINT, recurse=True)
# ... then set startingOffsets to your replay point ...
```

---

### Pattern 3: Dead-letter queue for un-parseable messages

`from_avro` and `from_json` return `null` for malformed payloads. Dropping nulls silently loses data. Keep the raw value, route bad rows to a DLQ table.

```python
# In the read stage, parse but DON'T drop bad rows yet:
parsed = (
    raw_stream
    .withColumn("parsed", from_avro(F.col("avro_payload"), value_schema, options={"mode": "PERMISSIVE"}))
)

good = parsed.where(F.col("parsed").isNotNull())
bad  = parsed.where(F.col("parsed").isNull()).select(
    "topic", "partition", "offset", "kafka_timestamp", "raw_value",
    F.lit("parse_failed").alias("dlq_reason"),
    F.current_timestamp().alias("_dlq_at"),
)

# Two parallel writeStreams off the same source. The trick is that each
# writeStream needs its OWN checkpoint location, even though they share
# the readStream — Spark tracks them as separate sinks.
(good.writeStream
     .format("delta")
     .option("checkpointLocation", CHECKPOINT_GOOD)
     .toTable("qubika_dev.raw.events.orders"))

(bad.writeStream
    .format("delta")
    .option("checkpointLocation", CHECKPOINT_DLQ)
    .toTable("qubika_dev.raw.events.orders_dlq"))
```

**Key points:**
- `_dlq_at` lets the on-call DE know when to investigate.
- DLQ tables should have row-level alerting via `qubika-monitoring-observability` — `count(*) > 0 in last 10 min` is a paging condition.
- Don't catch+log+drop in a `foreachBatch` — you'll lose the row in a worker restart. Always materialise to a DLQ table.

---

### Pattern 4: Exactly-once via idempotent writes

Spark Structured Streaming gives **at-least-once** by default. Delta sink writes are atomic per micro-batch, so retries don't duplicate the Delta-side rows for that batch. But if the same Kafka offset gets re-read across pipeline restarts (it shouldn't with a healthy checkpoint, but networks lie), you can still see dupes downstream.

For exactly-once-effective:

```python
# Add a deterministic dedup key derived from Kafka coordinates.
# (topic, partition, offset) is unique across the entire Kafka cluster's lifetime.
with_key = good.withColumn(
    "event_dedup_key",
    F.concat_ws(":", F.col("topic"), F.col("partition"), F.col("offset")),
)

# Use foreachBatch + MERGE for idempotent landing into Bronze.
def upsert_to_bronze(batch_df, batch_id):
    (DeltaTable.forName(spark, "qubika_dev.raw.events.orders")
        .alias("t")
        .merge(batch_df.alias("s"), "t.event_dedup_key = s.event_dedup_key")
        .whenNotMatchedInsertAll()
        .execute())

(with_key.writeStream
    .foreachBatch(upsert_to_bronze)
    .option("checkpointLocation", CHECKPOINT_GOOD)
    .trigger(processingTime="30 seconds")
    .start())
```

**Key points:**
- The dedup key works because Kafka guarantees per-partition offset uniqueness.
- `foreachBatch` + `MERGE` is the canonical idempotent-write pattern.
- For pure Bronze (no de-dup downstream needs), the at-least-once default is usually fine and cheaper.

---

### Pattern 5: Multi-topic subscription

```python
# Subscribe to a fixed list — best when you know every topic upfront.
"subscribe": "qubika.events.orders,qubika.events.shipments,qubika.events.returns"

# Subscribe to a pattern — auto-discovers new topics matching the regex.
# Cost: cluster has to poll metadata periodically. Use only when producers
# can add new topics without DE involvement.
"subscribePattern": "qubika\\.events\\..*"

# Assign specific partitions — rare. Used for replays or partition-specific
# diagnostics. Bypasses Kafka's consumer-group rebalancing.
"assign": '{"qubika.events.orders":[0,1,2]}'
```

**Anti-pattern:** `subscribePattern: ".*"`. You'll consume `__consumer_offsets`, `_schemas`, and anything else internal. Always anchor the pattern.

---

### Pattern 6: Azure Event Hub via Kafka protocol

Event Hub Standard+ tier accepts Kafka clients on port 9093. Same `spark.readStream.format("kafka")` code, different connection string. The "topic" is the Event Hub name.

```python
EH_NS = "qubika-events-ns"            # the Event Hubs namespace
EH    = "orders"                       # the Event Hub (acts as the topic)

kafka_options = {
    "kafka.bootstrap.servers":       f"{EH_NS}.servicebus.windows.net:9093",
    "kafka.security.protocol":       "SASL_SSL",
    "kafka.sasl.mechanism":          "PLAIN",
    "kafka.sasl.jaas.config":        (
        "org.apache.kafka.common.security.plain.PlainLoginModule required "
        'username="$ConnectionString" '
        f'password="{dbutils.secrets.get("qubika-eventhub", "connection-string")}";'
    ),
    "kafka.request.timeout.ms":      "60000",   # EH defaults are tighter than Kafka
    "kafka.session.timeout.ms":      "30000",
    "subscribe":                     EH,
    "startingOffsets":               "earliest",
}
```

**Key points:**
- The literal string `$ConnectionString` is the SASL username — not a placeholder.
- Event Hub's per-partition throughput is lower than Confluent's; size `maxOffsetsPerTrigger` accordingly (start with 10k–50k, not 500k).
- Event Hub doesn't have a Schema Registry concept — handle schemas yourself, or run Apicurio alongside.

---

### Pattern 7: Schema evolution — Schema Registry compatibility modes

Producers will change message schemas. The question is whether the consumer (this pipeline) breaks.

| Compatibility mode | Allowed producer changes | Reader strategy |
|--------------------|-------------------------|-----------------|
| `BACKWARD` (default) | Add optional field; remove optional | Reader pins the latest schema; old messages parse with the new schema |
| `FORWARD` | Add field, including required | Reader must pin a *specific older schema* to keep working |
| `FULL` | Only optional adds/removes | Either direction works |
| `NONE` | Anything | Nothing works reliably — refuse |

**Qubika default**: BACKWARD or FULL. If the producer team can't tell you which, ask before going live. A producer that drops `NONE` is incompatible with any persistent consumer.

To pin the consumer to a specific version (defensive read):

```python
# Pin to version 3 of the orders-value schema, regardless of what's latest.
schema_v3 = fetch_schema(subject=f"{TOPIC}-value", version=3)
.withColumn("payload", from_avro(F.col("avro_payload"), schema_v3))
```

---

### Pattern 8: Performance tuning

```python
# Per-trigger throughput — cap the records pulled per micro-batch.
# Too low: batches don't keep up with producer rate.
# Too high: a slow batch blocks the next trigger, latency rises.
# Start at 50k per partition; adjust based on the Streaming UI.
"maxOffsetsPerTrigger": "50000"

# Reader parallelism. Spark spawns one task per Kafka partition. If you have
# 12 partitions and 4 executor cores, 8 tasks queue. Set minPartitions to
# split a partition across tasks (Spark reads ranges within the partition).
"minPartitions": "24"

# Connection settings — increase from defaults for high-throughput pipelines.
"kafka.fetch.max.bytes":     str(64 * 1024 * 1024),   # 64 MB
"kafka.max.poll.records":    "5000",
```

**Diagnosis:**
- Streaming UI → look at "Input Rate" vs "Process Rate". Diverging = a bottleneck downstream of the read.
- Kafka consumer lag — check the producer team's monitoring; lag growing means we're slower than they're producing.
- `spilled_local_bytes` in the SQL warehouse view (see `qubika-cost-investigator`) — Kafka reads usually don't spill, but downstream joins might.

---

## Anti-Patterns

| Anti-pattern                                                              | Why it's wrong                                                              | Correct alternative                                                  |
|---------------------------------------------------------------------------|-----------------------------------------------------------------------------|----------------------------------------------------------------------|
| `startingOffsets: "latest"` on a new prod Bronze pipeline                 | Data that arrived during first start-up is lost forever                     | `"earliest"` for any Bronze pipeline                                 |
| `failOnDataLoss: "false"` without a comment explaining why                | Silently skips missing offsets — Bronze gaps you can't diagnose later       | Keep the default (`true`); document any exception                    |
| Catching parse errors and dropping the row                                | Lost data with no audit trail                                               | Pattern 3 — route to a DLQ Delta table                               |
| Schema fetched fresh per-batch                                            | Adds a network call to every micro-batch; bypasses cache                    | Resolve once at build time; pin the version                          |
| `subscribePattern: ".*"`                                                  | Consumes internal topics (`__consumer_offsets`, `_schemas`)                 | Anchor the pattern (`"qubika\\.events\\..*"`)                        |
| Editing `checkpointLocation` to "reset" a pipeline                        | Doesn't reset — Spark just creates a parallel offset table elsewhere        | Delete the checkpoint, set explicit `startingOffsets`, restart       |
| Sharing one checkpoint between two `writeStream`s on the same `readStream`| Sinks step on each other's commits; offsets corrupt                         | One checkpoint dir per sink                                          |
| Bare PAT in `kafka.sasl.jaas.config`                                      | Credential in code; rotates by code change instead of secret rotation       | `dbutils.secrets.get("qubika-kafka", "api-key")`                     |
| Trusting `kafka_timestamp` as the event time                              | That's the broker ingest time, not when the business event happened         | Carry an `event_time` field in the payload, derive watermarks from it |

---

## Reference

**External**
- Spark + Kafka integration — https://spark.apache.org/docs/latest/structured-streaming-kafka-integration.html
- Confluent wire format — https://docs.confluent.io/platform/current/schema-registry/fundamentals/serdes-develop/index.html#wire-format
- Schema Registry compatibility — https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html
- Event Hubs Kafka endpoint — https://learn.microsoft.com/en-us/azure/event-hubs/azure-event-hubs-kafka-overview

**Internal**
- `qubika-streaming-pipelines` — the canonical streaming primer (Auto Loader + the basic Kafka read shape)
- `qubika-monitoring-observability` — DLQ alerting, lag dashboards
- `qubika-data-quality` — DQX rules on the Bronze landing tables this skill produces
- `qubika-cost-investigator` (agent) — when a streaming pipeline starts costing more than expected

---

## FAQ

| Question | Answer |
|----------|--------|
| Can I use Kafka as a *batch* source? | Yes — `spark.read.format("kafka").option("startingOffsets","earliest").option("endingOffsets","latest")`. Use for one-off replays; not for production pipelines. |
| What's the Qubika default checkpoint location convention? | `abfss://checkpoints@{tenant}.dfs.core.windows.net/{source_system}/{topic_or_eh}/{pipeline_name}/`. One subpath per writeStream. |
| Do I need a Kafka consumer group? | Spark sets one automatically (`spark-kafka-source-<uuid>`) — you don't manage it. Setting `kafka.group.id` is allowed but means you opt out of Spark's offset management; bad idea unless you're integrating with an external coordinator. |
| How do I produce *to* Kafka from Spark? | `df.write.format("kafka").option("topic", "qubika.events.synthesized").save()` (or `writeStream`). Common pitfall: the schema must have a `value` column (and optionally `key`, `topic`, `partition`); Spark won't auto-pick "the data column". |
| What's the difference between `kafka.bootstrap.servers` and `bootstrap.servers`? | Spark's Kafka source requires the `kafka.` prefix on every consumer property — it's how Spark separates its own knobs from the underlying client's. Without the prefix the option is silently ignored. |
| EventHub or Kafka? | Use what the producer team uses. If new ground, prefer Confluent Cloud for Schema Registry support; Event Hub if the workload is mostly Azure-native and schemas are managed elsewhere. |

---

## Related Skills

- `qubika-streaming-pipelines` — Auto Loader + the entry-level Kafka read
- `qubika-medallion-architecture` — where the Bronze tables this skill produces land
- `qubika-data-quality` — DQX expectations layered on Bronze streaming output
- `qubika-monitoring-observability` — DLQ alerts, lag monitoring, freshness SLAs
- `qubika-unity-catalog-governance` — catalog naming for the Bronze streaming tables
- `qubika-databricks-bundles` — deploying the streaming job via DAB
- `qubika-databricks-sdk` — Python SDK patterns when wrapping streaming queries in tooling

---

## Changelog

| Version | Date       | Change                                                                |
|---------|------------|-----------------------------------------------------------------------|
| 1.0.0   | 2026-05-22 | Replace shipped-but-unfilled TEMPLATE with real Kafka-patterns content |
