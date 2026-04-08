# Verification Items Guide

<verification_guidelines>

## When to Use needs_verification

Use `needs_verification` ONLY for information that:
1. Cannot be determined from code, configs, or manifests
2. Requires human knowledge or business context
3. Is genuinely ambiguous from technical analysis alone

## When NOT to Use

Do NOT use `needs_verification` for:
- Information you haven't searched for yet (search first)
- Information that might exist in unread files (read them)
- Technical details that can be inferred from code patterns
- Standard conventions that can be assumed

## Maximum Limit

Maximum 5 verification items per agent. Prioritize the most critical unknowns.

## Format

```typescript
{
  id: string,        // Unique identifier (e.g., "v1", "v2")
  question: string,  // Clear, specific question
  reason: string     // Why this cannot be determined from code
}
```

</verification_guidelines>

<examples>

<example type="good">
```json
{
  "id": "v1",
  "question": "Is the Redis instance shared across services or per-service?",
  "reason": "Both services connect to Redis but connection configs don't specify instance isolation"
}
```
Good: Genuinely ambiguous deployment architecture question.
</example>

<example type="good">
```json
{
  "id": "v2",
  "question": "Should the legacy /api/v1 endpoints be included in documentation?",
  "reason": "Found deprecated endpoints still in codebase but unclear if they're still supported"
}
```
Good: Business decision that cannot be inferred from code.
</example>

<example type="bad">
```json
{
  "id": "v1",
  "question": "What testing framework is used?",
  "reason": "Couldn't find test files"
}
```
Bad: Should search more thoroughly first (check manifest dependencies, look for test configs).
</example>

<example type="bad">
```json
{
  "id": "v2",
  "question": "What database is used?",
  "reason": "Not sure which database"
}
```
Bad: Can be determined from dependencies (pg = PostgreSQL, mongodb = MongoDB, etc.).
</example>

</examples>
