#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../src/config/loader.js';
import { createMcpServer } from '../src/server/mcp.js';
import { logger } from '../src/logger.js';
import { runInit } from '../src/cli/init.js';
import { runUninit } from '../src/cli/uninit.js';
import { runStatus } from '../src/cli/status.js';
import { runIndexCmd } from '../src/cli/index-cmd.js';
import { runSearch } from '../src/cli/search.js';

const program = new Command();

program
  .name('code-search-mcp')
  .description('Zero-daemon local semantic code search MCP server and CLI')
  .version('0.1.0');

// Subcommand: init
program
  .command('init [path]')
  .description('Initialize code-search in a project with an interactive setup wizard')
  .option('-y, --yes', 'Skip interactive questions and use smart defaults', false)
  .option('--clean', 'Clean existing index before initializing', false)
  .option('--no-index', 'Skip initial indexing after creating configuration', false)
  .action(async (targetPath, options) => {
    try {
      await runInit({
        projectRoot: targetPath,
        yes: options.yes,
        clean: options.clean,
        skipIndex: !options.index
      });
    } catch (err: any) {
      console.error(`\n❌ Error initializing project: ${err?.message || err}\n`);
      process.exit(1);
    }
  });

// Subcommand: uninit
program
  .command('uninit [path]')
  .description('Remove code-search configuration (.codesearchrc.json, .codesearchignore) and delete local vector index')
  .action(async (targetPath) => {
    try {
      const res = await runUninit(targetPath);
      console.log('\n🧹 Removed code-search configuration and index files:');
      for (const p of res.removedPaths) {
        console.log(`  - ${p}`);
      }
      console.log('✅ Project uninitialized successfully.\n');
    } catch (err: any) {
      console.error(`\n❌ Error uninitializing project: ${err?.message || err}\n`);
      process.exit(1);
    }
  });

// Subcommand: status
program
  .command('status [path]')
  .description('Show index health, file counts, and vector store statistics')
  .action(async (targetPath) => {
    try {
      const res = await runStatus(targetPath);
      if (!res.initialized) {
        console.log(`\nℹ️ Project at ${res.projectRoot} is not initialized.`);
        console.log(`Run 'code-search-mcp init' to set up semantic search for this project.\n`);
        return;
      }
      console.log(`\n📊 code-search Status (${res.projectRoot}):`);
      console.log(`  Index State: ${res.status?.state.toUpperCase()}`);
      console.log(`  Indexed Files: ${res.status?.indexedFiles} / ${res.status?.totalFiles}`);
      console.log(`  Indexed Chunks: ${res.status?.indexedChunks} vectors in LanceDB`);
      console.log(`  Database Path: ${res.config?.dbPath}`);
      console.log(`  Embedding Model: ${res.config?.embeddingModel}`);
      console.log(`  Respect .gitignore: ${res.config?.respectGitignore ? 'Yes' : 'No'}`);
      console.log(`  Supported Extensions: ${res.config?.supportedExtensions.join(', ')}\n`);
    } catch (err: any) {
      console.error(`\n❌ Error getting status: ${err?.message || err}\n`);
      process.exit(1);
    }
  });

// Subcommand: index
program
  .command('index [path]')
  .description('Rebuild or update the search index for an initialized project')
  .option('-f, --force', 'Force full reindex from scratch', false)
  .action(async (targetPath, options) => {
    try {
      console.log('\n🚀 Starting search indexing...');
      const res = await runIndexCmd({
        projectRoot: targetPath,
        forceFull: options.force,
        onProgress: (status) => {
          if (status.state === 'scanning') {
            process.stdout.write(`\r🔍 Scanning project files...`);
          } else if (status.state === 'indexing') {
            const current = status.currentFile ? ` (${status.currentFile})` : '';
            process.stdout.write(
              `\r⚡️ Indexing: ${status.indexedFiles}/${status.totalFiles} files (${status.progressPercentage}%)${current}   `
            );
          }
        }
      });
      process.stdout.write('\r\x1b[K'); // Clear line

      console.log(`\n✨ Indexing completed successfully!`);
      console.log(`📊 Index Summary:`);
      console.log(`  State: ${res.status.state.toUpperCase()}`);
      console.log(`  Indexed Files: ${res.status.indexedFiles} / ${res.status.totalFiles}`);
      console.log(`  Indexed Chunks: ${res.status.indexedChunks} vectors in LanceDB`);
      console.log(`  Database Path: ${res.config.dbPath}`);
      console.log(`  Embedding Model: ${res.config.embeddingModel}\n`);
    } catch (err: any) {
      console.error(`\n❌ Error indexing project: ${err?.message || err}\n`);
      process.exit(1);
    }
  });

// Subcommand: search
program
  .command('search <query>')
  .description('Execute a semantic search query directly in the terminal')
  .option('-p, --path <path>', 'Project root directory to search')
  .option('-l, --limit <limit>', 'Max number of results to return', '10')
  .option('--path-filter <filter>', 'Path substring filter')
  .option('--lang <language>', 'Language filter')
  .option('--code-only', 'Exclude markdown documentation', false)
  .action(async (query, options) => {
    try {
      const res = await runSearch(query, {
        projectRoot: options.path,
        limit: parseInt(options.limit, 10) || 10,
        pathFilter: options.pathFilter,
        language: options.lang,
        codeOnly: options.codeOnly
      });
      console.log('\n' + res.formattedOutput + '\n');
    } catch (err: any) {
      console.error(`\n❌ Error searching project: ${err?.message || err}\n`);
      process.exit(1);
    }
  });

// Default action / MCP server mode (when invoked with no subcommand or with -p / -m flags)
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception in code-search-mcp process', { error: String(err), stack: err?.stack });
  process.stderr.write(`[code-search-mcp] Uncaught exception: ${err}\n`);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in code-search-mcp process', { reason: String(reason) });
  process.stderr.write(`[code-search-mcp] Unhandled rejection: ${reason}\n`);
});

program
  .option('-p, --path <path>', 'Project root directory to index and search')
  .option('-m, --model <model>', 'Embedding model (default: Xenova/all-MiniLM-L6-v2)')
  .action(async (options) => {
    try {
      const targetDir = options.path ? path.resolve(options.path) : findProjectRoot(process.cwd());
      const config = loadConfig(targetDir);

      if (options.model) {
        config.embeddingModel = options.model;
      }

      // Initialize persistent file logger
      logger.init(path.dirname(config.dbPath));
      logger.info('Starting code-search-mcp session', {
        projectRoot: config.projectRoot,
        dbPath: config.dbPath,
        model: config.embeddingModel,
        pid: process.pid
      });

      // Output diagnostic info to stderr (stdio stdout is reserved for MCP protocol)
      process.stderr.write(`[code-search-mcp] Initializing in: ${config.projectRoot}\n`);
      process.stderr.write(`[code-search-mcp] Database path: ${config.dbPath}\n`);

      const { start, stop } = await createMcpServer(config);

      let isExiting = false;
      const handleExit = async () => {
        if (isExiting) return;
        isExiting = true;
        try {
          logger.info('Stopping code-search-mcp session', { pid: process.pid });
          await stop();
        } catch {}
        process.exit(0);
      };

      process.on('SIGINT', handleExit);
      process.on('SIGTERM', handleExit);

      await start();
      logger.info('MCP Server started on stdio');
      process.stderr.write(`[code-search-mcp] MCP Server running on stdio.\n`);
    } catch (err) {
      logger.error('Fatal startup error', { error: String(err) });
      process.stderr.write(`[code-search-mcp] Fatal error: ${err}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
