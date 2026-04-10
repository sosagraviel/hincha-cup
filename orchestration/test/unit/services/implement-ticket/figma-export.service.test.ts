import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FigmaExportService } from '../../../../src/services/implement-ticket/figma-export.service.js';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('FigmaExportService', () => {
  let service: FigmaExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FigmaExportService('/project', '/output');
  });

  afterEach(() => {
    delete process.env.FIGMA_ACCESS_TOKEN;
  });

  // -----------------------------------------------------------------------
  // Access status
  // -----------------------------------------------------------------------

  describe('getAccessStatus', () => {
    it('returns "mcp" when Figma MCP configured', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: { 'figma-mcp': { command: 'npx figma-mcp' } },
        }),
      );
      const status = await service.getAccessStatus();
      expect(status).toBe('mcp');
    });

    it('returns "token" when FIGMA_ACCESS_TOKEN set', async () => {
      mockedExistsSync.mockReturnValue(false); // no MCP config
      process.env.FIGMA_ACCESS_TOKEN = 'figd_test_token';
      const status = await service.getAccessStatus();
      expect(status).toBe('token');
    });

    it('returns "none" when neither available', async () => {
      mockedExistsSync.mockReturnValue(false);
      const status = await service.getAccessStatus();
      expect(status).toBe('none');
    });

    it('returns "none" when MCP config has no Figma server', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: { 'other-mcp': { command: 'npx other' } },
        }),
      );
      const status = await service.getAccessStatus();
      expect(status).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // fetchDesignContext
  // -----------------------------------------------------------------------

  describe('fetchDesignContext', () => {
    it('returns error when no access available', async () => {
      mockedExistsSync.mockReturnValue(false);
      const result = await service.fetchDesignContext('fileKey', ['1-2']);
      expect(result.success).toBe(false);
      expect(result.accessMethod).toBe('none');
      expect(result.error).toContain('No Figma access available');
    });

    it('returns mcp error when Figma MCP is configured', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: { 'figma-mcp': { command: 'npx figma-mcp' } },
        }),
      );
      const result = await service.fetchDesignContext('fileKey', ['1-2']);
      expect(result.success).toBe(false);
      expect(result.accessMethod).toBe('mcp');
      expect(result.images).toHaveLength(0);
      expect(result.constraints).toHaveLength(0);
      expect(result.error).toContain('figma-design-fetcher skill');
    });

    it('fetches images and constraints via token', async () => {
      mockedExistsSync.mockReturnValue(false);
      process.env.FIGMA_ACCESS_TOKEN = 'figd_test';

      const constraintsData = {
        nodeId: '1-2',
        label: 'dashboard',
        dimensions: { width: 1440, height: 900, cornerRadius: 0 },
        layout: {
          mode: 'VERTICAL',
          padding: { top: 24, right: 32, bottom: 24, left: 32 },
          gap: 16,
          primaryAlign: 'MIN',
          counterAlign: 'MIN',
        },
        colors: [{ role: 'background', rgba: [255, 255, 255, 1] }],
        typography: [],
        children: [{ name: 'Header', type: 'FRAME' }],
      };

      // readFileSync will be called to re-read constraints for design-context generation
      mockedReadFileSync.mockReturnValue(JSON.stringify(constraintsData));

      // Mock image meta response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ images: { '1-2': 'https://figma-image.url/img.png' } }),
        })
        // Mock image download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8),
        })
        // Mock node properties
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nodes: {
              '1-2': {
                document: {
                  id: '1-2',
                  name: 'Frame',
                  type: 'FRAME',
                  absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
                  layoutMode: 'VERTICAL',
                  paddingTop: 24,
                  paddingRight: 32,
                  paddingBottom: 24,
                  paddingLeft: 32,
                  itemSpacing: 16,
                  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
                  children: [{ id: '1-3', name: 'Header', type: 'FRAME' }],
                },
              },
            },
          }),
        });

      const result = await service.fetchDesignContext('fileKey', ['1-2'], ['dashboard']);
      expect(result.success).toBe(true);
      expect(result.accessMethod).toBe('token');
      expect(result.images).toHaveLength(1);
      expect(result.constraints).toHaveLength(1);
      expect(result.designContextPath).toBeDefined();
      expect(mockedWriteFileSync).toHaveBeenCalled();
    });

    it('handles Figma API error gracefully', async () => {
      mockedExistsSync.mockReturnValue(false);
      process.env.FIGMA_ACCESS_TOKEN = 'figd_test';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const result = await service.fetchDesignContext('fileKey', ['1-2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  // -----------------------------------------------------------------------
  // extractConstraints
  // -----------------------------------------------------------------------

  describe('extractConstraints', () => {
    it('extracts layout, dimensions, colors, and children', () => {
      const nodeData = {
        document: {
          id: '1-2',
          name: 'Frame',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
          cornerRadius: 8,
          layoutMode: 'HORIZONTAL',
          paddingTop: 16,
          paddingRight: 24,
          paddingBottom: 16,
          paddingLeft: 24,
          itemSpacing: 12,
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
          style: {
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: 600,
            lineHeightPx: 24,
            letterSpacing: 0,
          },
          children: [
            { id: '1-3', name: 'Title', type: 'TEXT' },
            { id: '1-4', name: 'Icon', type: 'INSTANCE' },
          ],
        },
      };

      const result = service.extractConstraints(nodeData, 'test-frame');
      expect(result.dimensions.width).toBe(1440);
      expect(result.dimensions.height).toBe(900);
      expect(result.dimensions.cornerRadius).toBe(8);
      expect(result.layout.mode).toBe('HORIZONTAL');
      expect(result.layout.padding.top).toBe(16);
      expect(result.layout.gap).toBe(12);
      expect(result.colors).toHaveLength(1);
      expect(result.colors[0].rgba[0]).toBe(26); // 0.1 * 255 ≈ 26
      expect(result.typography).toHaveLength(1);
      expect(result.typography[0].fontFamily).toBe('Inter');
      expect(result.children).toHaveLength(2);
    });

    it('handles missing optional fields', () => {
      const nodeData = {
        document: {
          id: '1-2',
          name: 'Frame',
          type: 'FRAME',
        },
      };

      const result = service.extractConstraints(nodeData, 'empty-frame');
      expect(result.dimensions.width).toBe(0);
      expect(result.layout.mode).toBe('NONE');
      expect(result.colors).toHaveLength(0);
      expect(result.typography).toHaveLength(0);
      expect(result.children).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateDesignContext
  // -----------------------------------------------------------------------

  describe('generateDesignContext', () => {
    it('generates markdown with layout, colors, and typography', () => {
      const constraints = [
        {
          nodeId: '1-2',
          label: 'Dashboard',
          dimensions: { width: 1440, height: 900, cornerRadius: 0 },
          layout: {
            mode: 'VERTICAL',
            padding: { top: 24, right: 32, bottom: 24, left: 32 },
            gap: 16,
            primaryAlign: 'MIN',
            counterAlign: 'MIN',
          },
          colors: [
            { role: 'background', rgba: [255, 255, 255, 1] as [number, number, number, number] },
          ],
          typography: [
            {
              role: 'heading',
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 32,
              letterSpacing: 0,
            },
          ],
          children: [{ name: 'Header', type: 'FRAME' }],
        },
      ];

      const md = service.generateDesignContext(constraints);
      expect(md).toContain('# Design Context: Dashboard');
      expect(md).toContain('Vertical (column)');
      expect(md).toContain('24px 32px 24px 32px');
      expect(md).toContain('16px');
      expect(md).toContain('#ffffff');
      expect(md).toContain('Inter');
      expect(md).toContain('Header (FRAME)');
    });
  });
});
