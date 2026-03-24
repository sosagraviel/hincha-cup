import { describe, it, expect, vi, beforeEach } from "vitest";
import { resourcesNode } from "../../../../../src/nodes/initialize-project/phase5/resources.node.js";
import type { InitializeProjectState } from "../../../../../src/state/schemas/initialize-project.schema.js";
import * as fs from "fs";
import * as skillResolver from "../../../../../src/utils/skill-resolver.js";
import * as agentGenerator from "../../../../../src/utils/agent-generator.js";

vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("../../../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock("../../../../../src/utils/skill-resolver.js", () => ({
  resolveSkills: vi.fn(),
  copyResolvedSkills: vi.fn(),
}));

vi.mock("../../../../../src/utils/agent-generator.js", () => ({
  generateAgents: vi.fn(),
  writeAgents: vi.fn(),
}));

describe("resourcesNode", () => {
  let mockState: InitializeProjectState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: "/test/project",
      framework_path: "/test/framework",
      current_phase: "phase4_context",
      temp_dir: "/test/temp",
      phase1_analysis: {},
      phase1_retry_tracking: {},
      phase4_context: {
        framework_config_generated: true,
        claude_md_written: true,
        project_context_written: true,
        timestamp: "2024-01-01T00:00:00Z",
      },
      errors: [],
      warnings: [],
    };

    // Mock framework config file read
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        stack_profile: {
          languages: ["typescript", "javascript"],
          frameworks: { frontend: ["react"], backend: ["express"], mobile: [] },
        },
      }),
    );

    // Mock skills resolution
    vi.mocked(skillResolver.resolveSkills).mockReturnValue([
      { name: "typescript-skill", path: "/skills/typescript" },
      { name: "react-skill", path: "/skills/react" },
    ]);

    vi.mocked(skillResolver.copyResolvedSkills).mockReturnValue(5);

    // Mock agent generation
    vi.mocked(agentGenerator.generateAgents).mockReturnValue([
      { name: "planner", content: "agent content" },
      { name: "implementer", content: "agent content" },
    ] as any);

    // Mock command files
    vi.mocked(fs.readdirSync).mockReturnValue([
      "implement.md",
      "review.md",
      "initialize-project.md",
    ] as any);
  });

  it("should throw error if phase4_context not completed", async () => {
    const stateWithoutPhase4 = { ...mockState, phase4_context: undefined };

    await expect(resourcesNode(stateWithoutPhase4)).rejects.toThrow(
      "Phase 4 context generation not completed",
    );
  });

  it("should throw error if framework_config_generated is false", async () => {
    mockState.phase4_context!.framework_config_generated = false;

    await expect(resourcesNode(mockState)).rejects.toThrow(
      "Phase 4 context generation not completed",
    );
  });

  it("should successfully copy resources", async () => {
    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe("phase5_resources");
    expect(result.errors).toBeUndefined();
  });

  it("should read framework config from disk", async () => {
    await resourcesNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("framework-config.json"),
      "utf-8",
    );
  });

  it("should resolve skills based on stack profile", async () => {
    await resourcesNode(mockState);

    expect(skillResolver.resolveSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        languages: ["typescript", "javascript"],
      }),
      "/test/framework",
    );
  });

  it("should copy resolved skills", async () => {
    await resourcesNode(mockState);

    expect(skillResolver.copyResolvedSkills).toHaveBeenCalledWith(
      expect.any(Array),
      "/test/project",
    );
  });

  it("should generate agents with correct parameters", async () => {
    await resourcesNode(mockState);

    expect(agentGenerator.generateAgents).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ["typescript", "javascript"] }),
      expect.any(Array),
      "/test/project",
      expect.stringContaining("agents/templates"),
      "/test/framework",
    );
  });

  it("should write generated agents to disk", async () => {
    await resourcesNode(mockState);

    expect(agentGenerator.writeAgents).toHaveBeenCalledWith(
      expect.any(Array),
      "/test/project",
    );
  });

  it("should create commands directory", async () => {
    await resourcesNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".claude/commands"),
      { recursive: true },
    );
  });

  it("should copy command files except initialize-project.md", async () => {
    await resourcesNode(mockState);

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("implement.md"),
      expect.any(String),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("review.md"),
      expect.any(String),
    );
    // Should not copy initialize-project.md
    expect(fs.copyFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining("initialize-project.md"),
      expect.any(String),
    );
  });

  it("should filter command files to only .md files", async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      "implement.md",
      "test.txt",
      "review.md",
      "data.json",
    ] as any);

    await resourcesNode(mockState);

    // Should only copy .md files
    const copyFileCalls = vi.mocked(fs.copyFileSync).mock.calls;
    expect(copyFileCalls.length).toBe(2); // implement.md and review.md
  });

  it("should handle errors gracefully", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("File read error");
    });

    const result = await resourcesNode(mockState);

    expect(result.errors).toContain(
      "Resources copying failed: File read error",
    );
    expect(result.current_phase).toBe("failed");
  });

  it("should preserve existing errors when adding new error", async () => {
    mockState.errors = ["Previous error"];
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("New error");
    });

    const result = await resourcesNode(mockState);

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain("Previous error");
  });

  it("should handle missing stack profile in config", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

    const result = await resourcesNode(mockState);

    // Should fail due to missing stack_profile
    expect(result.errors).toBeDefined();
  });

  it("should handle empty skills array", async () => {
    vi.mocked(skillResolver.resolveSkills).mockReturnValue([]);
    vi.mocked(skillResolver.copyResolvedSkills).mockReturnValue(0);

    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe("phase5_resources");
  });

  it("should handle empty agents array", async () => {
    vi.mocked(agentGenerator.generateAgents).mockReturnValue([]);

    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe("phase5_resources");
  });

  it("should handle empty command files", async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe("phase5_resources");
  });

  it("should construct correct paths for resources", async () => {
    await resourcesNode(mockState);

    // Check templates path
    expect(agentGenerator.generateAgents).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      "/test/project",
      "/test/framework/agents/templates",
      "/test/framework",
    );
  });

  it("should handle JSON parse errors in framework config", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("invalid json{");

    const result = await resourcesNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe("failed");
  });

  it("should return phase5_resources on success", async () => {
    const result = await resourcesNode(mockState);

    expect(result).toEqual({ current_phase: "phase5_resources" });
  });
});
