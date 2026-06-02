---
name: qubika-monitoring-observability
description: "Set up observability for Databricks pipelines — job alerts, data freshness monitoring, SLA tracking, and incident response patterns"
version: 1.1.0
domain: observability
owner: data-platform-team
---

# Qubika Monitoring & Observability

Every production pipeline must have at least: a job failure alert, a data freshness check, and a dashboard row count metric. This skill covers how to set those up and what to do when they fire.

---

## When to Use This Skill

Use this skill when:
- Deploying a pipeline to production for the first time
- Investigating a data pipeline failure
- Setting up SLA tracking for a table
- Building a monitoring dashboard

---

## Quick Start

```python
# Minimum viable monitoring for a new production pipeline
# Add this as the final task in any production job

from pyspark.sql import functions as F

def write_pipeline_metric(pipeline_name: str, table_name: str, rows_written: int, status: str):
    """Write a metric to the central monitoring table."""
    spark.createDataFrame([{
        "pipeline_name": pipeline_name,
        "table_name":    table_name,
        "rows_written":  rows_written,
        "status":        status,
        "run_at":        F.current_timestamp()
    }]).write.format("delta").mode("append").saveAsTable("qubika_dev.monitoring.pipeline_runs")

# Call at the end of every pipeline run
write_pipeline_metric(
    pipeline_name="salesforce_opportunity_to_silver",
    table_name="qubika_prod.curated.sales.opportunity",
    rows_written=result_count,
    status="success"
)
```

---

## Common Patterns

### Pattern 1: Job Failure Alerts

**When to use:** Every production Databricks job must have an email/PagerDuty alert on failure.

```python
# Via Databricks Jobs API (set in job configuration)
job_config = {
    "name": "salesforce-opportunity-bronze-to-silver",
    "email_notifications": {
        "on_failure": ["data-engineering@qubika.com"],
        "on_duration_warning_threshold_exceeded": ["data-engineering@qubika.com"],
    },
    "notification_settings": {
        "no_alert_for_skipped_runs": True
    },
    "timeout_seconds": 3600,   # 1 hour — alert if job takes longer than this
    "max_concurrent_runs": 1,
    "health": {
        "rules": [{
            "metric": "RUN_DURATION_SECONDS",
            "op":     "GREATER_THAN",
            "value":  1800   # warn at 30 minutes
        }]
    }
}
```

For PagerDuty integration, add the webhook in the Databricks notification destination UI (Settings → Notification Destinations).

---

### Pattern 2: Data Freshness Monitoring

**When to use:** Every Silver and Gold table with a downstream consumer.

```python
# Run as a separate monitoring job, every 30 minutes in prod
from datetime import datetime, timedelta
import requests

FRESHNESS_SLAS = {
    "qubika_prod.curated.sales.opportunity":       {"max_age_hours": 4,  "priority": "high"},
    "qubika_prod.curated.finance.invoice":         {"max_age_hours": 8,  "priority": "medium"},
    "qubika_prod.analytics.revenue_ops.daily_arr": {"max_age_hours": 26, "priority": "low"},
}

SLACK_WEBHOOK = dbutils.secrets.get("qubika-monitoring", "slack-webhook-data-alerts")

def check_freshness():
    failures = []
    for table, config in FRESHNESS_SLAS.items():
        result = spark.sql(f"SELECT MAX(_updated_at) AS last_update FROM {table}").collect()[0]
        if result["last_update"] is None:
            failures.append(f"*{table}* has NO data")
            continue

        age_hours = (datetime.utcnow() - result["last_update"].replace(tzinfo=None)).total_seconds() / 3600
        if age_hours > config["max_age_hours"]:
            failures.append(
                f"*{table}* is stale: {age_hours:.1f}h old (SLA: {config['max_age_hours']}h) [{config['priority']}]"
            )

    if failures:
        message = "🚨 *Data Freshness Alert*\n" + "\n".join(f"• {f}" for f in failures)
        requests.post(SLACK_WEBHOOK, json={"text": message})
        raise Exception(f"Freshness check failed: {len(failures)} tables stale")
    else:
        print(f"[OK] All {len(FRESHNESS_SLAS)} tables are fresh")

check_freshness()
```

