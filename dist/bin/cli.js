#!/usr/bin/env node
import {
  IndexerWorker,
  createMcpServer,
  findProjectRoot,
  isProjectInitialized,
  loadConfig,
  runInit
} from "../chunk-W6UCGGNB.js";

// bin/cli.ts
import { Command } from "commander";
import * as path6 from "path";

// src/logger.ts
import * as fs from "fs";
import * as path from "path";
var Logger = class _Logger {
  static instance = null;
  logFilePath = null;
  maxSizeBytes = 2 * 1024 * 1024;
  // 2 MB rotating limit
  constructor() {
  }
  static getInstance() {
    if (!_Logger.instance) {
      _Logger.instance = new _Logger();
    }
    return _Logger.instance;
  }
  init(baseDir) {
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.logFilePath = path.join(baseDir, "code-search.log");
      this.info("Logger initialized", { logFilePath: this.logFilePath });
    } catch {
    }
  }
  info(message, meta) {
    this.write("INFO", message, meta);
  }
  warn(message, meta) {
    this.write("WARN", message, meta);
  }
  error(message, meta) {
    this.write("ERROR", message, meta);
  }
  debug(message, meta) {
    this.write("DEBUG", message, meta);
  }
  getLogPath() {
    return this.logFilePath;
  }
  write(level, message, meta) {
    if (!this.logFilePath) return;
    try {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      const line = `[${timestamp}] [${level}] ${message}${metaStr}
`;
      if (fs.existsSync(this.logFilePath)) {
        const stat = fs.statSync(this.logFilePath);
        if (stat.size > this.maxSizeBytes) {
          const oldPath = `${this.logFilePath}.1`;
          try {
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            fs.renameSync(this.logFilePath, oldPath);
          } catch {
          }
        }
      }
      fs.appendFileSync(this.logFilePath, line, "utf8");
    } catch {
    }
  }
};
var logger = Logger.getInstance();

// src/cli/uninit.ts
import * as fs2 from "fs";
import * as path2 from "path";
async function runUninit(projectRoot) {
  const targetDir = projectRoot ? path2.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs2.realpathSync(targetDir);
  } catch {
  }
  const removedPaths = [];
  let dbPath;
  try {
    const config = loadConfig(canonicalRoot);
    dbPath = config.dbPath;
  } catch {
  }
  const rcPath = path2.join(canonicalRoot, ".codesearchrc.json");
  if (fs2.existsSync(rcPath)) {
    try {
      fs2.unlinkSync(rcPath);
      removedPaths.push(rcPath);
    } catch {
    }
  }
  const ignorePath = path2.join(canonicalRoot, ".codesearchignore");
  if (fs2.existsSync(ignorePath)) {
    try {
      fs2.unlinkSync(ignorePath);
      removedPaths.push(ignorePath);
    } catch {
    }
  }
  const dotFolder = path2.join(canonicalRoot, ".code-search");
  if (fs2.existsSync(dotFolder)) {
    try {
      fs2.rmSync(dotFolder, { recursive: true, force: true });
      removedPaths.push(dotFolder);
    } catch {
    }
  }
  if (dbPath && fs2.existsSync(dbPath) && !dbPath.includes(".code-search")) {
    try {
      fs2.rmSync(dbPath, { recursive: true, force: true });
      removedPaths.push(dbPath);
    } catch {
    }
  }
  return {
    success: true,
    removedPaths
  };
}

// src/cli/status.ts
import * as path3 from "path";
import * as fs3 from "fs";
async function runStatus(projectRoot) {
  const targetDir = projectRoot ? path3.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs3.realpathSync(targetDir);
  } catch {
  }
  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    return {
      initialized: false,
      projectRoot: canonicalRoot
    };
  }
  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();
  const status = worker.getStatus();
  return {
    initialized: true,
    projectRoot: canonicalRoot,
    config,
    status
  };
}

// src/cli/index-cmd.ts
import * as path4 from "path";
import * as fs4 from "fs";
async function runIndexCmd(options = {}) {
  const targetDir = options.projectRoot ? path4.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs4.realpathSync(targetDir);
  } catch {
  }
  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    throw new Error(`Project at ${canonicalRoot} is not initialized. Run 'code-search-mcp init' first.`);
  }
  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();
  await worker.startIndexing(Boolean(options.forceFull), options.onProgress);
  const status = worker.getStatus();
  return {
    success: true,
    status,
    config
  };
}

// src/cli/search.ts
import * as path5 from "path";
import * as fs5 from "fs";
async function runSearch(query, options = {}) {
  const targetDir = options.projectRoot ? path5.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs5.realpathSync(targetDir);
  } catch {
  }
  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    throw new Error(`Project is not initialized. Run 'code-search init' first.`);
  }
  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();
  return await worker.query(query, options);
}

