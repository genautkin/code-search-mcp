import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { IndexerWorker } from '../indexer/worker.js';
import { FileWatcher } from '../indexer/watcher.js';
import { CodeSearchConfig } from '../types.js';
import { isProjectInitialized, loadConfig } from '../config/loader.js';
import { runInit } from '../cli/init.js';

export async function createMcpServer(initialConfig: CodeSearchConfig): Promise<{
  server: Server;
  worker: IndexerWorker;
  watcher: FileWatcher;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  let currentConfig = initialConfig;
  let isInit = isProjectInitialized(currentConfig.projectRoot);

  let worker = new IndexerWorker(currentConfig);
  let watcher = new FileWatcher(currentConfig, worker);

  let initPromise: Promise<void> | null = null;
  const ensureInitialized = async (): Promise<void> => {
    if (!initPromise) {
      initPromise = (async () => {
        if (isInit) {
          await worker.init();
        }
      })();
    }
    return initPromise;
  };

  const server = new Server(
    {
      name: 'code-search-mcp',
      version: '0.2.0'
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
          name: 'code_search_init',
          description:
            'Initialize semantic search for the project (creates .codesearchrc.json, .codesearchignore, and builds index).',
          inputSchema: {
            type: 'object',
            properties: {
              indexPath: {
                type: 'string',
                description: 'Optional custom index storage path (default: node_modules/.cache/code-search/lancedb or .code-search/lancedb)'
              },
              respectGitignore: {
                type: 'boolean',
                description: 'Whether to skip files listed in .gitignore (default: true)'
              },
              supportedExtensions: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of file extensions to index (e.g. [".ts", ".tsx", ".py", ".md"])'
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

    if (name === 'code_search_init') {
      await runInit({
        projectRoot: currentConfig.projectRoot,
        yes: true,
        indexPath: typeof args?.indexPath === 'string' ? args.indexPath : undefined,
        respectGitignore: typeof args?.respectGitignore === 'boolean' ? args.respectGitignore : undefined,
        supportedExtensions: Array.isArray(args?.supportedExtensions) ? (args.supportedExtensions as string[]) : undefined,
        skipIndex: false
      });

      // Reload config & worker
      currentConfig = loadConfig(currentConfig.projectRoot);
      isInit = true;
      worker = new IndexerWorker(currentConfig);
      await worker.init();
      watcher = new FileWatcher(currentConfig, worker);
      await watcher.start();

      return {
        content: [
          {
            type: 'text',
            text: `✅ Code search initialized successfully in ${currentConfig.projectRoot}.\nIndex path: ${currentConfig.dbPath}\nInitial indexing completed.`
          }
        ]
      };
    }

    if (name === 'code_search_guide') {
      const guideText = `# Semantic Code Search — AI Agent Guide

## Strongly Recommended Scenarios for \`code_search\`:
- **Natural Language & Conceptual Questions**: When searching for concepts, domain rules, business workflows, UI components, or features (e.g. "where are authentication tokens refreshed", "how is discount calculated", "dark mode toggle component").
- **Exploring Unfamiliar Codebases**: When you do not know the exact file names, functions, or variable names.
- **Finding Meaning Behind Code**: When exact keyword search / grep returns too many noisy results or misses synonyms.

## Helpful Filtering Options:
- **\`codeOnly: true\`**: Exclude markdown documentation (.md) to prioritize pure source code implementations.
- **\`pathFilter\`**: Restrict search to specific feature areas (e.g. \`pathFilter: "src/auth"\` or \`pathFilter: "src/billing"\`).
- **\`language\`**: Restrict results by language (e.g. \`language: "typescript"\`, \`"vue"\`, \`"javascript"\`).

## Initialization:
- If this repository is not initialized, run the \`code_search_init\` tool or ask the user to run \`npx code-search-mcp init\`.`;

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
      if (!isInit) {
        return {
          content: [
            {
              type: 'text',
              text: `ℹ️ Semantic code search is not initialized for this project (${currentConfig.projectRoot}).\n\nTo enable semantic search:\n1. Call the 'code_search_init' tool, OR\n2. Run 'npx code-search-mcp init' in the project root.`
            }
          ]
        };
      }

      await ensureInitialized();

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
      if (!isInit) {
        return {
          content: [
            {
              type: 'text',
              text: `Index Status: UNINITIALIZED\nProject ${currentConfig.projectRoot} is not initialized. Run code_search_init to begin.`
            }
          ]
        };
      }

      await ensureInitialized();
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
      if (!isInit) {
        return {
          content: [
            {
              type: 'text',
              text: `Project is not initialized. Run code_search_init first.`
            }
          ]
        };
      }

      await ensureInitialized();
      const forceFull = Boolean(args?.forceFull);
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

    server.onclose = async () => {
      try {
        await watcher.stop();
      } catch {}
      process.exit(0);
    };

    server.onerror = (err) => {
      // Don't crash on standard pipe disconnects
      if ((err as any)?.code === 'EPIPE' || (err as any)?.code === 'ERR_STREAM_DESTROYED') {
        process.exit(0);
      }
    };

    transport.onclose = async () => {
      try {
        await watcher.stop();
      } catch {}
      process.exit(0);
    };

    transport.onerror = (err) => {
      if ((err as any)?.code === 'EPIPE' || (err as any)?.code === 'ERR_STREAM_DESTROYED') {
        process.exit(0);
      }
    };

    await server.connect(transport);

    if (isInit) {
      // Non-blocking background worker init and file watcher
      void (async () => {
        try {
          await ensureInitialized();
          await watcher.start();
          await worker.startIndexing();
        } catch {}
      })();
    }
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
