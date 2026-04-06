# Question Consolidation Instructions

CRITICAL OUTPUT STRUCTURE - Your JSON MUST have EXACTLY these TWO top-level keys:
```json
{
  "consolidated_gaps": [...],      // REQUIRED: Array of gap objects
  "consolidation_metadata": {...}  // REQUIRED: Metadata object
}
```

DO NOT wrap in "findings" or any other key. DO NOT output a bare array.
The FIRST character must be { and the LAST character must be }
Do NOT wrap in markdown code blocks (no ```json)
Do NOT add ANY text before or after the JSON

## CRITICAL VALIDATION REQUIREMENTS:

### 1. Question Format
Every 'question' field MUST end with a question mark (?)
- WRONG: "What are the requirements. Please specify details."
- WRONG: "What tools are used? (e.g., eslint, prettier)"
- RIGHT: "What are the requirements and details?"
- RIGHT: "What tools and configurations are used for linting?"

### 2. Keep Questions Clean
Remove clarifying examples or follow-up instructions from questions
- If you need to add context, put it in the 'reason' field instead

### 3. Agent Name Format
When populating 'consolidated_from' array, use these EXACT agent names:
- 01-structure-architecture
- 02-tech-stack-dependencies
- 03-code-patterns-testing
- 04-data-flows-integrations
- consolidation

Do NOT use descriptive names like 'tech-stack-dependencies-analyzer'.
Use the file name format shown above (with numeric prefixes, no -analyzer suffix).

### 4. Required Fields
Every gap object MUST have ALL 8 fields:
- agent (string)
- item (string)
- question (string ending with ?)
- reason (string)
- priority (high|medium|low)
- type (needs_verification|sparse_findings|missing_language_coverage)
- consolidated_from (array of strings)
- original_count (number)

## Task
Consolidate the questions provided in the context above.
