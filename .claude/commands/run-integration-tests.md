# Run Integration Tests

Executes all initialize-project agent integration tests automatically.

## Instructions

1. Run `ai-agentic-framework/tests/run-integration-tests.sh` to get the task list
2. Parse the task list between `AGENT_TASKS_START` and `AGENT_TASKS_END`
3. For each task line (format: `AGENT_NUM|AGENT_NAME|AGENT_FILE|PROJECT_PATH|OUTPUT_FILE`):
   - Spawn a background agent using the Task tool with `run_in_background=true`
   - Use model: haiku
   - Agent prompt:
     ```
     You are the {AGENT_NAME} agent.

     Follow ALL instructions in {AGENT_FILE}

     Analyze the codebase at: {PROJECT_PATH}

     Output ONLY valid JSON with:
     - agent_name
     - timestamp (ISO 8601)
     - findings (object)
     - needs_verification (array, max 3 items)

     Save the JSON output to: {OUTPUT_FILE}
     ```
4. Wait for ALL agents to complete using AgentOutputTool with `block=true`
5. Run `ai-agentic-framework/tests/validate-results.sh` to validate all outputs
6. Report the final test results to the user

## Expected Output

Show user:
- Total tests: X
- ✓ Passed: Y
- ✗ Failed: Z
- Final status
