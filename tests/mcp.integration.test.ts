import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../src/config/loader.js';
import { createMcpServer } from '../src/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Server Integration', () => {
  let tempDir: string;
  let serverInstance: Awaited<ReturnType<typeof createMcpServer>>;
  let client: Client;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-integration-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'src', 'billing.ts'),
      `export class SubscriptionManager {
  cancelSubscription(userId: string): void {
    console.log("Canceling billing for", userId);
  }
}`
    );

    const config = loadConfig(tempDir);
    serverInstance = await createMcpServer(config);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await serverInstance.server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    // Run indexing
    await serverInstance.worker.startIndexing();
  });

  afterEach(async () => {
    await client.close();
    await serverInstance.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list code search tools', async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain('code_search');
    expect(toolNames).toContain('code_search_status');
    expect(toolNames).toContain('code_search_reindex');
  });

  it('should call code_search and return semantic matches', async () => {
    const result = await client.callTool({
      name: 'code_search',
      arguments: {
        query: 'how to cancel user billing subscription'
      }
    });

    const content = result.content as any[];
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('src/billing.ts');
    expect(content[0].text).toContain('cancelSubscription');
  }, 30000);

  it('should return status details via code_search_status', async () => {
    const result = await client.callTool({
      name: 'code_search_status',
      arguments: {}
    });

    const content = result.content as any[];
    expect(content[0].text).toContain('Index Status: READY');
    expect(content[0].text).toContain('Progress: 100%');
  });
});
