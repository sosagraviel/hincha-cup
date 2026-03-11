# Initialize-Project TODOs

## Recently Completed ✅

### Comprehensive Retry System with Validation Feedback (2026-03-11)

**Implemented full retry logic with 5 max attempts across all phases!**

**What was implemented**:
1. ✅ Updated `config/retry-config.json` to 5 max attempts globally
2. ✅ Created `scripts/phase1-analysis-with-retry.sh` - Agent validation with retry
3. ✅ Updated `scripts/phase3-synthesis-with-retry.sh` - Synthesis with retry (now 5 attempts)
4. ✅ Created `scripts/phase4-filewriting-with-retry.sh` - File writing with retry
5. ✅ Created `RETRY_IMPLEMENTATION.md` - Complete documentation

**How it works**:
- **Phase 1**: Each agent gets 5 attempts with validation error feedback
- **Phase 3**: Synthesis gets 5 attempts with line count and section validation feedback
- **Phase 4**: File writing gets 5 attempts with parsing and validation feedback
- **Exponential backoff**: 2s, 4s, 6s, 8s, 10s between attempts
- **Validation feedback**: Every retry includes specific error details

**Files created/modified**:
- `config/retry-config.json` (updated to 5 attempts)
- `scripts/phase1-analysis-with-retry.sh` (new)
- `scripts/phase3-synthesis-with-retry.sh` (updated to 5 attempts)
- `scripts/phase4-filewriting-with-retry.sh` (new)
- `RETRY_IMPLEMENTATION.md` (complete documentation)

**Next steps**:
- Use `-with-retry` scripts in orchestration
- Test with intentional failures to verify retry behavior
- Monitor success rates: Target 95%+ within 5 attempts

---

## High Priority

### 1. Agent Output Contract Validation - Strict Schema Enforcement

**Problem**: Current validation accepts any JSON structure in the `findings` object. Agents could output incorrect or incomplete data without failing validation.

**Current State**:
- Generic schema at `config/schemas/phase1-analysis.schema.json`
- `findings` object has `"additionalProperties": true"` - accepts anything
- No validation of agent-specific structure

**Example of Invalid Output That Currently Passes**:
```json
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "2026-03-11T...",
  "findings": {
    "random_garbage": "this should fail but doesn't",
    "missing_required_fields": "no repository_type, languages, etc."
  }
}
```

**Solution**: Create 4 agent-specific schemas that validate exact structure

#### Implementation Steps:

