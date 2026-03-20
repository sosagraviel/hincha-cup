import { StateGraph } from '@langchain/langgraph';
/**
 * Initialize Project Graph - 6-Phase Workflow
 *
 * PHASE 1 (PARALLEL): Run 4 analyzer agents concurrently
 *   - structure-architecture-analyzer
 *   - tech-stack-dependencies-analyzer
 *   - code-patterns-testing-analyzer
 *   - data-flows-integrations-analyzer
 *
 * PHASE 2: Consolidate findings and identify gaps
 * PHASE 3: Run Opus synthesis agent for comprehensive analysis
 * PHASE 4: Generate CLAUDE.md and project-context/SKILL.md
 * PHASE 5: Copy skills and resources
 * PHASE 6: Final validation
 *
 * Each phase has retry logic with exponential backoff and error feedback.
 * Phase 1 agents run in parallel using LangGraph's built-in parallelization.
 */
export declare const initializeProjectGraph: StateGraph<import("@langchain/langgraph").AnnotationRoot<{
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
}>, import("@langchain/langgraph").StateType<{
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
}>, import("@langchain/langgraph").UpdateType<{
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
}>, "validation" | "resources" | "__start__" | "structure_architecture_analyzer" | "tech_stack_dependencies_analyzer" | "code_patterns_testing_analyzer" | "data_flows_integrations_analyzer" | "consolidation" | "synthesis" | "context_generation", {
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
}, {
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
}, import("@langchain/langgraph").StateDefinition, {
    structure_architecture_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    tech_stack_dependencies_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    code_patterns_testing_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    data_flows_integrations_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    consolidation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    synthesis: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    context_generation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    resources: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    validation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
}, unknown, unknown>;
/**
 * Create a compiled graph instance with checkpointer
 *
 * @param checkpointer - LangGraph checkpointer (SqliteSaver or PostgresSaver)
 * @returns Compiled graph ready for execution
 *
 * @example
 * ```typescript
 * import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
 *
 * const checkpointer = new SqliteSaver('./checkpoints.db');
 * const graph = await createInitializeProjectGraph(checkpointer);
 *
 * const result = await graph.invoke({
 *   project_path: '/path/to/project',
 *   framework_path: '/path/to/framework',
 *   current_phase: 'init'
 * }, {
 *   configurable: { thread_id: 'init-123' }
 * });
 * ```
 */
export declare function createInitializeProjectGraph(checkpointer: any): Promise<import("@langchain/langgraph").CompiledStateGraph<{
    project_path: string;
    framework_path: string;
    current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
    phase1_analysis: {
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
    };
    phase2_consolidation: {
        consolidated_findings: any;
        timestamp: string;
        identified_gaps?: string[] | undefined;
        conflicting_findings?: string[] | undefined;
    } | undefined;
    phase3_synthesis: {
        synthesis_content: string;
        timestamp: string;
        validation_passed: boolean;
        extracted_files?: {
            claude_md?: string | undefined;
            project_context_md?: string | undefined;
        } | undefined;
    } | undefined;
    phase4_context: {
        claude_md_written: boolean;
        project_context_written: boolean;
        framework_config_generated: boolean;
        timestamp: string;
        stack_profile?: any;
    } | undefined;
    temp_dir: string | undefined;
    phase1_retry_tracking: {
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
    };
    phase2_retry: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    phase3_retry: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    phase4_retry: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    errors: string[];
    warnings: string[];
    framework_config_path: string | undefined;
    claude_md_path: string | undefined;
    project_context_path: string | undefined;
    started_at: string | undefined;
    completed_at: string | undefined;
    total_duration_ms: number | undefined;
    checkpoint_id: string | undefined;
}, {
    project_path?: string | undefined;
    framework_path?: string | undefined;
    current_phase?: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed" | import("@langchain/langgraph").OverwriteValue<"init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed"> | undefined;
    phase1_analysis?: {
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
    }> | undefined;
    phase2_consolidation?: {
        consolidated_findings: any;
        timestamp: string;
        identified_gaps?: string[] | undefined;
        conflicting_findings?: string[] | undefined;
    } | undefined;
    phase3_synthesis?: {
        synthesis_content: string;
        timestamp: string;
        validation_passed: boolean;
        extracted_files?: {
            claude_md?: string | undefined;
            project_context_md?: string | undefined;
        } | undefined;
    } | undefined;
    phase4_context?: {
        claude_md_written: boolean;
        project_context_written: boolean;
        framework_config_generated: boolean;
        timestamp: string;
        stack_profile?: any;
    } | undefined;
    temp_dir?: string | undefined;
    phase1_retry_tracking?: {
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
    }> | undefined;
    phase2_retry?: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    phase3_retry?: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    phase4_retry?: {
        attempt: number;
        max_attempts: number;
        error_history: string[];
        last_error?: string | undefined;
        next_delay_ms?: number | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
    } | undefined;
    errors?: string[] | import("@langchain/langgraph").OverwriteValue<string[]> | undefined;
    warnings?: string[] | import("@langchain/langgraph").OverwriteValue<string[]> | undefined;
    framework_config_path?: string | undefined;
    claude_md_path?: string | undefined;
    project_context_path?: string | undefined;
    started_at?: string | undefined;
    completed_at?: string | undefined;
    total_duration_ms?: number | undefined;
    checkpoint_id?: string | undefined;
}, "validation" | "resources" | "__start__" | "structure_architecture_analyzer" | "tech_stack_dependencies_analyzer" | "code_patterns_testing_analyzer" | "data_flows_integrations_analyzer" | "consolidation" | "synthesis" | "context_generation", {
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
}, {
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
}, import("@langchain/langgraph").StateDefinition, {
    structure_architecture_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    tech_stack_dependencies_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    code_patterns_testing_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    data_flows_integrations_analyzer: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    consolidation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    synthesis: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    context_generation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    resources: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
    validation: Partial<{
        project_path: string;
        framework_path: string;
        current_phase: "init" | "phase1_analysis" | "phase2_consolidation" | "phase3_synthesis" | "phase4_context" | "phase5_resources" | "phase6_validation" | "complete" | "failed";
        phase1_retry_tracking: {
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
        };
        errors: string[];
        warnings: string[];
        phase1_analysis?: {
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
        } | undefined;
        phase2_consolidation?: {
            consolidated_findings: any;
            timestamp: string;
            identified_gaps?: string[] | undefined;
            conflicting_findings?: string[] | undefined;
        } | undefined;
        phase3_synthesis?: {
            synthesis_content: string;
            timestamp: string;
            validation_passed: boolean;
            extracted_files?: {
                claude_md?: string | undefined;
                project_context_md?: string | undefined;
            } | undefined;
        } | undefined;
        phase4_context?: {
            claude_md_written: boolean;
            project_context_written: boolean;
            framework_config_generated: boolean;
            timestamp: string;
            stack_profile?: any;
        } | undefined;
        temp_dir?: string | undefined;
        phase2_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase3_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        phase4_retry?: {
            attempt: number;
            max_attempts: number;
            error_history: string[];
            last_error?: string | undefined;
            next_delay_ms?: number | undefined;
            started_at?: string | undefined;
            completed_at?: string | undefined;
        } | undefined;
        framework_config_path?: string | undefined;
        claude_md_path?: string | undefined;
        project_context_path?: string | undefined;
        started_at?: string | undefined;
        completed_at?: string | undefined;
        total_duration_ms?: number | undefined;
        checkpoint_id?: string | undefined;
    }>;
}, unknown, unknown>>;
//# sourceMappingURL=initialize-project.graph.d.ts.map