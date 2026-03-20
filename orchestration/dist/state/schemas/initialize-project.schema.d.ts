import { z } from "zod";
/**
 * State schema for initialize-project workflow
 * 6-Phase Architecture:
 * Phase 1: Parallel Analysis (4 agents)
 * Phase 2: Consolidation & Gap Analysis
 * Phase 3: Opus Synthesis
 * Phase 4: Context Generation (CLAUDE.md, project-context)
 * Phase 5: Resource Copying
 * Phase 6: Final Validation
 *
 * Each phase has retry with exponential backoff and error feedback
 */
export declare const AnalyzerOutputSchema: z.ZodObject<{
    agent_name: z.ZodEnum<{
        "structure-architecture-analyzer": "structure-architecture-analyzer";
        "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
        "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
        "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
    }>;
    timestamp: z.ZodString;
    findings: z.ZodAny;
    needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
    confidence_level: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
}, z.core.$strip>;
export declare const Phase1AnalysisSchema: z.ZodObject<{
    structure_architecture: z.ZodOptional<z.ZodObject<{
        agent_name: z.ZodEnum<{
            "structure-architecture-analyzer": "structure-architecture-analyzer";
            "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
            "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
            "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
        }>;
        timestamp: z.ZodString;
        findings: z.ZodAny;
        needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        confidence_level: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>>;
    }, z.core.$strip>>;
    tech_stack_dependencies: z.ZodOptional<z.ZodObject<{
        agent_name: z.ZodEnum<{
            "structure-architecture-analyzer": "structure-architecture-analyzer";
            "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
            "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
            "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
        }>;
        timestamp: z.ZodString;
        findings: z.ZodAny;
        needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        confidence_level: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>>;
    }, z.core.$strip>>;
    code_patterns_testing: z.ZodOptional<z.ZodObject<{
        agent_name: z.ZodEnum<{
            "structure-architecture-analyzer": "structure-architecture-analyzer";
            "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
            "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
            "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
        }>;
        timestamp: z.ZodString;
        findings: z.ZodAny;
        needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        confidence_level: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>>;
    }, z.core.$strip>>;
    data_flows_integrations: z.ZodOptional<z.ZodObject<{
        agent_name: z.ZodEnum<{
            "structure-architecture-analyzer": "structure-architecture-analyzer";
            "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
            "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
            "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
        }>;
        timestamp: z.ZodString;
        findings: z.ZodAny;
        needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        confidence_level: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>>;
    }, z.core.$strip>>;
    all_completed: z.ZodDefault<z.ZodBoolean>;
    completion_timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const Phase2ConsolidationSchema: z.ZodObject<{
    consolidated_findings: z.ZodAny;
    identified_gaps: z.ZodOptional<z.ZodArray<z.ZodString>>;
    conflicting_findings: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timestamp: z.ZodString;
}, z.core.$strip>;
export declare const Phase3SynthesisSchema: z.ZodObject<{
    synthesis_content: z.ZodString;
    extracted_files: z.ZodOptional<z.ZodObject<{
        claude_md: z.ZodOptional<z.ZodString>;
        project_context_md: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    timestamp: z.ZodString;
    validation_passed: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const Phase4ContextSchema: z.ZodObject<{
    claude_md_written: z.ZodDefault<z.ZodBoolean>;
    project_context_written: z.ZodDefault<z.ZodBoolean>;
    stack_profile: z.ZodOptional<z.ZodAny>;
    framework_config_generated: z.ZodDefault<z.ZodBoolean>;
    timestamp: z.ZodString;
}, z.core.$strip>;
export declare const RetryStateSchema: z.ZodObject<{
    attempt: z.ZodDefault<z.ZodNumber>;
    max_attempts: z.ZodDefault<z.ZodNumber>;
    last_error: z.ZodOptional<z.ZodString>;
    error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
    next_delay_ms: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    completed_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const Phase1RetryTrackingSchema: z.ZodObject<{
    structure_architecture: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    tech_stack_dependencies: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    code_patterns_testing: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    data_flows_integrations: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InitializeProjectStateSchema: z.ZodObject<{
    project_path: z.ZodString;
    framework_path: z.ZodString;
    current_phase: z.ZodDefault<z.ZodEnum<{
        init: "init";
        phase1_analysis: "phase1_analysis";
        phase2_consolidation: "phase2_consolidation";
        phase3_synthesis: "phase3_synthesis";
        phase4_context: "phase4_context";
        phase5_resources: "phase5_resources";
        phase6_validation: "phase6_validation";
        complete: "complete";
        failed: "failed";
    }>>;
    phase1_analysis: z.ZodOptional<z.ZodObject<{
        structure_architecture: z.ZodOptional<z.ZodObject<{
            agent_name: z.ZodEnum<{
                "structure-architecture-analyzer": "structure-architecture-analyzer";
                "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
                "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
                "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
            }>;
            timestamp: z.ZodString;
            findings: z.ZodAny;
            needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            confidence_level: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>>;
        }, z.core.$strip>>;
        tech_stack_dependencies: z.ZodOptional<z.ZodObject<{
            agent_name: z.ZodEnum<{
                "structure-architecture-analyzer": "structure-architecture-analyzer";
                "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
                "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
                "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
            }>;
            timestamp: z.ZodString;
            findings: z.ZodAny;
            needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            confidence_level: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>>;
        }, z.core.$strip>>;
        code_patterns_testing: z.ZodOptional<z.ZodObject<{
            agent_name: z.ZodEnum<{
                "structure-architecture-analyzer": "structure-architecture-analyzer";
                "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
                "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
                "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
            }>;
            timestamp: z.ZodString;
            findings: z.ZodAny;
            needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            confidence_level: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>>;
        }, z.core.$strip>>;
        data_flows_integrations: z.ZodOptional<z.ZodObject<{
            agent_name: z.ZodEnum<{
                "structure-architecture-analyzer": "structure-architecture-analyzer";
                "tech-stack-dependencies-analyzer": "tech-stack-dependencies-analyzer";
                "code-patterns-testing-analyzer": "code-patterns-testing-analyzer";
                "data-flows-integrations-analyzer": "data-flows-integrations-analyzer";
            }>;
            timestamp: z.ZodString;
            findings: z.ZodAny;
            needs_verification: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            confidence_level: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>>;
        }, z.core.$strip>>;
        all_completed: z.ZodDefault<z.ZodBoolean>;
        completion_timestamp: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    phase2_consolidation: z.ZodOptional<z.ZodObject<{
        consolidated_findings: z.ZodAny;
        identified_gaps: z.ZodOptional<z.ZodArray<z.ZodString>>;
        conflicting_findings: z.ZodOptional<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodString;
    }, z.core.$strip>>;
    phase3_synthesis: z.ZodOptional<z.ZodObject<{
        synthesis_content: z.ZodString;
        extracted_files: z.ZodOptional<z.ZodObject<{
            claude_md: z.ZodOptional<z.ZodString>;
            project_context_md: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        validation_passed: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    phase4_context: z.ZodOptional<z.ZodObject<{
        claude_md_written: z.ZodDefault<z.ZodBoolean>;
        project_context_written: z.ZodDefault<z.ZodBoolean>;
        stack_profile: z.ZodOptional<z.ZodAny>;
        framework_config_generated: z.ZodDefault<z.ZodBoolean>;
        timestamp: z.ZodString;
    }, z.core.$strip>>;
    temp_dir: z.ZodOptional<z.ZodString>;
    phase1_retry_tracking: z.ZodDefault<z.ZodObject<{
        structure_architecture: z.ZodOptional<z.ZodObject<{
            attempt: z.ZodDefault<z.ZodNumber>;
            max_attempts: z.ZodDefault<z.ZodNumber>;
            last_error: z.ZodOptional<z.ZodString>;
            error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
            next_delay_ms: z.ZodOptional<z.ZodNumber>;
            started_at: z.ZodOptional<z.ZodString>;
            completed_at: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        tech_stack_dependencies: z.ZodOptional<z.ZodObject<{
            attempt: z.ZodDefault<z.ZodNumber>;
            max_attempts: z.ZodDefault<z.ZodNumber>;
            last_error: z.ZodOptional<z.ZodString>;
            error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
            next_delay_ms: z.ZodOptional<z.ZodNumber>;
            started_at: z.ZodOptional<z.ZodString>;
            completed_at: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        code_patterns_testing: z.ZodOptional<z.ZodObject<{
            attempt: z.ZodDefault<z.ZodNumber>;
            max_attempts: z.ZodDefault<z.ZodNumber>;
            last_error: z.ZodOptional<z.ZodString>;
            error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
            next_delay_ms: z.ZodOptional<z.ZodNumber>;
            started_at: z.ZodOptional<z.ZodString>;
            completed_at: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        data_flows_integrations: z.ZodOptional<z.ZodObject<{
            attempt: z.ZodDefault<z.ZodNumber>;
            max_attempts: z.ZodDefault<z.ZodNumber>;
            last_error: z.ZodOptional<z.ZodString>;
            error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
            next_delay_ms: z.ZodOptional<z.ZodNumber>;
            started_at: z.ZodOptional<z.ZodString>;
            completed_at: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    phase2_retry: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    phase3_retry: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    phase4_retry: z.ZodOptional<z.ZodObject<{
        attempt: z.ZodDefault<z.ZodNumber>;
        max_attempts: z.ZodDefault<z.ZodNumber>;
        last_error: z.ZodOptional<z.ZodString>;
        error_history: z.ZodDefault<z.ZodArray<z.ZodString>>;
        next_delay_ms: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    errors: z.ZodDefault<z.ZodArray<z.ZodString>>;
    warnings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    framework_config_path: z.ZodOptional<z.ZodString>;
    claude_md_path: z.ZodOptional<z.ZodString>;
    project_context_path: z.ZodOptional<z.ZodString>;
    started_at: z.ZodOptional<z.ZodString>;
    completed_at: z.ZodOptional<z.ZodString>;
    total_duration_ms: z.ZodOptional<z.ZodNumber>;
    checkpoint_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AnalyzerOutput = z.infer<typeof AnalyzerOutputSchema>;
export type Phase1Analysis = z.infer<typeof Phase1AnalysisSchema>;
export type Phase2Consolidation = z.infer<typeof Phase2ConsolidationSchema>;
export type Phase3Synthesis = z.infer<typeof Phase3SynthesisSchema>;
export type Phase4Context = z.infer<typeof Phase4ContextSchema>;
export type RetryState = z.infer<typeof RetryStateSchema>;
export type Phase1RetryTracking = z.infer<typeof Phase1RetryTrackingSchema>;
export type InitializeProjectState = z.infer<typeof InitializeProjectStateSchema>;
/**
 * LangGraph Annotation for Initialize Project Workflow
 *
 * This Annotation is required to support parallel state updates from Phase 1 analyzers.
 * Key differences from Zod schema:
 *
 * 1. Merge Reducers: Fields updated by parallel nodes use merge reducers
 *    - phase1_retry_tracking: Merges retry state from 4 parallel analyzers
 *    - phase1_analysis: Merges analysis results from 4 parallel analyzers
 *    - errors/warnings: Concatenates arrays from multiple nodes
 *
 * 2. Default Values: Required for all fields that use custom reducers
 *
 * 3. LastValue Reducer: Used for all other fields (default behavior)
 *
 * Why this is needed:
 * - LangGraph's default LastValue reducer only accepts ONE update per step
 * - Phase 1 has 4 nodes running in parallel
 * - Without merge reducers, the graph throws "LastValue can only receive one value per step"
 *
 * See: https://docs.langchain.com/oss/javascript/langgraph/INVALID_CONCURRENT_GRAPH_UPDATE/
 */
export declare const InitializeProjectAnnotation: import("@langchain/langgraph").AnnotationRoot<{
    project_path: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    framework_path: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    current_phase: import("@langchain/langgraph").BaseChannel<"init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed", "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed" | import("@langchain/langgraph").OverwriteValue<"init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed">, unknown>;
    phase1_analysis: import("@langchain/langgraph").BaseChannel<{
        all_completed: boolean;
        structure_architecture?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        code_patterns_testing?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        data_flows_integrations?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        completion_timestamp?: string | undefined;
    }, {
        all_completed: boolean;
        structure_architecture?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        code_patterns_testing?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        data_flows_integrations?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        completion_timestamp?: string | undefined;
    } | import("@langchain/langgraph").OverwriteValue<{
        all_completed: boolean;
        structure_architecture?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        code_patterns_testing?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        data_flows_integrations?: {
            agent_name: "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer";
            timestamp: string;
            findings: any;
            needs_verification?: any[] | undefined;
            confidence_level?: "low" | "medium" | "high" | undefined;
        } | undefined;
        completion_timestamp?: string | undefined;
    }>, unknown>;
    phase2_consolidation: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined, {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined, {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | import("@langchain/langgraph").OverwriteValue<{
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    phase3_synthesis: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined, {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined, {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | import("@langchain/langgraph").OverwriteValue<{
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    phase4_context: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined, {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined, {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | import("@langchain/langgraph").OverwriteValue<{
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    temp_dir: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    phase1_retry_tracking: import("@langchain/langgraph").BaseChannel<{
        structure_architecture?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        code_patterns_testing?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        data_flows_integrations?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
    }, {
        structure_architecture?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        code_patterns_testing?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        data_flows_integrations?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
    } | import("@langchain/langgraph").OverwriteValue<{
        structure_architecture?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        tech_stack_dependencies?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        code_patterns_testing?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        data_flows_integrations?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
    }>, unknown>;
    phase2_retry: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | import("@langchain/langgraph").OverwriteValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    phase3_retry: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | import("@langchain/langgraph").OverwriteValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    phase4_retry: {
        (annotation: import("@langchain/langgraph").SingleReducer<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>): import("@langchain/langgraph").BaseChannel<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined, {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | import("@langchain/langgraph").OverwriteValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<{
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    errors: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
    warnings: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
    framework_config_path: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    claude_md_path: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    project_context_path: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    started_at: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    completed_at: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    total_duration_ms: {
        (annotation: import("@langchain/langgraph").SingleReducer<number | undefined, number | undefined>): import("@langchain/langgraph").BaseChannel<number | undefined, number | import("@langchain/langgraph").OverwriteValue<number | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<number | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    checkpoint_id: {
        (annotation: import("@langchain/langgraph").SingleReducer<string | undefined, string | undefined>): import("@langchain/langgraph").BaseChannel<string | undefined, string | import("@langchain/langgraph").OverwriteValue<string | undefined> | undefined, unknown>;
        (): import("@langchain/langgraph").LastValue<string | undefined>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
}>;
//# sourceMappingURL=initialize-project.schema.d.ts.map