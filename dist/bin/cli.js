#!/usr/bin/env node
import {
  DEFAULT_CONFIG,
  DEFAULT_EXTENSIONS,
  IndexerWorker,
  RECOMMENDED_CODESEARCHIGNORE,
  createIgnoreMatcher,
  createMcpServer,
  findProjectRoot,
  isProjectInitialized,
  loadConfig,
  normalizePath
} from "../chunk-MXBAQQHV.js";

// bin/cli.ts
import { Command } from "commander";
import * as path8 from "path";

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

// src/cli/init.ts
import * as fs3 from "fs";
import * as path3 from "path";
import { select, confirm, input } from "@inquirer/prompts";

// src/cli/detector.ts
import * as fs2 from "fs";
import * as path2 from "path";
var KNOWN_CODE_EXTENSIONS = /* @__PURE__ */ new Set([
  ...DEFAULT_EXTENSIONS,
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json5",
  ".jsonc",
  ".env",
  ".dockerfile",
  ".makefile",
  ".tf",
  ".hcl",
  ".zig",
  ".nim",
  ".lua",
  ".perl",
  ".pl",
  ".r",
  ".ex",
  ".exs",
  ".erl",
  ".clj",
  ".lisp"
]);
function detectProjectExtensions(projectRoot, options = {}) {
  const canonicalRoot = path2.resolve(projectRoot);
  const respectGitignore = options.respectGitignore ?? true;
  const maxFiles = options.maxFilesToSample ?? 5e4;
  const matcher = createIgnoreMatcher(canonicalRoot, [], respectGitignore);
  const counts = {};
  let totalFiles = 0;
  function walk(currentDir) {
    if (totalFiles >= maxFiles) return;
    let entries;
    try {
      entries = fs2.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (totalFiles >= maxFiles) break;
      const fullPath = path2.join(currentDir, entry.name);
      const relPath = normalizePath(path2.relative(canonicalRoot, fullPath));
      const isDir = entry.isDirectory();
      if (matcher.ignores(relPath, isDir)) {
        continue;
      }
      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path2.extname(entry.name).toLowerCase();
        if (ext && KNOWN_CODE_EXTENSIONS.has(ext)) {
          counts[ext] = (counts[ext] || 0) + 1;
          totalFiles++;
        }
      }
    }
  }
  walk(canonicalRoot);
  const sortedExtensions = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const finalExtensions = sortedExtensions.length > 0 ? sortedExtensions : DEFAULT_EXTENSIONS;
  return {
    extensions: finalExtensions,
    counts,
    totalFiles
  };
}

