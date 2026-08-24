#!/usr/bin/env node
import {
  createMcpServer,
  findProjectRoot,
  loadConfig
} from "../chunk-SPJQEFWO.js";

// bin/cli.ts
import { Command } from "commander";
import * as path2 from "path";

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

// bin/cli.ts
var program = new Command();
program.name("code-search-mcp").description("Zero-daemon local semantic code search MCP server").version("0.1.0").option("-p, --path <path>", "Project root directory to index and search").option("-m, --model <model>", "Embedding model (default: Xenova/all-MiniLM-L6-v2)").action(async (options) => {
  try {
    const targetDir = options.path ? path2.resolve(options.path) : findProjectRoot(process.cwd());
    const config = loadConfig(targetDir);
    if (options.model) {
      config.embeddingModel = options.model;
    }
    logger.init(path2.dirname(config.dbPath));
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