---

### Pattern 3: Row Count Anomaly Detection

**When to use:** Detecting when a table has significantly fewer rows than expected — catches truncation bugs and failed merges.

```python
from pyspark.sql import functions as F

def check_row_count_anomaly(table: str, expected_min: int = None, lookback_days: int = 7, threshold_pct: float = 0.20):
    """
    Fail if today's row count is more than threshold_pct below the 7-day average.
    """
    # Get historical counts from monitoring table
    history = spark.sql(f"""
        SELECT AVG(rows_written) AS avg_rows
        FROM qubika_dev.monitoring.pipeline_runs
        WHERE table_name = '{table}'
          AND status = 'success'
          AND run_at >= DATE_SUB(CURRENT_DATE(), {lookback_days})
    """).collect()[0]["avg_rows"]

    current = spark.table(table).count()

    if history and current < history * (1 - threshold_pct):
        raise ValueError(
            f"Row count anomaly: {table} has {current:,} rows "
            f"(expected >= {history * (1 - threshold_pct):,.0f} based on {lookback_days}-day avg of {history:,.0f})"
        )

    if expected_min and current < expected_min:
        raise ValueError(f"{table} has {current:,} rows, below minimum {expected_min:,}")

    print(f"[OK] {table}: {current:,} rows")
```

---

### Pattern 4: Central Monitoring Dashboard Query

**When to use:** The Gold-layer monitoring table that powers the data health dashboard.

```sql
-- Create monitoring infrastructure (run once by data platform)
CREATE SCHEMA IF NOT EXISTS qubika_dev.monitoring
  COMMENT 'Central monitoring and observability for all data pipelines';

CREATE TABLE IF NOT EXISTS qubika_dev.monitoring.pipeline_runs (
  pipeline_name   STRING,
  table_name      STRING,
  rows_written    LONG,
  status          STRING,    -- success | failure | warning
  error_message   STRING,
  run_duration_s  DOUBLE,
  run_at          TIMESTAMP
)
USING DELTA
PARTITIONED BY (DATE(run_at))
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

CREATE TABLE IF NOT EXISTS qubika_dev.monitoring.data_quality_log (
  table_name       STRING,
  check_name       STRING,
  status           STRING,   -- PASS | FAIL | WARN
  violation_count  LONG,
  total_rows       LONG,
  checked_at       TIMESTAMP
)
USING DELTA
PARTITIONED BY (DATE(checked_at));
```

```sql
-- Dashboard query: pipeline health last 24h
SELECT
  pipeline_name,
  table_name,
  COUNT(*)                                     AS total_runs,
  COUNT_IF(status = 'success')                 AS successful_runs,
  COUNT_IF(status = 'failure')                 AS failed_runs,
  MAX(CASE WHEN status = 'success' THEN run_at END) AS last_success,
  AVG(CASE WHEN status = 'success' THEN run_duration_s END) AS avg_duration_s
FROM qubika_dev.monitoring.pipeline_runs
WHERE run_at >= NOW() - INTERVAL 24 HOURS
GROUP BY pipeline_name, table_name
ORDER BY failed_runs DESC, last_success ASC;
```

---

### Pattern 5: Delta Table Health Checks

**When to use:** Routine maintenance and optimization health checks.

```python
def check_table_health(table: str):
    """Check Delta table health metrics."""
    detail = spark.sql(f"DESCRIBE DETAIL {table}").collect()[0]
    history = spark.sql(f"DESCRIBE HISTORY {table} LIMIT 10").collect()

    print(f"Table: {table}")
    print(f"  Files:              {detail['numFiles']:,}")
    print(f"  Size:               {detail['sizeInBytes'] / 1e9:.2f} GB")
    print(f"  Last modified:      {detail['lastModified']}")
    print(f"  Min reader version: {detail['minReaderVersion']}")

    # Check for small file problem (avg < 32MB)
    if detail["numFiles"] > 0:
        avg_file_mb = detail["sizeInBytes"] / detail["numFiles"] / 1e6
        if avg_file_mb < 32:
            print(f"  ⚠️  Small files: avg {avg_file_mb:.1f} MB — consider OPTIMIZE")
        else:
            print(f"  ✓ Avg file size: {avg_file_mb:.1f} MB")
```

