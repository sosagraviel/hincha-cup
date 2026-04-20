import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveConfigPath } from '../../utils/provider-paths.js';

/**
 * Figma Export Service
 *
 * Fetches Figma designs, exports frame images, and extracts structured
 * design constraints. Implements a 6-step cascading access strategy:
 *
 *   1. Figma MCP (check .claude/mcp.json)
 *   2. FIGMA_ACCESS_TOKEN env var → Figma REST API
 *   3. Suggest MCP setup (interactive — handled by skill layer)
 *   4. Ask user to set token (interactive — handled by skill layer)
 *   5. Ask for manual exports (interactive — handled by skill layer)
 *   6. Fall back to screenshot-only mode
 *
 * Steps 3-6 involve user interaction and are surfaced via the result
 * so the calling skill can prompt the user.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FigmaFetchResult {
  success: boolean;
  accessMethod: 'mcp' | 'token' | 'manual' | 'none';
  images: Array<{ nodeId: string; label: string; imagePath: string }>;
  constraints: Array<{ nodeId: string; label: string; constraintsPath: string }>;
  designContextPath?: string;
  error?: string;
}

export interface DesignConstraints {
  nodeId: string;
  label: string;
  dimensions: {
    width: number;
    height: number;
    cornerRadius: number;
  };
  layout: {
    mode: string;
    padding: { top: number; right: number; bottom: number; left: number };
    gap: number;
    primaryAlign: string;
    counterAlign: string;
  };
  colors: Array<{
    role: string;
    rgba: [number, number, number, number];
    cssVar?: string;
  }>;
  typography: Array<{
    role: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
  }>;
  children: Array<{
    name: string;
    type: string;
    constraints?: Record<string, unknown>;
  }>;
}

interface FigmaNodeData {
  document: {
    id: string;
    name: string;
    type: string;
    absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
    cornerRadius?: number;
    layoutMode?: string;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    itemSpacing?: number;
    fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number } }>;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: number;
      lineHeightPx?: number;
      letterSpacing?: number;
    };
    children?: FigmaNodeData['document'][];
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FigmaExportService {
  private projectPath: string;
  private outputDir: string;

  constructor(projectPath: string, outputDir: string) {
    this.projectPath = projectPath;
    this.outputDir = outputDir;
  }

  /**
   * Check which Figma access method is available (non-interactive).
   */
  async getAccessStatus(): Promise<'mcp' | 'token' | 'none'> {
    if (this.hasMcpAccess()) return 'mcp';
    if (this.hasTokenAccess()) return 'token';
    return 'none';
  }

  /**
   * Fetch design context for given Figma nodes.
   * Tries MCP → token → returns accessMethod: 'none' if neither available.
   */
  async fetchDesignContext(
    fileKey: string,
    nodeIds: string[],
    labels?: string[],
  ): Promise<FigmaFetchResult> {
    const figmaDir = join(this.outputDir, 'figma');
    mkdirSync(figmaDir, { recursive: true });

    const accessStatus = await this.getAccessStatus();

    if (accessStatus === 'none') {
      return {
        success: false,
        accessMethod: 'none',
        images: [],
        constraints: [],
        error:
          'No Figma access available. Configure Figma MCP in .claude/mcp.json ' +
          'or set FIGMA_ACCESS_TOKEN environment variable.',
      };
    }

    // MCP-based fetching is handled at the skill layer via Claude tool calls,
    // not via the REST API. Surface this so the caller can delegate to the skill.
    if (accessStatus === 'mcp') {
      return {
        success: false,
        accessMethod: 'mcp',
        images: [],
        constraints: [],
        error:
          'Figma MCP detected. Use the figma-design-fetcher skill to fetch ' +
          'designs via MCP tool calls — this service only handles REST API access.',
      };
    }

    const images: FigmaFetchResult['images'] = [];
    const constraints: FigmaFetchResult['constraints'] = [];

    try {
      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i];
        const label = labels?.[i] ?? `frame-${nodeId.replace(':', '-')}`;

        // Fetch frame image
        const imageBuffer = await this.fetchFrameImage(fileKey, nodeId);
        const imagePath = join(figmaDir, `${label}.png`);
        writeFileSync(imagePath, imageBuffer);
        images.push({ nodeId, label, imagePath });

        // Fetch node properties and extract constraints
        const nodeData = await this.fetchNodeProperties(fileKey, nodeId);
        const extracted = this.extractConstraints(nodeData, label);
        const constraintsPath = join(figmaDir, `${label}-constraints.json`);
        writeFileSync(constraintsPath, JSON.stringify(extracted, null, 2));
        constraints.push({ nodeId, label, constraintsPath });
      }

      // Generate human-readable design context
      const allConstraints = constraints.map(
        (c) => JSON.parse(readFileSync(c.constraintsPath, 'utf-8')) as DesignConstraints,
      );
      const contextMd = this.generateDesignContext(allConstraints);
      const designContextPath = join(figmaDir, 'design-context.md');
      writeFileSync(designContextPath, contextMd);

      console.log(`[FigmaExport] ✓ Fetched ${images.length} frames from Figma`);

      return {
        success: true,
        accessMethod: accessStatus,
        images,
        constraints,
        designContextPath,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FigmaExport] ✗ Failed: ${message}`);
      return {
        success: false,
        accessMethod: accessStatus,
        images,
        constraints,
        error: message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Access checks
  // -------------------------------------------------------------------------

  private hasMcpAccess(): boolean {
    const mcpConfigPath = resolveConfigPath(this.projectPath, 'mcp.json');
    if (!existsSync(mcpConfigPath)) return false;
    try {
      const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
      const servers = config.mcpServers ?? config.servers ?? {};
      return Object.keys(servers).some((name) => name.toLowerCase().includes('figma'));
    } catch {
      return false;
    }
  }

  private hasTokenAccess(): boolean {
    return Boolean(process.env.FIGMA_ACCESS_TOKEN);
  }

  private getToken(): string {
    const token = process.env.FIGMA_ACCESS_TOKEN;
    if (!token) throw new Error('FIGMA_ACCESS_TOKEN not set');
    return token;
  }

  // -------------------------------------------------------------------------
  // Figma REST API helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch a frame image from Figma at 2x scale.
   */
  async fetchFrameImage(fileKey: string, nodeId: string, scale = 2): Promise<Buffer> {
    const token = this.getToken();
    const encodedNodeId = encodeURIComponent(nodeId);

    const metaUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodedNodeId}&format=png&scale=${scale}`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      throw new Error(`Figma images API returned ${metaRes.status}: ${await metaRes.text()}`);
    }

    const meta = (await metaRes.json()) as { images: Record<string, string | null> };
    const imageUrl = meta.images[nodeId];

    if (!imageUrl) {
      throw new Error(`No image URL returned for node ${nodeId}`);
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download Figma image: ${imgRes.status}`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Fetch node properties from Figma.
   */
  async fetchNodeProperties(fileKey: string, nodeId: string): Promise<FigmaNodeData> {
    const token = this.getToken();
    const encodedNodeId = encodeURIComponent(nodeId);

    const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodedNodeId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Figma nodes API returned ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { nodes: Record<string, FigmaNodeData> };
    const nodeData = data.nodes[nodeId];

    if (!nodeData) {
      throw new Error(`Node ${nodeId} not found in Figma response`);
    }

    return nodeData;
  }

  // -------------------------------------------------------------------------
  // Constraint extraction
  // -------------------------------------------------------------------------

  /**
   * Extract structured design constraints from Figma node data.
   */
  extractConstraints(nodeData: FigmaNodeData, label: string): DesignConstraints {
    const doc = nodeData.document;
    const bbox = doc.absoluteBoundingBox ?? { width: 0, height: 0 };

    const colors: DesignConstraints['colors'] = [];
    if (doc.fills) {
      for (const fill of doc.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          colors.push({
            role: 'background',
            rgba: [
              Math.round(fill.color.r * 255),
              Math.round(fill.color.g * 255),
              Math.round(fill.color.b * 255),
              fill.color.a,
            ],
          });
        }
      }
    }

    const typography: DesignConstraints['typography'] = [];
    if (doc.style) {
      typography.push({
        role: 'text',
        fontFamily: doc.style.fontFamily ?? 'unknown',
        fontSize: doc.style.fontSize ?? 0,
        fontWeight: doc.style.fontWeight ?? 400,
        lineHeight: doc.style.lineHeightPx ?? 0,
        letterSpacing: doc.style.letterSpacing ?? 0,
      });
    }

    const children: DesignConstraints['children'] = [];
    if (doc.children) {
      for (const child of doc.children) {
        children.push({
          name: child.name,
          type: child.type,
        });
      }
    }

    return {
      nodeId: doc.id,
      label,
      dimensions: {
        width: bbox.width,
        height: bbox.height,
        cornerRadius: doc.cornerRadius ?? 0,
      },
      layout: {
        mode: doc.layoutMode ?? 'NONE',
        padding: {
          top: doc.paddingTop ?? 0,
          right: doc.paddingRight ?? 0,
          bottom: doc.paddingBottom ?? 0,
          left: doc.paddingLeft ?? 0,
        },
        gap: doc.itemSpacing ?? 0,
        primaryAlign: doc.primaryAxisAlignItems ?? 'MIN',
        counterAlign: doc.counterAxisAlignItems ?? 'MIN',
      },
      colors,
      typography,
      children,
    };
  }

  // -------------------------------------------------------------------------
  // Design context generation
  // -------------------------------------------------------------------------

  /**
   * Generate a human-readable design context markdown summary.
   */
  generateDesignContext(allConstraints: DesignConstraints[]): string {
    const lines: string[] = [];

    for (const c of allConstraints) {
      lines.push(`# Design Context: ${c.label}\n`);

      lines.push('## Layout');
      lines.push(
        `- Direction: ${c.layout.mode === 'HORIZONTAL' ? 'Horizontal (row)' : c.layout.mode === 'VERTICAL' ? 'Vertical (column)' : c.layout.mode}`,
      );
      lines.push(
        `- Padding: ${c.layout.padding.top}px ${c.layout.padding.right}px ${c.layout.padding.bottom}px ${c.layout.padding.left}px`,
      );
      lines.push(`- Gap between items: ${c.layout.gap}px\n`);

      lines.push('## Dimensions');
      lines.push(`- Width: ${c.dimensions.width}px`);
      lines.push(`- Height: ${c.dimensions.height}px`);
      if (c.dimensions.cornerRadius > 0) {
        lines.push(`- Border radius: ${c.dimensions.cornerRadius}px`);
      }
      lines.push('');

      if (c.colors.length > 0) {
        lines.push('## Colors');
        lines.push('| Role | Value | CSS Variable |');
        lines.push('|------|-------|-------------|');
        for (const color of c.colors) {
          const hex = `#${color.rgba
            .slice(0, 3)
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`;
          lines.push(`| ${color.role} | ${hex} | ${color.cssVar ?? '—'} |`);
        }
        lines.push('');
      }

      if (c.typography.length > 0) {
        lines.push('## Typography');
        lines.push('| Role | Font | Size | Weight | Line Height |');
        lines.push('|------|------|------|--------|-------------|');
        for (const t of c.typography) {
          lines.push(
            `| ${t.role} | ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} | ${t.lineHeight}px |`,
          );
        }
        lines.push('');
      }

      if (c.children.length > 0) {
        lines.push('## Key Components');
        for (const child of c.children) {
          lines.push(`- ${child.name} (${child.type})`);
        }
        lines.push('');
      }

      lines.push('---\n');
    }

    return lines.join('\n');
  }
}
