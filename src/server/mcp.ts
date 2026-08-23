import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { IndexerWorker } from '../indexer/worker.js';
import { FileWatcher } from '../indexer/watcher.js';
import { CodeSearchConfig } from '../types.js';

export async function createMcpServer(config: CodeSearchConfig): Promise<{
  server: Server;
  worker: IndexerWorker;
  watcher: FileWatcher;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  const worker = new IndexerWorker(config);
  await worker.init();

  const watcher = new FileWatcher(config, worker);

  const server = new Server(
    {
      name: 'code-search-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'code_search',
          description:
            'Search the codebase semantically using natural language queries (e.g. "how is payment verified", "user authentication flow"). Returns relevant code snippets with file paths and line numbers. If indexing is currently in progress, results are returned from currently indexed files alongside progress status.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The natural language semantic search query'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'code_search_status',
          description:
            'Get the current indexing status, progress percentage, total files, and indexed chunk count.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'code_search_reindex',
          description:
            'Trigger a background re-index of the repository. Can be used to force a full reindex.',
          inputSchema: {
            type: 'object',
            properties: {
              forceFull: {
                type: 'boolean',
                description: 'If true, clears existing vector database and rebuilds index from scratch'
              }
            }
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'code_search') {
      const query = (args?.query as string) || '';
      const limit = typeof args?.limit === 'number' ? args.limit : 10;

      if (!query.trim()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Search query cannot be empty.'
            }
          ]
        };
      }

      const res = await worker.query(query, limit);
      return {
        content: [
          {
            type: 'text',
            text: res.formattedOutput
          }
        ]
      };
    }

    if (name === 'code_search_status') {
      const status = worker.getStatus();
      const text = [
        `Index Status: ${status.state.toUpperCase()}`,
        `Progress: ${status.progressPercentage}%`,
        `Files: ${status.indexedFiles} / ${status.totalFiles} indexed`,
        `Chunks: ${status.indexedChunks} code chunks in LanceDB`,
        status.currentFile ? `Currently indexing: ${status.currentFile}` : null,
        status.lastIndexedAt ? `Last completed: ${new Date(status.lastIndexedAt).toLocaleTimeString()}` : null,
        status.error ? `Error: ${status.error}` : null
      ]
        .filter(Boolean)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text
          }
        ]
      };
    }

    if (name === 'code_search_reindex') {
      const forceFull = Boolean(args?.forceFull);
      // Run in background without blocking tool response
      worker.startIndexing(forceFull).catch((err) => {
        console.error('[code-search-mcp] Reindex error:', err);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Indexing started in background (forceFull: ${forceFull}). Use code_search_status to monitor progress.`
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const start = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Start background file watcher
    await watcher.start();

    // Start initial background indexing
    worker.startIndexing().catch((err) => {
      console.error('[code-search-mcp] Initial background index failed:', err);
    });
  };

  const stop = async () => {
    await watcher.stop();
    await server.close();
  };

  return {
    server,
    worker,
    watcher,
    start,
    stop
  };
}