// bin/cli.ts
var program = new Command();
program.name("code-search-mcp").description("Zero-daemon local semantic code search MCP server and CLI").version("0.1.0");
program.command("init [path]").description("Initialize code-search in a project with an interactive setup wizard").option("-y, --yes", "Skip interactive questions and use smart defaults", false).option("--clean", "Clean existing index before initializing", false).option("--no-index", "Skip initial indexing after creating configuration", false).action(async (targetPath, options) => {
  try {
    await runInit({
      projectRoot: targetPath,
      yes: options.yes,
      clean: options.clean,
      skipIndex: !options.index
    });
  } catch (err) {
    console.error(`
\u274C Error initializing project: ${err?.message || err}
`);
    process.exit(1);
  }
});
program.command("uninit [path]").description("Remove code-search configuration (.codesearchrc.json, .codesearchignore) and delete local vector index").action(async (targetPath) => {
  try {
    const res = await runUninit(targetPath);
    console.log("\n\u{1F9F9} Removed code-search configuration and index files:");
    for (const p of res.removedPaths) {
      console.log(`  - ${p}`);
    }
    console.log("\u2705 Project uninitialized successfully.\n");
  } catch (err) {
    console.error(`
\u274C Error uninitializing project: ${err?.message || err}
`);
    process.exit(1);
  }
});
program.command("status [path]").description("Show index health, file counts, and vector store statistics").action(async (targetPath) => {
  try {
    const res = await runStatus(targetPath);
    if (!res.initialized) {
      console.log(`
\u2139\uFE0F Project at ${res.projectRoot} is not initialized.`);
      console.log(`Run 'code-search-mcp init' to set up semantic search for this project.
`);
      return;
    }
    console.log(`
\u{1F4CA} code-search Status (${res.projectRoot}):`);
    console.log(`  Index State: ${res.status?.state.toUpperCase()}`);
    console.log(`  Indexed Files: ${res.status?.indexedFiles} / ${res.status?.totalFiles}`);
    console.log(`  Indexed Chunks: ${res.status?.indexedChunks} vectors in LanceDB`);
    console.log(`  Database Path: ${res.config?.dbPath}`);
    console.log(`  Embedding Model: ${res.config?.embeddingModel}`);
    console.log(`  Respect .gitignore: ${res.config?.respectGitignore ? "Yes" : "No"}`);
    console.log(`  Supported Extensions: ${res.config?.supportedExtensions.join(", ")}
`);
  } catch (err) {
    console.error(`
\u274C Error getting status: ${err?.message || err}
`);
    process.exit(1);
  }
});
program.command("index [path]").description("Rebuild or update the search index for an initialized project").option("-f, --force", "Force full reindex from scratch", false).action(async (targetPath, options) => {
  try {
    console.log("\n\u{1F680} Starting search indexing...");
    const res = await runIndexCmd({
      projectRoot: targetPath,
      forceFull: options.force,
      onProgress: (status) => {
        if (status.state === "scanning") {
          process.stdout.write(`\r\u{1F50D} Scanning project files...`);
        } else if (status.state === "indexing") {
          const current = status.currentFile ? ` (${status.currentFile})` : "";
          process.stdout.write(
            `\r\u26A1\uFE0F Indexing: ${status.indexedFiles}/${status.totalFiles} files (${status.progressPercentage}%)${current}   `
          );
        }
      }
    });
    process.stdout.write("\r\x1B[K");
    console.log(`
\u2728 Indexing completed successfully!`);
    console.log(`\u{1F4CA} Index Summary:`);
    console.log(`  State: ${res.status.state.toUpperCase()}`);
    console.log(`  Indexed Files: ${res.status.indexedFiles} / ${res.status.totalFiles}`);
    console.log(`  Indexed Chunks: ${res.status.indexedChunks} vectors in LanceDB`);
    console.log(`  Database Path: ${res.config.dbPath}`);
    console.log(`  Embedding Model: ${res.config.embeddingModel}
`);
  } catch (err) {
    console.error(`
\u274C Error indexing project: ${err?.message || err}
`);
    process.exit(1);
  }
});
program.command("search <query>").description("Execute a semantic search query directly in the terminal").option("-p, --path <path>", "Project root directory to search").option("-l, --limit <limit>", "Max number of results to return", "10").option("--path-filter <filter>", "Path substring filter").option("--lang <language>", "Language filter").option("--code-only", "Exclude markdown documentation", false).action(async (query, options) => {
  try {
    const res = await runSearch(query, {
      projectRoot: options.path,
      limit: parseInt(options.limit, 10) || 10,
      pathFilter: options.pathFilter,
      language: options.lang,
      codeOnly: options.codeOnly
    });
    console.log("\n" + res.formattedOutput + "\n");
  } catch (err) {
    console.error(`
\u274C Error searching project: ${err?.message || err}
`);
    process.exit(1);
  }
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception in code-search-mcp process", { error: String(err), stack: err?.stack });
  process.stderr.write(`[code-search-mcp] Uncaught exception: ${err}
`);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection in code-search-mcp process", { reason: String(reason) });
  process.stderr.write(`[code-search-mcp] Unhandled rejection: ${reason}
`);
});
program.option("-p, --path <path>", "Project root directory to index and search").option("-m, --model <model>", "Embedding model (default: Xenova/all-MiniLM-L6-v2)").action(async (options) => {
  try {
    const targetDir = options.path ? path6.resolve(options.path) : findProjectRoot(process.cwd());
    const config = loadConfig(targetDir);
    if (options.model) {
      config.embeddingModel = options.model;
    }
    logger.init(path6.dirname(config.dbPath));
    logger.info("Starting code-search-mcp session", {
      projectRoot: config.projectRoot,
      dbPath: config.dbPath,
      model: config.embeddingModel,
      pid: process.pid
    });
    process.stderr.write(`[code-search-mcp] Initializing in: ${config.projectRoot}
`);
    process.stderr.write(`[code-search-mcp] Database path: ${config.dbPath}
`);
    const { start, stop } = await createMcpServer(config);
    let isExiting = false;
    const handleExit = async () => {
      if (isExiting) return;
      isExiting = true;
      try {
        logger.info("Stopping code-search-mcp session", { pid: process.pid });
        await stop();
      } catch {
      }
      process.exit(0);
    };
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
    process.on("SIGHUP", handleExit);
    process.stdin.on("end", handleExit);
    process.stdin.on("close", handleExit);
    await start();
    logger.info("MCP Server started on stdio");
    process.stderr.write(`[code-search-mcp] MCP Server running on stdio.
`);
  } catch (err) {
    logger.error("Fatal startup error", { error: String(err) });
    process.stderr.write(`[code-search-mcp] Fatal error: ${err}
`);
    process.exit(1);
  }
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map