---

---

### Pattern 6: System Tables — Built-In Platform Observability (GA)

**When to use:** Investigating who ran what, where costs went, which jobs are slow, and what data lineage exists — without building a custom monitoring table.

```sql
-- Failed jobs in the last 24h (from system billing — no custom table needed)
SELECT
  usage_metadata.job_id,
  usage_metadata.job_run_id,
  SUM(usage_quantity)  AS dbus_consumed,
  MAX(usage_end_time)  AS last_seen
FROM system.billing.usage
WHERE usage_date = CURRENT_DATE
  AND usage_metadata.job_id IS NOT NULL
GROUP BY 1, 2
ORDER BY dbus_consumed DESC;

-- Tables not updated in 48h (freshness check via UC metadata)
SELECT full_name, last_altered_time
FROM system.catalog.tables
WHERE full_name LIKE 'qubika_prod.curated.%'
  AND last_altered_time < NOW() - INTERVAL 48 HOURS
ORDER BY last_altered_time;

-- Lineage: what feeds into a Gold table
SELECT DISTINCT source_table_full_name
FROM system.catalog.table_lineage
WHERE target_table_full_name = 'qubika_prod.analytics.revenue_ops.daily_arr'
ORDER BY 1;
```

**Observability stack summary:**

| Layer | Tool | What it answers |
|---|---|---|
| Pipeline runs | Custom `monitoring.pipeline_runs` table | Did this job succeed? How many rows? |
| Platform audit | `system.access.audit` | Who ran what query? Who dropped a table? |
| Cost | `system.billing.usage` | Which job cost the most DBUs? |
| Table freshness | `system.catalog.tables` | When was this table last written? |
| Lineage | `system.catalog.table_lineage` | What feeds this Gold table? |
| Drift / quality | `qubika-lakehouse-monitoring` | Is the distribution shifting over time? |

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| No alerts on prod jobs | Silent failures go unnoticed for hours | Always configure email_notifications |
| Alerting only on job failure | Slow jobs indicate problems too | Set `timeout_seconds` and duration warnings |
| Sending alerts to individual emails | Person goes on vacation, alerts missed | Always alert to team distribution list |
| Not logging row counts | Can't detect truncation bugs | Write row counts to `monitoring.pipeline_runs` |
| Building custom audit tables | Duplicates what System Tables provide | Query `system.access.audit` directly |

---

## FAQ

| Question | Answer |
|----------|--------|
| What's the kit's support channel? | `#data-ai-dev-help` for kit questions; use your team's data-alerts channel for production incidents |
| How do I page on-call for a critical table? | Use the PagerDuty integration on the Databricks notification destination |
| What's the freshness SLA for Silver tables? | Default: 4 hours. Document explicitly in the table COMMENT |
| How often does the freshness job run? | Every 30 minutes in prod, every hour in staging |
| Where is the monitoring dashboard? | Databricks workspace → Dashboards → "Data Platform Health" |
| Do I still need the custom `pipeline_runs` table? | Yes — for row count tracking and pipeline-level metrics. System Tables cover audit and cost; your custom table covers business metrics |

---

## Related Skills

- `qubika-medallion-architecture` — knowing which tables need SLAs
- `qubika-data-quality` — quality checks that feed into the monitoring table
- `qubika-pipeline-testing` — catching issues before they reach production
- `qubika-lakehouse-monitoring` — statistical drift detection on UC Delta tables
- `qubika-unity-catalog-governance` — System Tables and UC audit logs

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-01-01 | Initial version |
| 1.1.0 | 2026-05-07 | Added Pattern 6: System Tables for built-in platform observability; updated FAQ and related skills |
