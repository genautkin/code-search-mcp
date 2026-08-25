import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createMcpServer } from '../../src/server/mcp.js';
import { loadConfig } from '../../src/config/loader.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

describe('MCP Server dormant mode & code_search_init tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codesearch-mcp-dormant-')));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns uninitialized notification when code_search is called on uninitialized repo', async () => {
    const config = loadConfig(tempDir);
    const mcp = await createMcpServer(config);

    // Call code_search handler directly via mcp server or internal handler logic
    // Using callTool pattern
    const handler = (mcp.server as any)._requestHandlers.get('tools/call');
    const res = await handler({
      method: 'tools/call',
      params: {
        name: 'code_search',
        arguments: { query: 'test query' }
      }
    });

    expect(res.content[0].text).toContain('not initialized');
    await mcp.stop();
  });

  it('allows initializing the project via code_search_init tool', async () => {
    fs.writeFileSync(path.join(tempDir, 'demo.ts'), 'export const hello = () => "world";');
    const config = loadConfig(tempDir);
    const mcp = await createMcpServer(config);

    const handler = (mcp.server as any)._requestHandlers.get('tools/call');
    const initRes = await handler({
      method: 'tools/call',
      params: {
        name: 'code_search_init',
        arguments: {}
      }
    });

    expect(initRes.content[0].text).toContain('initialized successfully');
    expect(fs.existsSync(path.join(tempDir, '.codesearchrc.json'))).toBe(true);

    await mcp.stop();
  });
});