1. **Create Agent-Specific Schemas** (4 files)

   Create `config/schemas/agents/01-structure-architecture.findings.schema.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "Structure & Architecture Analyzer Findings Schema",
     "type": "object",
     "required": ["repository_type", "languages"],
     "properties": {
       "repository_type": {
         "type": "string",
         "enum": ["single-repo", "monorepo", "meta-repo"]
       },
       "packages": {
         "type": "array",
         "items": { "type": "string" }
       },
       "languages": {
         "type": "array",
         "items": { "type": "string" },
         "minItems": 1
       },
       "runtimes": {
         "type": "object",
         "additionalProperties": { "type": "string" }
       },
       "frameworks": {
         "type": "object",
         "properties": {
           "backend": { "type": "string" },
           "frontend": { "type": "string" },
           "testing": { "type": "string" }
         }
       },
       "architecture_pattern": {
         "type": "string",
         "enum": ["MVC", "Clean Architecture", "Layered", "Microservices", "Monolith", "Other"]
       },
       "file_placement": {
         "type": "object",
         "required": ["table_markdown"],
         "properties": {
           "table_markdown": { "type": "string" },
           "shared_packages": {
             "type": "array",
             "items": { "type": "string" }
           },
           "import_conventions": {
             "type": "array",
             "items": { "type": "string" }
           }
         }
       },
       "path_aliases": {
         "type": "object",
         "additionalProperties": { "type": "string" }
       },
       "database": {
         "type": "object",
         "properties": {
           "orm": { "type": "string" },
           "type": { "type": "string" },
           "migration_commands": {
             "type": "array",
             "items": { "type": "string" }
           }
         }
       }
     }
   }
   ```

   Create `config/schemas/agents/02-tech-stack-dependencies.findings.schema.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "Tech Stack & Dependencies Analyzer Findings Schema",
     "type": "object",
     "required": ["dependencies"],
     "properties": {
       "dependencies": {
         "type": "object",
         "required": ["by_package"],
         "properties": {
           "by_package": {
             "type": "object",
             "additionalProperties": {
               "type": "object",
               "properties": {
                 "production": { "type": "object" },
                 "dev": { "type": "object" },
                 "notable": {
                   "type": "array",
                   "items": { "type": "string" }
                 },
                 "count": {
                   "type": "object",
                   "properties": {
                     "production": { "type": "number" },
                     "dev": { "type": "number" }
                   }
                 }
               }
             }
           },
           "conflicts": {
             "type": "array",
             "items": { "type": "object" }
           },
           "lock_strategy": {
             "type": "string",
             "enum": ["strict", "loose", "none"]
           }
         }
       },
       "ci_cd": {
         "type": "object",
         "properties": {
           "provider": { "type": "string" },
           "config_files": {
             "type": "array",
             "items": { "type": "string" }
           },
           "triggers": {
             "type": "array",
             "items": { "type": "string" }
           },
           "stages": {
             "type": "array",
             "items": { "type": "string" }
           }
         }
       },
       "deployment": {
         "type": "object",
         "properties": {
           "target": { "type": "string" },
           "config_files": {
             "type": "array",
             "items": { "type": "string" }
           },
           "runtime_config": { "type": "object" },
           "scaling": { "type": "object" }
         }
       },
       "environment": {
         "type": "object",
         "properties": {
           "required_vars": {
             "type": "array",
             "items": { "type": "string" }
           },
           "environments": {
             "type": "array",
             "items": { "type": "string" }
           },
           "config_approach": {
             "type": "string",
             "enum": ["dotenv", "config-files", "environment-only", "mixed"]
           }
         }
       },
       "databases": {
         "type": "array",
         "items": { "type": "object" }
       },
       "external_services": {
         "type": "array",
         "items": { "type": "object" }
       },
       "build_tools": { "type": "object" },
       "monorepo": {
         "type": "object",
         "properties": {
           "enabled": { "type": "boolean" },
           "tool": { "type": "string" },
           "workspace_manager": { "type": "string" }
         }
       }
     }
   }
   ```

   Create `config/schemas/agents/03-code-patterns-testing.findings.schema.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "Code Patterns & Testing Analyzer Findings Schema",
     "type": "object",
     "required": ["naming_conventions"],
     "properties": {
       "naming_conventions": {
         "type": "object",
         "required": ["variables", "functions", "files"],
         "properties": {
           "variables": {
             "type": "object",
             "required": ["dominant_pattern", "examples"],
             "properties": {
               "dominant_pattern": { "type": "string" },
               "examples": {
                 "type": "array",
                 "items": { "type": "string" }
               }
             }
           },
           "functions": {
             "type": "object",
             "required": ["dominant_pattern", "examples"],
             "properties": {
               "dominant_pattern": { "type": "string" },
               "examples": {
                 "type": "array",
                 "items": { "type": "string" }
               }
             }
           },
           "classes": {
             "type": "object",
             "properties": {
               "dominant_pattern": { "type": "string" },
               "examples": {
                 "type": "array",
                 "items": { "type": "string" }
               }
             }
           },
           "files": {
             "type": "object",
             "required": ["dominant_pattern", "examples"],
             "properties": {
               "dominant_pattern": { "type": "string" },
               "examples": {
                 "type": "array",
                 "items": { "type": "string" }
               }
             }
           }
         }
       },
       "code_organization": { "type": "object" },
       "import_export": { "type": "object" },
       "error_handling": { "type": "object" },
       "async_patterns": { "type": "object" },
       "testing": {
         "type": "object",
         "properties": {
           "frameworks": { "type": "object" },
           "test_counts": { "type": "object" },
           "test_organization": { "type": "string" },
           "test_structure": { "type": "string" }
         }
       },
       "test_patterns": { "type": "object" },
       "test_coverage": { "type": "object" },
       "code_quality": { "type": "object" },
       "pre_commit_hooks": { "type": "object" },
       "code_review": { "type": "object" },
       "documentation": { "type": "object" },
       "security_patterns": { "type": "object" }
     }
   }
   ```

   Create `config/schemas/agents/04-data-flows-integrations.findings.schema.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "Data Flows & Integrations Analyzer Findings Schema",
     "type": "object",
     "properties": {
       "request_response_flow": {
         "type": "object",
         "properties": {
           "framework": { "type": "string" },
           "route_examples": {
             "type": "array",
             "items": {
               "type": "object",
               "required": ["method", "path", "handler"],
               "properties": {
                 "method": { "type": "string" },
                 "path": { "type": "string" },
                 "handler": { "type": "string" },
                 "middleware": {
                   "type": "array",
                   "items": { "type": "string" }
                 }
               }
             }
           },
           "middleware_stack": {
             "type": "array",
             "items": { "type": "object" }
           },
           "response_format": { "type": "string" }
         }
       },
       "data_transformation": { "type": "object" },
       "state_management": { "type": "object" },
       "caching": { "type": "object" },
       "data_validation": { "type": "object" },
       "authentication": {
         "type": "object",
         "properties": {
           "strategy": { "type": "string" },
           "jwt": { "type": "object" },
           "oauth": { "type": "object" },
           "password_hashing": { "type": "object" },
           "files": { "type": "object" }
         }
       },
       "authorization": { "type": "object" },
       "api_design": { "type": "object" },
       "api_documentation": { "type": "object" },
       "rate_limiting": { "type": "object" },
       "external_integrations": {
         "type": "array",
         "items": { "type": "object" }
       },
       "webhooks": { "type": "object" },
       "event_systems": { "type": "object" },
       "background_jobs": { "type": "object" },
       "realtime": { "type": "object" },
       "error_handling": { "type": "object" }
     }
   }
   ```