// src/cli/init.ts
async function runInit(options = {}) {
  const targetDir = options.projectRoot ? path3.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs3.realpathSync(targetDir);
  } catch {
  }
  const isInteractive = !options.yes;
  const alreadyInitialized = isProjectInitialized(canonicalRoot);
  if (isInteractive) {
    console.log("\n\u{1F50D} code-search-mcp Project Initialization\n");
  }
  let cleanExisting = options.clean ?? false;
  if (alreadyInitialized && isInteractive && !options.clean) {
    cleanExisting = await confirm({
      message: "Existing configuration or index detected. Clean and rebuild from scratch?",
      default: false
    });
  }
  const hasNodeModules = fs3.existsSync(path3.join(canonicalRoot, "node_modules"));
  let chosenIndexPath = options.indexPath;
  if (!chosenIndexPath) {
    if (isInteractive) {
      const choices = [];
      if (hasNodeModules) {
        choices.push({
          name: "node_modules/.cache/code-search/lancedb (Recommended: zero git noise)",
          value: "node_modules/.cache/code-search/lancedb"
        });
      }
      choices.push({
        name: ".code-search/lancedb (Standard root directory)",
        value: ".code-search/lancedb"
      });
      choices.push({
        name: "Custom directory path...",
        value: "__CUSTOM__"
      });
      const selected = await select({
        message: "Where should the vector database index be stored?",
        choices
      });
      if (selected === "__CUSTOM__") {
        chosenIndexPath = await input({
          message: "Enter custom index path (relative to project root or absolute):",
          default: ".code-search/lancedb"
        });
      } else {
        chosenIndexPath = selected;
      }
    } else {
      chosenIndexPath = hasNodeModules ? "node_modules/.cache/code-search/lancedb" : ".code-search/lancedb";
    }
  }
  let respectGitignore = options.respectGitignore ?? true;
  if (isInteractive && options.respectGitignore === void 0) {
    respectGitignore = await confirm({
      message: "Skip indexing files listed in your project's .gitignore?",
      default: true
    });
  }
  let createIgnoreFile = options.createIgnoreFile ?? true;
  if (isInteractive && options.createIgnoreFile === void 0) {
    createIgnoreFile = await confirm({
      message: "Create a .codesearchignore file with recommended excludes (fixtures, mocks, minified code)?",
      default: true
    });
  }
  let supportedExtensions = options.supportedExtensions;
  if (!supportedExtensions) {
    const detected = detectProjectExtensions(canonicalRoot, { respectGitignore });
    if (isInteractive) {
      const detectedSummary = Object.entries(detected.counts).slice(0, 8).map(([ext, count]) => `${ext} (${count} files)`).join(", ");
      if (detectedSummary) {
        console.log(`
\u{1F4C1} Detected file types in project: ${detectedSummary}
`);
      }
      const action = await select({
        message: "Which file extensions should code-search index?",
        choices: [
          {
            name: `Use detected extensions (${detected.extensions.slice(0, 10).join(", ")}${detected.extensions.length > 10 ? "..." : ""})`,
            value: "detected"
          },
          {
            name: "Customize extension list manually",
            value: "custom"
          }
        ]
      });
      if (action === "custom") {
        const rawInput = await input({
          message: "Enter comma-separated file extensions to index (e.g. .ts, .tsx, .py, .md):",
          default: detected.extensions.join(", ")
        });
        supportedExtensions = rawInput.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).map((e) => e.startsWith(".") ? e : `.${e}`);
      } else {
        supportedExtensions = detected.extensions;
      }
    } else {
      supportedExtensions = detected.extensions.length > 0 ? detected.extensions : DEFAULT_EXTENSIONS;
    }
  }
  if (cleanExisting) {
    const fullDbPath = path3.isAbsolute(chosenIndexPath) ? chosenIndexPath : path3.join(canonicalRoot, chosenIndexPath);
    if (fs3.existsSync(fullDbPath)) {
      try {
        fs3.rmSync(fullDbPath, { recursive: true, force: true });
      } catch {
      }
    }
  }
  const gitignorePath = path3.join(canonicalRoot, ".gitignore");
  if (fs3.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs3.readFileSync(gitignorePath, "utf8");
      const relIndexPath = chosenIndexPath.replace(/\\/g, "/");
      if (!relIndexPath.startsWith("node_modules") && !gitignoreContent.includes(".code-search")) {
        const toAppend = "\n# code-search vector database index\n.code-search/\n";
        fs3.appendFileSync(gitignorePath, toAppend, "utf8");
        if (isInteractive) {
          console.log("\u{1F6E1} Added .code-search/ to .gitignore");
        }
      }
    } catch {
    }
  }
  const rcPath = path3.join(canonicalRoot, ".codesearchrc.json");
  const rcContent = {
    $schema: "https://raw.githubusercontent.com/genautkin/code-search-mcp/main/schema.json",
    version: 1,
    indexPath: chosenIndexPath,
    respectGitignore,
    supportedExtensions,
    customExcludes: [],
    maxFileSizeKb: DEFAULT_CONFIG.maxFileSizeKb,
    embeddingModel: DEFAULT_CONFIG.embeddingModel
  };
  fs3.writeFileSync(rcPath, JSON.stringify(rcContent, null, 2) + "\n", "utf8");
  if (isInteractive) {
    console.log(`\u2705 Saved configuration to ${rcPath}`);
  }
  const ignoreFilePath = path3.join(canonicalRoot, ".codesearchignore");
  if (createIgnoreFile && !fs3.existsSync(ignoreFilePath)) {
    fs3.writeFileSync(ignoreFilePath, RECOMMENDED_CODESEARCHIGNORE, "utf8");
    if (isInteractive) {
      console.log(`\u2705 Created ${ignoreFilePath}`);
    }
  }
  let shouldIndex = !options.skipIndex;
  if (isInteractive && options.skipIndex === void 0) {
    shouldIndex = await confirm({
      message: "Start building search index now?",
      default: true
    });
  }
  if (shouldIndex) {
    if (isInteractive) {
      console.log("\n\u{1F680} Starting initial indexing...");
    }
    const config = loadConfig(canonicalRoot);
    const worker = new IndexerWorker(config);
    await worker.init();
    await worker.startIndexing(cleanExisting);
    if (isInteractive) {
      const status = worker.getStatus();
      console.log(`\u2728 Initial indexing completed! (${status.indexedFiles} files, ${status.indexedChunks} chunks indexed)
`);
    }
  } else if (isInteractive) {
    console.log("\n\u{1F389} Setup complete! Run `npx code-search-mcp index` whenever you are ready to index.\n");
  }
}

