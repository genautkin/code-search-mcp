#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { findProjectRoot, loadConfig } from '../src/config/loader.js';
import { createMcpServer } from '../src/server/mcp.js';

const program = new Command();

program
  .name('code-search-mcp')
  .description('Zero-daemon local semantic code search MCP server')
  .version('0.1.0')
  .option('-p, --path <path>', 'Project root directory to index and search')
  .option('-m, --model <model>', 'Embedding model (default: Xenova/all-MiniLM-L6-v2)')
  .action(async (options) => {
    try {
      const targetDir = options.path ? path.resolve(options.path) : findProjectRoot(process.cwd());
      const config = loadConfig(targetDir);

      if (options.model) {
        config.embeddingModel = options.model;
      }

      // Output diagnostic info to stderr (stdio stdout is reserved for MCP protocol)
      process.stderr.write(`[code-search-mcp] Initializing in: ${config.projectRoot}\n`);
      process.stderr.write(`[code-search-mcp] Database path: ${config.dbPath}\n`);

      const { start, stop } = await createMcpServer(config);

      const handleExit = async () => {
        try {
          await stop();
        } finally {
          process.exit(0);
        }
      };

      process.on('SIGINT', handleExit);
      process.on('SIGTERM', handleExit);

      await start();
      process.stderr.write(`[code-search-mcp] MCP Server running on stdio.\n`);
    } catch (err) {
      process.stderr.write(`[code-search-mcp] Fatal error: ${err}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
