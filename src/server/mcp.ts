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
            'Search the codebase semantically using natural language queries (e.g. "how is payment verified", "calculate discount rate"). Returns relevant code snippets with file paths and line numbers. Supports filtering by directory path, programming language, or codeOnly (to exclude markdown docs).',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The natural language or identifier search query'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)'
              },
              pathFilter: {
                type: 'string',
                description: 'Optional directory or file path substring to restrict search (e.g. "src/auth", "src/billing")'
              },
              language: {
                type: 'string',
                description: 'Optional programming language filter (e.g. "typescript", "javascript", "vue")'
              },
              codeOnly: {
                type: 'boolean',
                description: 'If true, excludes markdown documentation files (.md) to prioritize actual code formulas and logic'
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
        },
        {
          name: 'code_search_guide',
          description:
            'Get best practices and usage instructions for AI agents on how and when to use code_search.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'code_search_guide') {
      const guideText = `# Semantic Code Search — AI Agent Guide

## When to Use \`code_search\`:
- Use \`code_search\` FIRST whenever looking for features, domain logic, workflows, UI components, or concepts described in natural language (e.g. "where are authentication tokens refreshed", "shopping cart discount formula", "dark mode toggle component").
- Use \`code_search\` when you DO NOT know the exact variable or function name.

## Filtering Options:
- **\`codeOnly: true\`**: Exclude markdown specs/guides to find pure code calculation implementations directly.
- **\`pathFilter\`**: Restrict search to specific feature areas (e.g. \`pathFilter: "src/auth"\` or \`pathFilter: "src/billing"\`).
- **\`language\`**: Restrict results by language (e.g. \`language: "typescript"\`, \`"vue"\`, \`"javascript"\`).

## How to Configure Ignore / Exclusions:
To exclude files, directories, or assets from being indexed in this repository:

1. **\`.codesearchignore\` (Recommended for search exclusions)**:
   Create a \`.codesearchignore\` file in the project root with glob patterns (standard gitignore syntax):
   \`\`\`gitignore
   # Ignore assets and fixtures
   src/assets/**
   tests/fixtures/**
   legacy/**
   *.spec.ts
   \`\`\`

2. **\`.gitignore\` & \`.ignore\`**:
   Any patterns in \`.gitignore\` or \`.ignore\` in the project root are automatically honored.

3. **\`.codesearchrc.json\` (Full repository configuration)**:
   Create a \`.codesearchrc.json\` file in the project root:
   \`\`\`json
   {
     "customExcludes": ["src/assets/**", "fixtures/**"],
     "supportedExtensions": [".ts", ".tsx", ".js", ".vue"],
     "maxFileSizeKb": 500
   }
   \`\`\`

*Note: After adding or changing ignore rules, run \`code_search_reindex({ forceFull: true })\` to rebuild the index.*

## When to Use Other Tools Instead:
- Use **CodeGraph (\`codegraph_explore\`)** when navigating a known symbol's references, call hierarchy, or type definitions.
- Use **grep** when searching for an exact literal string constant, error code, or exact CSS class name.`;

      return {
        content: [
          {
            type: 'text',
            text: guideText
          }
        ]
      };
    }

    if (name === 'code_search') {
      const query = (args?.query as string) || '';
      const limit = typeof args?.limit === 'number' ? args.limit : 10;
      const pathFilter = typeof args?.pathFilter === 'string' ? args.pathFilter : undefined;
      const language = typeof args?.language === 'string' ? args.language : undefined;
      const codeOnly = typeof args?.codeOnly === 'boolean' ? args.codeOnly : undefined;

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

      const res = await worker.query(query, {
        limit,
        pathFilter,
        language,
        codeOnly
      });

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
