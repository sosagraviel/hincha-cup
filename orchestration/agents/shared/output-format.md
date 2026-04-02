# Agent Output Format

<output_requirements>

## Structure

All Phase 1 analyzer agents must output raw JSON matching this structure:

```typescript
{
  agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer",
  timestamp: string, // ISO 8601 format (e.g., "2026-04-02T10:30:00.000Z")
  findings: {
    services: [ /* Array with at least 1 service */ ],
    // Additional fields specific to each analyzer
  },
  needs_verification: [ // Optional, maximum 5 items
    { id: string, question: string, reason: string }
  ]
}
```

## Critical Rules

1. Output raw JSON only - no markdown code blocks, no commentary
2. First character must be `{`, last character must be `}`
3. All string values use double quotes `"`, not single quotes
4. No trailing commas in objects or arrays
5. `agent_name` must exactly match one of the 4 analyzer names
6. `findings.services` array is REQUIRED with at least 1 service
7. `needs_verification` is OPTIONAL and limited to maximum 5 items

</output_requirements>

<example name="valid_output">

```json
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "services": [
      {
        "id": "api",
        "path": "apps/api",
        "type": "backend",
        "language": "typescript",
        "frameworks": { "main": "NestJS 10" }
      }
    ],
    "repository_type": "monorepo"
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "Is the authentication service deployed separately?",
      "reason": "Found auth module but unclear if it's a separate deployment"
    }
  ]
}
```

</example>
