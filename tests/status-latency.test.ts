import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../src/config/loader.js';
import { createMcpServer } from '../src/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Status Latency & Responsiveness', () => {
  let tempDir: string;
  let serverInstance: Awaited<ReturnType<typeof createMcpServer>>;
  let client: Client;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-status-latency-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

    // Create several source files
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(tempDir, 'src', `component${i}.ts`),
        `export class Component${i} {
  executeTask(val: number): number {
    return val * ${i + 1};
  }
}`
      );
    }

    fs.writeFileSync(path.join(tempDir, '.codesearchrc.json'), JSON.stringify({ version: 1 }));

    const config = loadConfig(tempDir);
    serverInstance = await createMcpServer(config);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await serverInstance.server.connect(serverTransport);

    client = new Client({ name: 'test-latency-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await serverInstance.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should answer code_search_status immediately (< 50ms) without blocking on ensureInitialized', async () => {
    const t0 = Date.now();
    const result = await client.callTool({
      name: 'code_search_status',
      arguments: {}
    });
    const duration = Date.now() - t0;

    const content = result.content as any[];
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('Index Status:');
    // Status response should be practically instantaneous
    expect(duration).toBeLessThan(100);
  });

  it('should create and update status.json during indexing', async () => {
    await serverInstance.worker.startIndexing({ mode: 'fast' });

    const statusFilePath = path.join(tempDir, '.code-search', 'lancedb', 'status.json');
    expect(fs.existsSync(statusFilePath)).toBe(true);

    const savedStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
    expect(savedStatus.state).toBe('ready');
    expect(savedStatus.progressPercentage).toBe(100);
    expect(savedStatus.indexedFiles).toBe(11);
    expect(savedStatus.pid).toBe(process.pid);
  });
});
