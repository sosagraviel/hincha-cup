---
name: qubika-data-contracts
description: "Define, enforce, and govern data contracts using Ontos — covering ODCS contract lifecycle, governance DSL automation, and data product ownership"
version: 1.0.0
domain: governance
owner: data-platform-team
---

# Qubika Data Contracts

Data contracts are formal agreements about what a data product contains, who owns it, and what quality it guarantees. Qubika uses **Ontos** (deployed as a Databricks App) for contract lifecycle management and a **Governance DSL** for automated policy enforcement.

---

## When to Use This Skill

Use this skill when:
- Creating a new Silver or Gold table that will be consumed by other teams
- Documenting SLOs (freshness, availability, quality targets) for a dataset
- Automating PII detection and tagging across catalogs
- Enforcing ownership policies on data products
- Reviewing or approving a data contract as a Data Steward

Do NOT use this skill when:
- Applying Delta constraints (use `qubika-data-quality` instead)
- Creating internal pipeline tables that have no external consumers

---

## Quick Start

```
Ontos is a web app running at: https://ontos.qubika.databricks.com

Access roles:
  Data Producer    → create and manage contracts for your data products
  Data Steward     → review and approve contracts
  Data Consumer    → browse and subscribe to data products
  Admin            → full governance access
```

To create a contract:
1. Log in to Ontos → **Datasets** → Register your Unity Catalog table
2. Click **"Create Contract from Dataset"** — Ontos infers schema from UC
3. Define SLOs (freshness, availability, quality score target)
4. Link to business glossary terms for semantic clarity
5. Submit for Data Steward review
6. Once **Active**, the contract is the source of truth for consumers

---

## Contract Lifecycle

```
Draft → Proposed → Under Review → Approved → Active → Certified → Deprecated → Retired

Rules:
- Contracts CANNOT transition backward
- Breaking schema changes require a new contract version
- Deprecated status requires a published deprecation timeline
- Any team can propose a contract; only Data Stewards can Approve/Certify
```

---

## Common Patterns

### Pattern 1: Governance DSL — PII Auto-Tagging

**When to use:** Automatically detect and tag PII columns across the catalog — runs as a scheduled policy.

```sql
-- Scans all columns whose name matches PII patterns
-- Applies a 'pii_level: high' tag and notifies security team
MATCH (column:Object)
WHERE column.name MATCHES 'ssn|email|phone|credit_card|date_of_birth|passport'
ASSERT HAS_TAG('pii_classification')
ON_FAIL ASSIGN_TAG pii_level: 'high'
ON_FAIL ASSIGN_TAG pii_type: 'personal_identifier'
ON_FAIL NOTIFY 'security-team@qubika.com'
ON_PASS ASSIGN_TAG pii_status: 'classified'
```

---

### Pattern 2: Governance DSL — Data Quality Score Enforcement

**When to use:** Enforce that all active contracts maintain minimum quality scores.

```sql
MATCH (contract:data_contract)
WHERE contract.status = 'active'
ASSERT HAS_TAG('quality_score') AND TAG('quality_score') >= '95'
ON_FAIL FAIL 'Active data contract quality score must be >= 95%'
ON_FAIL ASSIGN_TAG quality_status: 'below_threshold'
ON_FAIL NOTIFY 'data-platform-team@qubika.com'
ON_PASS ASSIGN_TAG quality_status: 'meets_standard'
ON_PASS REMOVE_TAG quality_status_alert
```

---

### Pattern 3: Governance DSL — Ownership Enforcement

**When to use:** Ensure every active or published data product has an assigned owner — prevents orphaned datasets.

```sql
MATCH (prod:data_product)
WHERE prod.status IN ['active', 'published']
ASSERT prod.owner != 'unknown' AND LENGTH(prod.owner) > 0
ON_FAIL ASSIGN_TAG needs_attention: 'missing_owner'
ON_FAIL NOTIFY 'data-governance@qubika.com'
ON_PASS REMOVE_TAG needs_attention
```

---

### Pattern 4: Governance DSL — Schema Compliance Check

**When to use:** Enforce that Silver tables expose required audit columns — catches tables that bypass standards.

```sql
MATCH (table:table)
WHERE table.schema MATCHES 'curated.*'
ASSERT HAS_TAG('has_updated_at') AND HAS_TAG('has_source_lineage')
ON_FAIL FAIL 'Silver tables must have _updated_at and _bronze_source columns'
ON_FAIL ASSIGN_TAG compliance: 'schema_violation'
ON_FAIL NOTIFY 'data-platform-team@qubika.com'
ON_PASS ASSIGN_TAG compliance: 'schema_ok'
```