// src/cli/uninit.ts
import * as fs4 from "fs";
import * as path4 from "path";
async function runUninit(projectRoot) {
  const targetDir = projectRoot ? path4.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs4.realpathSync(targetDir);
  } catch {
  }
  const removedPaths = [];
  let dbPath;
  try {
    const config = loadConfig(canonicalRoot);
    dbPath = config.dbPath;
  } catch {
  }
  const rcPath = path4.join(canonicalRoot, ".codesearchrc.json");
  if (fs4.existsSync(rcPath)) {
    try {
      fs4.unlinkSync(rcPath);
      removedPaths.push(rcPath);
    } catch {
    }
  }
  const ignorePath = path4.join(canonicalRoot, ".codesearchignore");
  if (fs4.existsSync(ignorePath)) {
    try {
      fs4.unlinkSync(ignorePath);
      removedPaths.push(ignorePath);
    } catch {
    }
  }
  const dotFolder = path4.join(canonicalRoot, ".code-search");
  if (fs4.existsSync(dotFolder)) {
    try {
      fs4.rmSync(dotFolder, { recursive: true, force: true });
      removedPaths.push(dotFolder);
    } catch {
    }
  }
  if (dbPath && fs4.existsSync(dbPath) && !dbPath.includes(".code-search")) {
    try {
      fs4.rmSync(dbPath, { recursive: true, force: true });
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
import * as path5 from "path";
import * as fs5 from "fs";
async function runStatus(projectRoot) {
  const targetDir = projectRoot ? path5.resolve(projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs5.realpathSync(targetDir);
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
import * as path6 from "path";
import * as fs6 from "fs";
async function runIndexCmd(options = {}) {
  const targetDir = options.projectRoot ? path6.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs6.realpathSync(targetDir);
  } catch {
  }
  const initialized = isProjectInitialized(canonicalRoot);
  if (!initialized) {
    throw new Error(`Project is not initialized. Run 'code-search init' first.`);
  }
  const config = loadConfig(canonicalRoot);
  const worker = new IndexerWorker(config);
  await worker.init();
  await worker.startIndexing(Boolean(options.forceFull));
  const status = worker.getStatus();
  return {
    success: true,
    status
  };
}

// src/cli/search.ts
import * as path7 from "path";
import * as fs7 from "fs";
async function runSearch(query, options = {}) {
  const targetDir = options.projectRoot ? path7.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs7.realpathSync(targetDir);
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
      forceFull: options.force
    });
    console.log(`\u2728 Indexing complete! (${res.status.indexedFiles} files, ${res.status.indexedChunks} chunks indexed)
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
program.option("-p, --path <path>", "Project root directory to index and search").option("-m, --model <model>", "Embedding model (default: Xenova/all-MiniLM-L6-v2)").action(async (options) => {
  try {
    const targetDir = options.path ? path8.resolve(options.path) : findProjectRoot(process.cwd());
    const config = loadConfig(targetDir);
    if (options.model) {
      config.embeddingModel = options.model;
    }
    logger.init(path8.dirname(config.dbPath));
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
    const handleExit = () => {
      try {
        logger.info("Stopping code-search-mcp session", { pid: process.pid });
      } catch {
      }
      process.exit(0);
    };
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
    process.stdin.on("close", handleExit);
    process.stdin.on("end", handleExit);
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