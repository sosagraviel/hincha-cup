---
name: qubika-streaming-pipelines
description: "Build real-time data pipelines on Databricks using Auto Loader, Spark Structured Streaming, and Kafka integration following Qubika conventions"
version: 1.1.0
domain: streaming
owner: data-platform-team
---

# Qubika Streaming Pipelines

Use streaming for latency-sensitive use cases: near-real-time dashboards, event-driven ML, and sub-hourly Bronze ingestion. Most analytical pipelines at Qubika are batch — only use streaming when the business requires it.

---

## When to Use This Skill

Use this skill when:
- Ingesting data that arrives as a continuous stream (Kafka, Event Hub, Kinesis)
- Using Auto Loader for cloud storage ingestion with low latency
- Building pipelines with sub-hourly SLAs
- Processing IoT or clickstream data

Do NOT use this skill when:
- A daily/hourly batch pipeline meets the SLA (prefer batch — simpler to operate)
- Source data is a database snapshot (use JDBC batch or Delta Sharing instead)

---

## Quick Start

```python
# Auto Loader — ingest JSON files from ADLS as they arrive
source_path  = "abfss://landing@qubikastorage.dfs.core.windows.net/events/clickstream/"
bronze_table = "qubika_dev.raw.web.clickstream"
checkpoint   = "abfss://checkpoints@qubikastorage.dfs.core.windows.net/web/clickstream/"

query = (
    spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", f"{checkpoint}_schema")
        .load(source_path)
        .writeStream
        .format("delta")
        .option("checkpointLocation", checkpoint)
        .trigger(availableNow=True)          # Use availableNow for batch-like execution
        .toTable(bronze_table)
)
query.awaitTermination()
```

---

## Common Patterns

### Pattern 1: Auto Loader (File-Based Streaming)

**When to use:** New files land in cloud storage on any cadence — Auto Loader is always better than a cron job reading files.

```python
from pyspark.sql import functions as F

source_path  = "abfss://landing@qubikastorage.dfs.core.windows.net/{source}/{entity}/"
bronze_table = "qubika_dev.raw.{source}.{entity}"
checkpoint   = "abfss://checkpoints@qubikastorage.dfs.core.windows.net/{source}/{entity}/"

(
    spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")            # or csv, parquet, avro, xml
        .option("cloudFiles.inferColumnTypes", "true")   # infer types (Bronze only)
        .option("cloudFiles.schemaEvolutionMode", "rescue")  # puts schema mismatch in _rescued_data
        .option("cloudFiles.schemaLocation", f"{checkpoint}_schema")
        .option("cloudFiles.maxFilesPerTrigger", 1000)   # control throughput
        .load(source_path)
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source_file", F.input_file_name())
        .withColumn("_partition_date", F.to_date("_ingested_at"))
        .writeStream
        .format("delta")
        .option("checkpointLocation", checkpoint)
        .option("mergeSchema", "true")
        .partitionBy("_partition_date")
        .trigger(availableNow=True)                      # change to processingTime='5 minutes' for continuous
        .toTable(bronze_table)
)
```

**Trigger options:**
- `availableNow=True` — process all backlog then stop (use in scheduled jobs)
- `processingTime='5 minutes'` — continuous micro-batch (use in always-on streaming jobs)
- `once=True` — deprecated, use `availableNow` instead

---

### Pattern 2: Kafka Ingestion

**When to use:** Real-time event streams from Kafka or Azure Event Hub.

```python
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType

# Event schema (define explicitly — don't infer from Kafka)
event_schema = StructType([
    StructField("event_id",   StringType(),    False),
    StructField("user_id",    StringType(),    True),
    StructField("event_type", StringType(),    False),
    StructField("properties", StringType(),    True),  # JSON blob
    StructField("timestamp",  TimestampType(), False),
])

kafka_options = {
    "kafka.bootstrap.servers": dbutils.secrets.get("qubika-kafka", "bootstrap-servers"),
    "kafka.security.protocol": "SASL_SSL",
    "kafka.sasl.mechanism":    "PLAIN",
    "kafka.sasl.jaas.config":  f'org.apache.kafka.common.security.plain.PlainLoginModule required username="{dbutils.secrets.get("qubika-kafka", "api-key")}" password="{dbutils.secrets.get("qubika-kafka", "api-secret")}";',
    "subscribe":               "qubika.events.clickstream",
    "startingOffsets":         "latest",
    "maxOffsetsPerTrigger":    "50000",
    "failOnDataLoss":          "false",
}

(
    spark.readStream
        .format("kafka")
        .options(**kafka_options)
        .load()
        .select(
            F.col("offset"),
            F.col("timestamp").alias("kafka_timestamp"),
            F.col("partition"),
            F.from_json(F.col("value").cast("string"), event_schema).alias("payload")
        )
        .select("offset", "kafka_timestamp", "partition", "payload.*")
        .withColumn("_ingested_at", F.current_timestamp())
        .writeStream
        .format("delta")
        .option("checkpointLocation", "abfss://checkpoints@qubikastorage.dfs.core.windows.net/kafka/clickstream/")
        .trigger(processingTime="30 seconds")
        .toTable("qubika_dev.raw.events.clickstream")
)
```

---

### Pattern 3: Streaming Silver Transformation (Stateless)

**When to use:** Applying simple transformations to streaming Bronze data — no joins or aggregations across windows.