---

### Pattern 5: DSL Full Operator Reference

```
Syntax:
  MATCH (alias:EntityType)
  WHERE condition
  ASSERT compliance_condition
  ON_PASS action(s)
  ON_FAIL action(s)

Entity Types:
  catalog, schema, table, view, function, volume,
  data_product, data_contract, domain, glossary_term,
  review, Object (any UC object)

Comparison operators:
  =, !=, >, <, >=, <=
  MATCHES <regex>       -- e.g., column.name MATCHES 'ssn|email'
  IN [val1, val2]       -- e.g., status IN ['active', 'published']
  CONTAINS 'substring'

Boolean:
  AND, OR, NOT

Functions:
  HAS_TAG('key')              -- true if tag key exists
  TAG('key')                  -- returns tag value
  LENGTH(string)              -- string length
  UPPER(str), LOWER(str)

Actions (ON_PASS or ON_FAIL):
  PASS                                    -- explicit pass (no-op)
  FAIL 'human readable message'           -- fail with message
  ASSIGN_TAG key: 'value'                 -- add/update a tag
  REMOVE_TAG key                          -- remove a tag
  NOTIFY 'email@domain.com'              -- send alert email
```

---

### Pattern 6: Contract SLO Definition

**When to use:** Defining the quality targets that appear in the contract (done via Ontos UI, documented here for reference).

```yaml
# SLO fields in an Ontos data contract:
availability:
  target: 99.5         # % uptime
  measurement: monthly

freshness:
  max_lag_hours: 4     # maximum acceptable data age
  schedule: "0 */4 * * *"   # cron: check every 4 hours

quality:
  min_score: 95        # minimum DQX quality score (0-100)
  checks:
    - null_rate_max: 0.01      # <1% nulls on key columns
    - duplicate_rate_max: 0.0  # zero duplicates
    - referential_integrity: true

schema:
  version: "1.2.0"
  breaking_change_policy: new_contract_version   # not a patch
  columns_documented: required     # all columns must have comments
```

---

## DE Day-to-Day Workflow

```
1. You create a new Silver table → register it as a Dataset in Ontos
2. Click "Create Contract from Dataset"
3. Fill in:
   - Owner team (your team name)
   - Freshness SLA (e.g., 4 hours)
   - Quality score target (e.g., 95)
   - Link columns to business glossary terms
4. Submit → Data Steward reviews within 2 business days
5. Once Active: other teams can subscribe and trust your SLAs
6. When you change the schema: bump the contract version
7. Governance DSL runs nightly: auto-tags PII, flags orphaned contracts
```

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|--------------|---------|---------------------|
| Creating a table without a contract | No accountability for downstream consumers | Register in Ontos before announcing the table |
| Breaking schema changes without new version | Consumers break silently | Create a new contract version, deprecate the old one |
| Skipping the Data Steward review | Unvalidated data products reach consumers | All contracts require Steward approval before Active |
| Using DSL `FAIL` for everything | Policies that fail on warnings are too noisy | Use `ASSIGN_TAG` + `NOTIFY` for warnings, `FAIL` only for hard violations |
| Orphaned contracts with no owner | No one knows who to ask when data breaks | Ownership policy DSL enforces this automatically |

---

## FAQ

| Question | Answer |
|----------|--------|
| Where is Ontos? | https://ontos.qubika.databricks.com (Databricks App) |
| Who approves contracts? | Data Stewards — request access via #data-governance |
| Can I create a contract for a Bronze table? | No — Bronze is internal. Contracts are for Silver and Gold only |
| What triggers the governance DSL? | Scheduled nightly job and on-demand from the Ontos admin panel |
| How do I tag a column as PII? | The PII DSL policy runs automatically. You can also manually tag via `ALTER TABLE ... ALTER COLUMN ... SET TAGS` |
| What's the difference between a contract and a data product? | A data product is the logical entity (e.g., "Customer 360"). A contract is the formal agreement for one specific dataset within it |
| Can DSL policies write to Unity Catalog tags? | Yes — `ASSIGN_TAG` in DSL writes tags to UC objects directly |

---

## Related Skills

- `qubika-unity-catalog-governance` — creating the underlying UC assets that contracts reference
- `qubika-data-quality` — the DQX quality checks that feed the contract's quality score
- `qubika-monitoring-observability` — monitoring SLO compliance over time

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2025-05-06 | Initial version — Ontos contract lifecycle + Governance DSL patterns |