2. **Update Main Schema to Reference Agent-Specific Schemas**

   Modify `config/schemas/phase1-analysis.schema.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "Phase 1 Analysis Output Schema",
     "type": "object",
     "required": ["agent_name", "timestamp", "findings"],
     "properties": {
       "agent_name": {
         "type": "string",
         "enum": [
           "structure-architecture-analyzer",
           "tech-stack-dependencies-analyzer",
           "code-patterns-testing-analyzer",
           "data-flows-integrations-analyzer"
         ]
       },
       "timestamp": {
         "type": "string",
         "format": "date-time"
       },
       "findings": {
         "type": "object",
         "description": "Validated against agent-specific schema based on agent_name"
       },
       "needs_verification": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["item", "reason"],
           "properties": {
             "item": { "type": "string" },
             "reason": { "type": "string" }
           }
         },
         "maxItems": 3
       },
       "confidence": {
         "type": "string",
         "enum": ["high", "medium", "low"]
       }
     }
   }
   ```

3. **Update Validator to Use Agent-Specific Schemas**

   Modify `utils/validators/validate-agent-output.js`:
   ```javascript
   // After loading main schema and validating top-level structure

   // Load agent-specific findings schema
   const agentName = data.agent_name;
   const agentSchemaMap = {
     'structure-architecture-analyzer': '01-structure-architecture.findings.schema.json',
     'tech-stack-dependencies-analyzer': '02-tech-stack-dependencies.findings.schema.json',
     'code-patterns-testing-analyzer': '03-code-patterns-testing.findings.schema.json',
     'data-flows-integrations-analyzer': '04-data-flows-integrations.findings.schema.json'
   };

   const findingsSchemaFile = agentSchemaMap[agentName];
   if (findingsSchemaFile) {
     const findingsSchemaPath = path.join(schemaDir, 'agents', findingsSchemaFile);
     if (fs.existsSync(findingsSchemaPath)) {
       const findingsSchema = JSON.parse(fs.readFileSync(findingsSchemaPath, 'utf-8'));
       const validateFindings = ajv.compile(findingsSchema);

       if (!validateFindings(data.findings)) {
         errors.push({
           field: 'findings',
           message: 'Findings do not match agent-specific schema',
           details: validateFindings.errors
         });
       }
     }
   }
   ```

4. **Testing**
   - Run integration tests with agent-specific schemas enabled
   - Verify that invalid findings structures are rejected
   - Ensure error messages are clear and actionable

#### Benefits:
- Catches agent output errors early (fail-fast)
- Ensures consolidation receives consistent, well-structured data
- Prevents garbage-in-garbage-out in synthesis phase
- Makes debugging easier with clear validation errors

---

## Medium Priority

### 2. Determinism Testing Framework

Create `tests/determinism/run-twice.sh` to verify consistent outputs:

```bash
#!/bin/bash
# Run initialize-project on same codebase twice
# Compare outputs (excluding timestamps)
# Measure similarity (target: 95%+)

PROJECT="test-project"
RUN1_DIR="/tmp/determinism-test/run1"
RUN2_DIR="/tmp/determinism-test/run2"

# Run 1
initialize-project --project "$PROJECT" --output "$RUN1_DIR"

# Run 2
initialize-project --project "$PROJECT" --output "$RUN2_DIR"

# Compare CLAUDE.md (exclude timestamps, line numbers)
diff <(grep -v "timestamp" "$RUN1_DIR/CLAUDE.md" | sed 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}//g') \
     <(grep -v "timestamp" "$RUN2_DIR/CLAUDE.md" | sed 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}//g')

# Measure similarity percentage
```

### 3. Metrics Collection Dashboard

Add metrics logging to each phase:
- Format validation pass rate (first try vs after repair)
- Length constraint compliance rate
- Time to completion per phase
- Retry count per operation
- NEEDS_VERIFICATION average count

Create `scripts/collect-metrics.js` to aggregate and report metrics.

---

## Low Priority

### 4. Enhanced Integration Tests

Add test cases for:
- Monorepo projects (multiple packages)
- Multi-language projects (TypeScript + Python)
- Edge cases (no tests, no CI/CD, minimal docs)
- Large codebases (10k+ files)

### 5. Documentation Updates

- Update README with new validation architecture
- Create ARCHITECTURE.md diagram showing validation flow
- Document agent output contracts in detail
- Create troubleshooting guide for common validation errors

---

## Completed ✅

- [x] Phase 1: Foundation (directory structure, schemas, config)
- [x] Phase 2: Validation Layer (core validators)
- [x] Phase 3: Workflow Scripts (6 phase scripts + helpers)
- [x] Phase 4: Hook System (3 hooks + templates)
- [x] Phase 5: Agent Refactoring (4 agents with JSON contracts)
- [x] Skill Linking Validation (implemented in phase5-resources.sh)
- [x] Integration Tests (Phases 1-4 with schema validation)

---

## Notes

**Skill Linking Validation**: Already working! Phase 5 script validates required skills and blocks execution if missing. Just needs integration test coverage.

**Agent Output Validation**: Currently too permissive. Priority #1 fix to ensure data quality throughout pipeline.