```python
from pyspark.sql import functions as F

bronze_stream = spark.readStream.table("qubika_dev.raw.events.clickstream")

(
    bronze_stream
        .filter(F.col("event_type").isNotNull())
        .select(
            F.col("event_id"),
            F.col("user_id"),
            F.col("event_type"),
            F.from_json(F.col("properties"), "MAP<STRING, STRING>").alias("properties"),
            F.col("timestamp").alias("event_time"),
            F.col("_ingested_at")
        )
        .writeStream
        .format("delta")
        .option("checkpointLocation", "abfss://checkpoints@qubikastorage.dfs.core.windows.net/silver/clickstream/")
        .trigger(processingTime="1 minute")
        .toTable("qubika_dev.curated.events.clickstream")
)
```

---

### Pattern 4: Windowed Aggregation (Stateful)

**When to use:** Computing rolling metrics — events per minute, session counts, real-time revenue.

```python
from pyspark.sql import functions as F

(
    spark.readStream
        .table("qubika_dev.curated.events.clickstream")
        .withWatermark("event_time", "10 minutes")              # allow late data up to 10m
        .groupBy(
            F.window("event_time", "5 minutes"),                # 5-minute tumbling window
            "event_type"
        )
        .agg(
            F.count("*").alias("event_count"),
            F.approx_count_distinct("user_id").alias("unique_users")
        )
        .select(
            F.col("window.start").alias("window_start"),
            F.col("window.end").alias("window_end"),
            "event_type",
            "event_count",
            "unique_users"
        )
        .writeStream
        .format("delta")
        .option("checkpointLocation", "abfss://checkpoints@qubikastorage.dfs.core.windows.net/gold/event_metrics/")
        .outputMode("append")                                    # use 'append' with watermark
        .trigger(processingTime="1 minute")
        .toTable("qubika_dev.analytics.events.real_time_metrics")
)
```

---

---

### Pattern 5: Real-Time Mode — Sub-5ms Latency (GA)

**When to use:** Pipelines where sub-second latency matters — fraud detection, live inventory, real-time personalization. One trigger change, no Flink, no replatforming. GA as of September 2025.

```python
# Stateless transformation with Real-Time Mode
(
    spark.readStream
        .table("qubika_dev.raw.events.transactions")
        .filter("amount > 0")
        .select("transaction_id", "user_id", "amount", "event_time")
        .writeStream
        .format("delta")
        .option("checkpointLocation", checkpoint)
        .trigger(continuous="1 second")    # Real-Time Mode — ~5ms p99 latency
        .toTable("qubika_dev.curated.events.transactions_rt")
)
```

**Trigger comparison:**
| Trigger | Latency | Use case |
|---|---|---|
| `availableNow=True` | Minutes (batch) | Scheduled jobs |
| `processingTime='1 minute'` | ~1 min | Standard streaming |
| `processingTime='5 seconds'` | ~5 sec | Near-real-time dashboards |
| `continuous='1 second'` | 5ms p99 | Fraud detection, live decisions |

**Real-Time Mode constraints:**
- **Stateless only** — no windowed aggregations, no stateful joins
- For aggregations, keep using `processingTime` with watermark
- Requires Databricks Runtime 15.1+

**Decision guide — when to use each latency tier:**
| Business requirement | Approach |
|---|---|
| SLA > 1 hour | Batch (`availableNow`) |
| SLA 1 min – 1 hour | Micro-batch (`processingTime`) |
| SLA < 1 minute, stateful | Micro-batch + watermark |
| SLA < 1 second, stateless | Real-Time Mode (`continuous`) |

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| `once=True` trigger | Deprecated in Databricks | Use `availableNow=True` |
| Hardcoding Kafka credentials | Security risk | Use `dbutils.secrets.get()` |
| `UPDATE` mode without watermark | Unbounded state growth, OOM | Always watermark stateful streams |
| Missing checkpoint location | Stream restarts from beginning after cluster restart | Always set checkpointLocation |
| `SELECT *` from Kafka | Includes binary `key`/`value` blobs | Always parse `value` field explicitly |
| Using Real-Time Mode for aggregations | Not supported — job will fail | Use `processingTime` for stateful operations |

---

## FAQ

| Question | Answer |
|----------|--------|
| When should I use streaming vs batch? | Batch if SLA > 1 hour. Micro-batch for 1 min–1 hour. Real-Time Mode for sub-second stateless work |
| Where do checkpoints go? | Cloud storage path, same account as source — keep separate container |
| Can I MERGE in a streaming write? | Yes — use `foreachBatch` with DeltaTable.merge() |
| What's the right trigger for a scheduled job? | `availableNow=True` — processes backlog and stops cleanly |
| How do I handle Kafka credential rotation? | Secrets stored in Databricks Secret Scope |
| What's the minimum DBR for Real-Time Mode? | Databricks Runtime 15.1+ |
| Can Real-Time Mode do windowed aggregations? | No — use micro-batch (`processingTime`) for stateful work |

---

## Related Skills

- `qubika-medallion-architecture` — where streaming writes land in Bronze/Silver, including Real-Time Mode patterns
- `qubika-monitoring-observability` — monitoring streaming lag and throughput
- `qubika-pipeline-testing` — testing streaming pipelines with micro-batch simulation

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version |
| 1.1.0 | 2026-05-07 | Added Pattern 5: Real-Time Mode (5ms p99 latency, GA Sept 2025); updated trigger decision guide and FAQ |
