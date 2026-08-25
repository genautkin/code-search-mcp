// src/config/defaults.ts
var DEFAULT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".cs",
  ".java",
  ".kt",
  ".scala",
  ".py",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".swift",
  ".sql",
  ".graphql",
  ".proto",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".mdx",
  ".sh",
  ".bash",
  ".zsh"
];
var DEFAULT_EXCLUDES = [
  // Build and distribution artifacts
  "dist",
  "dist/**",
  "dist-*",
  "dist-*/**",
  "build",
  "build/**",
  "out",
  "out/**",
  "bin",
  "bin/**",
  "obj",
  "obj/**",
  "www",
  "www/**",
  "wwwroot",
  "wwwroot/**",
  "coverage",
  "coverage/**",
  ".nyc_output",
  ".nyc_output/**",
  // Dependency directories
  "node_modules",
  "node_modules/**",
  "vendor",
  "vendor/**",
  "bower_components",
  "bower_components/**",
  ".pnpm-store",
  ".pnpm-store/**",
  // IDEs, tools, and AI agent skills / prompt directories
  ".git",
  ".git/**",
  ".svn",
  ".svn/**",
  ".hg",
  ".hg/**",
  ".idea",
  ".idea/**",
  ".vscode",
  ".vscode/**",
  ".gemini",
  ".gemini/**",
  ".claude",
  ".claude/**",
  ".codegraph",
  ".codegraph/**",
  ".vectorcode",
  ".vectorcode/**",
  ".code-search",
  ".code-search/**",
  ".github/skills",
  ".github/skills/**",
  ".github/instructions",
  ".github/instructions/**",
  ".github/prompts",
  ".github/prompts/**",
  "skills",
  "skills/**",
  "**/skills/**",
  "**/.agents/**",
  // Mobile / native wrapper builds
  "android",
  "android/**",
  "ios",
  "ios/**",
  "windows_build",
  "windows_build/**",
  // Lock files
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "packages.lock.json",
  // Minified & source maps
  "*.min.js",
  "*.min.css",
  "*.map",
  // Binary / media assets
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.cur",
  "*.svg",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.otf",
  "*.mp3",
  "*.mp4",
  "*.wav",
  "*.mov",
  "*.avi",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.7z",
  "*.rar",
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.xls",
  "*.xlsx",
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.bin",
  "*.DS_Store",
  "Thumbs.db",
  // Styling files (if noisy text-only embeddings)
  "*.css",
  "*.scss",
  "*.sass",
  "*.less"
];
var DEFAULT_CONFIG = {
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  batchSize: 50,
  maxFileSizeKb: 500,
  respectGitignore: true,
  queryMultiplier: 10,
  searchEf: 200
};
var RECOMMENDED_CODESEARCHIGNORE = `# code-search-mcp ignore patterns
# Syntax matches standard .gitignore glob rules

# AI Agent skills, workflows & system prompts
.github/skills/**
.github/instructions/**
.github/prompts/**
.gemini/skills/**
.claude/skills/**
**/skills/**
**/.agents/**

# Test fixtures, snapshots and mocks
**/fixtures/**
**/__snapshots__/**
**/mocks/**
*.snap

# Generated code and type declarations
*.generated.*
*.d.ts.map

# Build, cache and bundle output
dist/**
build/**
.cache/**

# Documentation assets & media
docs/images/**
docs/assets/**
`;

// src/config/loader.ts
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
function findProjectRoot(startDir = process.cwd()) {
  let resolved = path.resolve(startDir);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
  }
  let current = resolved;
  while (true) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, ".codesearchrc.json")) || fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return resolved;
    }
    current = parent;
  }
}
function isProjectInitialized(projectRoot) {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
  }
  const rcPath = path.join(canonicalRoot, ".codesearchrc.json");
  const dotFolder = path.join(canonicalRoot, ".code-search");
  const nmCache = path.join(canonicalRoot, "node_modules", ".cache", "code-search");
  return fs.existsSync(rcPath) || fs.existsSync(dotFolder) || fs.existsSync(nmCache);
}
function createIgnoreMatcher(projectRoot, customExcludes = [], respectGitignore = true) {
  const ig = ignore.default ? ignore.default() : ignore();
  ig.add(DEFAULT_EXCLUDES);
  if (respectGitignore) {
    const gitignorePath = path.join(projectRoot, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, "utf8");
        ig.add(content);
      } catch {
      }
    }
  }
  const ignorePath = path.join(projectRoot, ".ignore");
  if (fs.existsSync(ignorePath)) {
    try {
      const content = fs.readFileSync(ignorePath, "utf8");
      ig.add(content);
    } catch {
    }
  }
  const codesearchIgnorePath = path.join(projectRoot, ".codesearchignore");
  if (fs.existsSync(codesearchIgnorePath)) {
    try {
      const content = fs.readFileSync(codesearchIgnorePath, "utf8");
      ig.add(content);
    } catch {
    }
  }
  if (customExcludes && customExcludes.length > 0) {
    ig.add(customExcludes);
  }
  return {
    ignores: (relPath, isDirectory = false) => {
      const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
      if (!normalized || normalized === ".") return false;
      if (ig.ignores(normalized)) return true;
      if (isDirectory && ig.ignores(normalized + "/")) return true;
      return false;
    }
  };
}
function loadConfig(projectRoot) {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
  }
  let fileConfig = {};
  const configPath = path.join(canonicalRoot, ".codesearchrc.json");
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf8");
      fileConfig = JSON.parse(content);
    } catch (err) {
      console.warn(`[code-search-mcp] Warning: Failed to parse .codesearchrc.json:`, err);
    }
  }
  let dbPath;
  if (fileConfig.indexPath) {
    dbPath = path.isAbsolute(fileConfig.indexPath) ? fileConfig.indexPath : path.join(canonicalRoot, fileConfig.indexPath);
  } else {
    const nodeModulesPath = path.join(canonicalRoot, "node_modules");
    if (fs.existsSync(nodeModulesPath)) {
      dbPath = path.join(nodeModulesPath, ".cache", "code-search", "lancedb");
    } else {
      dbPath = path.join(canonicalRoot, ".code-search", "lancedb");
    }
  }
  const respectGitignore = typeof fileConfig.respectGitignore === "boolean" ? fileConfig.respectGitignore : DEFAULT_CONFIG.respectGitignore;
  return {
    projectRoot: canonicalRoot,
    dbPath,
    embeddingModel: fileConfig.embeddingModel || DEFAULT_CONFIG.embeddingModel,
    batchSize: fileConfig.batchSize || DEFAULT_CONFIG.batchSize,
    maxFileSizeKb: fileConfig.maxFileSizeKb || DEFAULT_CONFIG.maxFileSizeKb,
    supportedExtensions: fileConfig.supportedExtensions || DEFAULT_EXTENSIONS,
    customExcludes: fileConfig.customExcludes || [],
    respectGitignore,
    queryMultiplier: fileConfig.queryMultiplier || DEFAULT_CONFIG.queryMultiplier,
    searchEf: fileConfig.searchEf || DEFAULT_CONFIG.searchEf
  };
}

// src/embeddings/engine.ts
import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = true;
env.allowRemoteModels = true;
var EmbeddingEngine = class _EmbeddingEngine {
  static instance = null;
  modelName;
  extractorPromise = null;
  constructor(modelName = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }
  static getInstance(modelName) {
    if (!_EmbeddingEngine.instance || modelName && _EmbeddingEngine.instance.modelName !== modelName) {
      _EmbeddingEngine.instance = new _EmbeddingEngine(modelName);
    }
    return _EmbeddingEngine.instance;
  }
  async getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline("feature-extraction", this.modelName, {
        dtype: "fp32"
      });
    }
    return this.extractorPromise;
  }
  async embedText(text) {
    const extractor = await this.getExtractor();
    const cleanText = text.replace(/\r?\n/g, " ").slice(0, 2048);
    const output = await extractor(cleanText, {
      pooling: "mean",
      normalize: true
    });
    return Array.from(output.data);
  }
  async embedBatch(texts, batchSize = 32) {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const results = [];
    const dim = 384;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map(
        (t) => t.replace(/\r?\n/g, " ").slice(0, 2048)
      );
      const output = await extractor(batch, {
        pooling: "mean",
        normalize: true
      });
      for (let j = 0; j < batch.length; j++) {
        const slice = Array.from(output.data.slice(j * dim, (j + 1) * dim));
        results.push(slice);
      }
    }
    return results;
  }
};

// src/store/lancedb.ts
import * as lancedb from "@lancedb/lancedb";
import * as fs2 from "fs";

// src/indexer/query-enhancer.ts
function stemToken(word) {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("tions") && w.length > 6) return w.slice(0, -5);
  if (w.endsWith("tion") && w.length > 5) return w.slice(0, -4);
  if (w.endsWith("ers") && w.length > 4) return w.slice(0, -3);
  if (w.endsWith("er") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 999;
  const la = a.length;
  const lb = b.length;
  const matrix = [];
  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        // deletion
        matrix[i][j - 1] + 1,
        // insertion
        matrix[i - 1][j - 1] + cost
        // substitution
      );
    }
  }
  return matrix[la][lb];
}
var QueryEnhancer = class {
  vocabulary = /* @__PURE__ */ new Set();
  lowerToWord = /* @__PURE__ */ new Map();
  addWords(text) {
    const rawTokens = text.split(/[^a-zA-Z0-9_$]+/);
    for (const t of rawTokens) {
      if (t.length >= 3 && t.length <= 40) {
        this.addSingleWord(t);
        const camelParts = t.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
        if (camelParts.length > 1) {
          for (const p of camelParts) {
            if (p.length >= 3) this.addSingleWord(p);
          }
        }
      }
    }
  }
  addSingleWord(word) {
    this.vocabulary.add(word);
    const lower = word.toLowerCase();
    if (!this.lowerToWord.has(lower)) {
      this.lowerToWord.set(lower, word);
    }
  }
  getVocabularySize() {
    return this.vocabulary.size;
  }
  /**
   * Find typo correction for a token if not exact match.
   * Returns corrected string or null if no close match found.
   */
  correctTypo(token) {
    const lower = token.toLowerCase();
    if (this.lowerToWord.has(lower)) {
      return null;
    }
    if (token.length < 4) {
      return null;
    }
    const maxDistance = token.length <= 5 ? 1 : 2;
    let bestMatch = null;
    let bestDist = maxDistance + 1;
    for (const vocabLower of this.lowerToWord.keys()) {
      if (Math.abs(vocabLower.length - lower.length) > maxDistance) continue;
      if (vocabLower[0] !== lower[0] && maxDistance === 1) continue;
      const dist = levenshteinDistance(lower, vocabLower);
      if (dist <= maxDistance && dist < bestDist) {
        bestDist = dist;
        bestMatch = this.lowerToWord.get(vocabLower) || vocabLower;
        if (dist === 1) break;
      }
    }
    return bestMatch;
  }
  enhanceTokens(rawTokens) {
    const tokens = /* @__PURE__ */ new Set();
    const corrections = /* @__PURE__ */ new Map();
    const stemmed = /* @__PURE__ */ new Set();
    for (const raw of rawTokens) {
      tokens.add(raw);
      const corrected = this.correctTypo(raw);
      if (corrected && corrected.toLowerCase() !== raw.toLowerCase()) {
        corrections.set(raw, corrected);
        tokens.add(corrected);
      }
      const stem = stemToken(raw);
      if (stem && stem !== raw.toLowerCase()) {
        stemmed.add(stem);
      }
    }
    return {
      tokens: Array.from(tokens),
      corrections,
      stemmed: Array.from(stemmed)
    };
  }
};

// src/store/lancedb.ts
var TABLE_NAME = "code_chunks";
var VectorStore = class {
  dbPath;
  db = null;
  table = null;
  queryEnhancer = new QueryEnhancer();
  constructor(dbPath) {
    this.dbPath = dbPath;
  }
  async init() {
    if (!fs2.existsSync(this.dbPath)) {
      fs2.mkdirSync(this.dbPath, { recursive: true });
    }
    this.db = await lancedb.connect(this.dbPath);
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
      try {
        const rows = await this.table.query().select(["filePath"]).limit(5e3).toArray();
        for (const row of rows) {
          if (row.filePath) this.queryEnhancer.addWords(row.filePath);
        }
      } catch {
      }
    } else {
      const seedRecord = {
        id: "__init__",
        filePath: "__init__",
        absolutePath: "__init__",
        startLine: 0,
        endLine: 0,
        content: "__init__",
        contentHash: "__init__",
        vector: new Array(384).fill(0),
        language: "text",
        updatedAt: 0
      };
      this.table = await this.db.createTable(TABLE_NAME, [seedRecord]);
      await this.table.delete("id = '__init__'");
    }
  }
  ensureTable() {
    if (!this.table) {
      throw new Error("VectorStore not initialized. Call init() first.");
    }
    return this.table;
  }
  async retryOnConflict(fn, maxRetries = 5) {
    let attempt = 0;
    while (true) {
      const table = this.ensureTable();
      try {
        return await fn(table);
      } catch (err) {
        const msg = String(err?.message || err);
        const isConflict = msg.includes("Commit conflict") || msg.includes("conflict") || msg.includes("Version mismatch") || msg.includes("version");
        if (isConflict && attempt < maxRetries) {
          attempt++;
          const delay = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 50);
          await new Promise((resolve5) => setTimeout(resolve5, delay));
          if (this.db) {
            try {
              this.table = await this.db.openTable(TABLE_NAME);
            } catch {
            }
          }
          continue;
        }
        throw err;
      }
    }
  }
  async insertChunks(chunks) {
    if (chunks.length === 0) return;
    for (const chunk of chunks) {
      if (chunk.content) this.queryEnhancer.addWords(chunk.content);
      if (chunk.filePath) this.queryEnhancer.addWords(chunk.filePath);
    }
    const records = chunks.map((chunk) => ({
      id: chunk.id,
      filePath: chunk.filePath,
      absolutePath: chunk.absolutePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      contentHash: chunk.contentHash,
      vector: chunk.vector || new Array(384).fill(0),
      language: chunk.language || "text",
      updatedAt: chunk.updatedAt || Date.now()
    }));
    await this.retryOnConflict((table) => table.add(records));
  }
  async deleteByFilePath(filePath) {
    const escaped = filePath.replace(/'/g, "\\'");
    await this.retryOnConflict((table) => table.delete(`\`filePath\` = '${escaped}'`));
  }
  async deleteByFilePaths(filePaths) {
    if (filePaths.length === 0) return;
    for (let i = 0; i < filePaths.length; i += 50) {
      const batch = filePaths.slice(i, i + 50);
      const condition = batch.map((fp) => `\`filePath\` = '${fp.replace(/'/g, "\\'")}'`).join(" OR ");
      await this.retryOnConflict((table) => table.delete(condition));
    }
  }
  async searchVector(queryVector, limit = 10) {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) {
      return [];
    }
    try {
      const records = await table.vectorSearch(queryVector).distanceType("cosine").limit(limit).toArray();
      return records.map((record) => {
        const distance = typeof record._distance === "number" ? record._distance : 1;
        const score = Math.max(0, Math.min(1, 1 - distance));
        return {
          filePath: record.filePath,
          startLine: record.startLine,
          endLine: record.endLine,
          content: record.content,
          score: Number(score.toFixed(4)),
          language: record.language
        };
      });
    } catch (err) {
      console.error("[code-search-mcp] Error searching LanceDB:", err);
      return [];
    }
  }
  async searchLexical(queryText, limit = 30) {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount === 0) {
      return [];
    }
    const stopWords = /* @__PURE__ */ new Set([
      "the",
      "and",
      "for",
      "with",
      "where",
      "how",
      "what",
      "this",
      "that",
      "from",
      "code",
      "file",
      "find",
      "search",
      "get",
      "show",
      "when",
      "which",
      "about",
      "into"
    ]);
    const rawTokens = queryText.split(/[\s,;:!?()[\]{}<>"'`]+/).map((t) => t.trim()).filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));
    if (rawTokens.length === 0) {
      return [];
    }
    const enhanced = this.queryEnhancer.enhanceTokens(rawTokens);
    const candidateTokens = /* @__PURE__ */ new Set([...rawTokens, ...enhanced.tokens, ...enhanced.stemmed]);
    const tokenSet = /* @__PURE__ */ new Set();
    for (const token of candidateTokens) {
      tokenSet.add(token);
      const camelParts = token.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
      if (camelParts.length > 1) {
        for (const part of camelParts) {
          if (part.length >= 2 && !stopWords.has(part.toLowerCase())) {
            tokenSet.add(part);
          }
        }
      }
      const subParts = token.split(/[-_.]+/);
      if (subParts.length > 1) {
        for (const part of subParts) {
          if (part.length >= 2 && !stopWords.has(part.toLowerCase())) {
            tokenSet.add(part);
          }
        }
      }
    }
    const primaryTokens = Array.from(/* @__PURE__ */ new Set([...rawTokens, ...enhanced.tokens])).slice(0, 5);
    const searchTokens = Array.from(tokenSet).slice(0, 10);
    const filterClauses = searchTokens.map((token) => {
      const escaped = token.replace(/'/g, "''").replace(/\\/g, "\\\\").toLowerCase();
      return `LOWER(\`content\`) LIKE '%${escaped}%' OR LOWER(\`filePath\`) LIKE '%${escaped}%'`;
    });
    const isJsonQuery = queryText.toLowerCase().includes("json");
    try {
      const whereClause = filterClauses.join(" OR ");
      const records = await table.query().where(whereClause).limit(limit).toArray();
      return records.map((record) => {
        let matchCount = 0;
        const lowerContent = (record.content || "").toLowerCase();
        const lowerPath = (record.filePath || "").toLowerCase();
        const rawContent = record.content || "";
        for (const token of primaryTokens) {
          const tLower = token.toLowerCase();
          if (lowerPath.includes(tLower)) matchCount += 10;
          if (rawContent.includes(token)) matchCount += 8;
          else if (lowerContent.includes(tLower)) matchCount += 4;
        }
        for (const token of tokenSet) {
          if (primaryTokens.includes(token)) continue;
          const tLower = token.toLowerCase();
          if (lowerPath.includes(tLower)) matchCount += 2;
          if (lowerContent.includes(tLower)) matchCount += 1;
        }
        let score = Math.min(1, matchCount * 0.1);
        if (!isJsonQuery && (record.filePath?.endsWith(".json") || record.language === "json")) {
          score *= 0.5;
        }
        return {
          filePath: record.filePath,
          startLine: record.startLine,
          endLine: record.endLine,
          content: record.content,
          score: Number(score.toFixed(4)),
          language: record.language
        };
      }).sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn("[code-search-mcp] Lexical search warning:", err);
      return [];
    }
  }
  async searchHybrid(queryVector, queryText, limit = 10) {
    const candidateLimit = Math.max(limit * 4, 40);
    const [vectorHits, lexicalHits] = await Promise.all([
      this.searchVector(queryVector, candidateLimit),
      this.searchLexical(queryText, candidateLimit)
    ]);
    if (lexicalHits.length === 0) {
      return vectorHits.slice(0, limit);
    }
    if (vectorHits.length === 0) {
      return lexicalHits.slice(0, limit);
    }
    const rrfMap = /* @__PURE__ */ new Map();
    const RRF_K = 60;
    const isJsonQuery = queryText.toLowerCase().includes("json");
    for (let i = 0; i < vectorHits.length; i++) {
      const hit = vectorHits[i];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      let rrf = 1 / (RRF_K + (i + 1));
      if (!isJsonQuery && (hit.filePath.endsWith(".json") || hit.language === "json")) {
        rrf *= 0.6;
      }
      rrfMap.set(key, {
        result: hit,
        rrfScore: rrf,
        vectorScore: hit.score
      });
    }
    for (let j = 0; j < lexicalHits.length; j++) {
      const hit = lexicalHits[j];
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      let rrf = 1.2 / (RRF_K + (j + 1));
      if (!isJsonQuery && (hit.filePath.endsWith(".json") || hit.language === "json")) {
        rrf *= 0.6;
      }
      const existing = rrfMap.get(key);
      if (existing) {
        existing.rrfScore += rrf;
      } else {
        rrfMap.set(key, {
          result: hit,
          rrfScore: rrf,
          vectorScore: hit.score * 0.7
        });
      }
    }
    const fused = Array.from(rrfMap.values()).sort((a, b) => b.rrfScore - a.rrfScore).slice(0, candidateLimit);
    if (fused.length === 0) return [];
    const hasCodeIntent = /\b(code|func|function|class|interface|type|const|method|handler|builder|component|is[A-Z]|get[A-Z]|set[A-Z]|has[A-Z])\b/i.test(
      queryText
    ) || /[a-z][A-Z]/.test(queryText);
    const maxRrf = fused[0].rrfScore;
    return fused.map(({ result, rrfScore, vectorScore }) => {
      let blendedScore = Math.max(vectorScore, Math.min(0.95, rrfScore / maxRrf * 0.85));
      const isCodeFile = result.language !== "markdown" && !result.filePath.endsWith(".md") && !result.filePath.endsWith(".mdx");
      if (hasCodeIntent && isCodeFile) {
        blendedScore = Math.min(0.99, blendedScore * 1.15);
      }
      return {
        ...result,
        score: Number(blendedScore.toFixed(4))
      };
    }).sort((a, b) => b.score - a.score);
  }
  applyFilters(results, options, queryText) {
    if (!options) return results;
    let filtered = results;
    if (options.pathFilter) {
      const pf = options.pathFilter.toLowerCase().replace(/\\/g, "/");
      filtered = filtered.filter((r) => r.filePath.toLowerCase().includes(pf));
    }
    if (options.language) {
      const lang = options.language.toLowerCase();
      filtered = filtered.filter((r) => (r.language || "").toLowerCase() === lang);
    }
    if (options.codeOnly) {
      filtered = filtered.filter(
        (r) => r.language !== "markdown" && !r.filePath.endsWith(".md") && !r.filePath.endsWith(".mdx")
      );
    }
    const limit = options.limit ?? 10;
    const maxPerFile = limit <= 5 ? 1 : 2;
    const isExplicitDocQuery = options.pathFilter?.includes(".md") || options.language === "markdown" || /\b(docs|doc|adr|rfc|skills|readme|guide)\b/i.test(queryText || "");
    const maxDocs = isExplicitDocQuery ? limit : Math.max(2, Math.floor(limit * 0.25));
    let docCount = 0;
    const fileChunkCounts = /* @__PURE__ */ new Map();
    const diverse = [];
    for (const res of filtered) {
      const isDoc = res.language === "markdown" || res.filePath.endsWith(".md") || res.filePath.endsWith(".mdx");
      if (isDoc && !isExplicitDocQuery && docCount >= maxDocs) {
        continue;
      }
      const count = fileChunkCounts.get(res.filePath) || 0;
      if (count < maxPerFile) {
        fileChunkCounts.set(res.filePath, count + 1);
        if (isDoc) docCount++;
        diverse.push(res);
      }
    }
    return diverse;
  }
  async search(queryVector, options, queryText) {
    const opts = typeof options === "number" ? { limit: options } : options || {};
    const limit = opts.limit ?? 10;
    const fetchLimit = opts.pathFilter || opts.language || opts.codeOnly ? Math.max(limit * 4, 40) : limit;
    let rawResults;
    if (queryText) {
      rawResults = await this.searchHybrid(queryVector, queryText, fetchLimit);
    } else {
      rawResults = await this.searchVector(queryVector, fetchLimit);
    }
    return this.applyFilters(rawResults, opts, queryText).slice(0, limit);
  }
  async count() {
    const table = this.ensureTable();
    return await table.countRows();
  }
  async getIndexedFileStats() {
    const table = this.ensureTable();
    const map = /* @__PURE__ */ new Map();
    const rowCount = await table.countRows();
    if (rowCount === 0) return map;
    try {
      const records = await table.query().select(["filePath", "updatedAt", "contentHash"]).toArray();
      for (const rec of records) {
        if (rec.filePath && !map.has(rec.filePath)) {
          map.set(rec.filePath, {
            updatedAt: rec.updatedAt || 0,
            contentHash: rec.contentHash || ""
          });
        }
      }
    } catch (err) {
      console.warn("[code-search-mcp] Warning getting indexed file stats:", err);
    }
    return map;
  }
  async clear() {
    if (this.db) {
      try {
        await this.db.dropTable(TABLE_NAME);
      } catch {
      }
      this.table = null;
      await this.init();
    }
  }
};

// src/indexer/chunker.ts
import * as crypto from "crypto";
import * as path2 from "path";
function computeHash(text) {
  return crypto.createHash("md5").update(text, "utf8").digest("hex");
}
function normalizePath(p) {
  return p.replace(/\\/g, "/");
}
function detectLanguage(filePath) {
  const ext = path2.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".vue":
      return "vue";
    case ".svelte":
      return "svelte";
    case ".cs":
      return "csharp";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".java":
      return "java";
    case ".cpp":
    case ".cc":
    case ".c":
    case ".h":
    case ".hpp":
      return "cpp";
    case ".sql":
      return "sql";
    case ".json":
      return "json";
    case ".md":
    case ".mdx":
      return "markdown";
    default:
      return ext.replace(".", "") || "text";
  }
}
var LANGUAGE_KEYWORDS = /* @__PURE__ */ new Set([
  "if",
  "else",
  "return",
  "for",
  "while",
  "switch",
  "case",
  "break",
  "continue",
  "import",
  "export",
  "from",
  "default",
  "as",
  "new",
  "this",
  "super",
  "true",
  "false",
  "null",
  "undefined",
  "void",
  "any",
  "string",
  "number",
  "boolean",
  "public",
  "private",
  "protected",
  "static",
  "readonly",
  "const",
  "let",
  "var",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "struct",
  "trait",
  "def",
  "fn"
]);
function extractChunkSymbols(content, language) {
  const symbols = /* @__PURE__ */ new Set();
  const declRegex = /(?:class|interface|type|enum|struct|trait|record|function|fn|func|def)\s+([A-Za-z0-9_]+)/g;
  let match;
  while ((match = declRegex.exec(content)) !== null) {
    if (match[1] && match[1].length > 1 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
    }
  }
  const funcAssignRegex = /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g;
  while ((match = funcAssignRegex.exec(content)) !== null) {
    if (match[1] && match[1].length > 1 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
    }
  }
  const methodRegex = /(?:public|private|protected|static|async|override|virtual)\s+(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
  while ((match = methodRegex.exec(content)) !== null) {
    if (match[1] && match[1].length > 1 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
    }
  }
  const idRegex = /\b([a-z]+[A-Z0-9][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z0-9][A-Za-z0-9]*)\b/g;
  while ((match = idRegex.exec(content)) !== null) {
    if (match[1] && match[1].length >= 3 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
      if (symbols.size >= 20) break;
    }
  }
  return Array.from(symbols).slice(0, 15);
}
function formatChunkForEmbedding(chunk) {
  const lang = chunk.language || detectLanguage(chunk.filePath);
  const symbols = lang !== "markdown" && lang !== "text" ? extractChunkSymbols(chunk.content, lang) : [];
  const symbolLine = symbols.length > 0 ? `
// Symbols: ${symbols.join(", ")}` : "";
  const header = `// File: ${chunk.filePath} [L${chunk.startLine}-L${chunk.endLine}] (${lang})${symbolLine}`;
  return `${header}
${chunk.content}`;
}
function chunkCodeFile(relativePath, absolutePath, content, options = {}) {
  const maxLines = options.maxLinesPerChunk ?? 45;
  const overlap = options.overlapLines ?? 10;
  const normalizedRelPath = normalizePath(relativePath);
  const normalizedAbsPath = normalizePath(absolutePath);
  const language = detectLanguage(relativePath);
  const now = Date.now();
  let rawLines = content.split(/\r?\n/);
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }
  const totalLines = rawLines.length;
  if (totalLines === 0 || totalLines === 1 && rawLines[0].trim() === "") {
    return [];
  }
  if (totalLines <= maxLines) {
    const chunkContent = rawLines.join("\n");
    return [
      {
        id: `${normalizedRelPath}:1:${totalLines}`,
        filePath: normalizedRelPath,
        absolutePath: normalizedAbsPath,
        startLine: 1,
        endLine: totalLines,
        content: chunkContent,
        contentHash: computeHash(chunkContent),
        language,
        updatedAt: now
      }
    ];
  }
  const chunks = [];
  let currentStart = 0;
  while (currentStart < totalLines) {
    let currentEnd = Math.min(currentStart + maxLines, totalLines);
    if (currentEnd < totalLines) {
      const searchWindowStart = Math.max(currentStart + (maxLines - 10), currentStart + 15);
      for (let lineIdx = currentEnd - 1; lineIdx >= searchWindowStart; lineIdx--) {
        const line = rawLines[lineIdx].trim();
        if (line === "" || line === "}" || line === "};" || line.startsWith("export ") || line.startsWith("function ") || line.startsWith("/**")) {
          currentEnd = lineIdx + (line === "" || line === "}" || line === "};" ? 1 : 0);
          break;
        }
      }
    }
    const chunkLines = rawLines.slice(currentStart, currentEnd);
    const chunkContent = chunkLines.join("\n");
    const startLineNum = currentStart + 1;
    const endLineNum = currentEnd;
    chunks.push({
      id: `${normalizedRelPath}:${startLineNum}:${endLineNum}`,
      filePath: normalizedRelPath,
      absolutePath: normalizedAbsPath,
      startLine: startLineNum,
      endLine: endLineNum,
      content: chunkContent,
      contentHash: computeHash(chunkContent),
      language,
      updatedAt: now
    });
    if (currentEnd >= totalLines) {
      break;
    }
    const advance = Math.max(1, currentEnd - currentStart - overlap);
    currentStart += advance;
  }
  return chunks;
}

// src/indexer/scanner.ts
import * as fs3 from "fs";
import * as path3 from "path";
async function scanDirectory(config, indexedFilesMap = /* @__PURE__ */ new Map()) {
  const matcher = createIgnoreMatcher(config.projectRoot, config.customExcludes, config.respectGitignore);
  const maxSizeBytes = config.maxFileSizeKb * 1024;
  const supportedExtSet = new Set(config.supportedExtensions.map((e) => e.toLowerCase()));
  const filesToIndex = [];
  const discoveredRelPaths = /* @__PURE__ */ new Set();
  let unchangedFilesCount = 0;
  function walk(currentDir) {
    let entries;
    try {
      entries = fs3.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path3.join(currentDir, entry.name);
      const relPath = normalizePath(path3.relative(config.projectRoot, fullPath));
      const isDir = entry.isDirectory();
      if (matcher.ignores(relPath, isDir)) {
        continue;
      }
      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path3.extname(entry.name).toLowerCase();
        if (!supportedExtSet.has(ext)) {
          continue;
        }
        try {
          const stat = fs3.statSync(fullPath);
          if (stat.size > maxSizeBytes || stat.size === 0) {
            continue;
          }
          discoveredRelPaths.add(relPath);
          const existing = indexedFilesMap.get(relPath);
          if (existing && existing.updatedAt >= stat.mtimeMs) {
            unchangedFilesCount++;
          } else {
            filesToIndex.push({
              relativePath: relPath,
              absolutePath: fullPath,
              mtimeMs: stat.mtimeMs,
              sizeBytes: stat.size
            });
          }
        } catch {
        }
      }
    }
  }
  walk(config.projectRoot);
  const filesToDelete = [];
  for (const indexedRelPath of indexedFilesMap.keys()) {
    if (!discoveredRelPaths.has(indexedRelPath)) {
      filesToDelete.push(indexedRelPath);
    }
  }
  return {
    filesToIndex,
    filesToDelete,
    unchangedFilesCount,
    totalFilesCount: discoveredRelPaths.size
  };
}

// src/indexer/worker.ts
import * as fs5 from "fs";
import * as path5 from "path";

// src/indexer/lock.ts
import * as fs4 from "fs";
import * as path4 from "path";
var ProcessLock = class {
  lockFilePath;
  hasLock = false;
  constructor(lockDir) {
    this.lockFilePath = path4.join(lockDir, ".indexer.lock");
  }
  acquire() {
    try {
      if (!fs4.existsSync(path4.dirname(this.lockFilePath))) {
        fs4.mkdirSync(path4.dirname(this.lockFilePath), { recursive: true });
      }
      if (fs4.existsSync(this.lockFilePath)) {
        const rawPid = fs4.readFileSync(this.lockFilePath, "utf8").trim();
        const existingPid = parseInt(rawPid, 10);
        if (!isNaN(existingPid) && existingPid !== process.pid && this.isPidAlive(existingPid)) {
          return false;
        }
      }
      fs4.writeFileSync(this.lockFilePath, String(process.pid), "utf8");
      this.hasLock = true;
      return true;
    } catch {
      return false;
    }
  }
  release() {
    if (this.hasLock) {
      try {
        if (fs4.existsSync(this.lockFilePath)) {
          const rawPid = fs4.readFileSync(this.lockFilePath, "utf8").trim();
          if (parseInt(rawPid, 10) === process.pid) {
            fs4.unlinkSync(this.lockFilePath);
          }
        }
      } catch {
      }
      this.hasLock = false;
    }
  }
  isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === "EPERM";
    }
  }
};

// src/indexer/worker.ts
var IndexerWorker = class {
  config;
  store;
  embeddings;
  status;
  isRunning = false;
  lock;
  constructor(config) {
    this.config = config;
    this.store = new VectorStore(config.dbPath);
    this.embeddings = EmbeddingEngine.getInstance(config.embeddingModel);
    this.lock = new ProcessLock(config.dbPath);
    this.status = {
      state: "idle",
      progressPercentage: 0,
      indexedFiles: 0,
      totalFiles: 0,
      indexedChunks: 0
    };
  }
  async init() {
    await this.store.init();
    const count = await this.store.count();
    const stats = await this.store.getIndexedFileStats();
    this.status.indexedChunks = count;
    this.status.indexedFiles = stats.size;
    this.status.totalFiles = stats.size;
    if (stats.size > 0) {
      this.status.state = "ready";
      this.status.progressPercentage = 100;
    }
  }
  getStatus() {
    return { ...this.status };
  }
  async startIndexing(forceFull = false, onProgress) {
    if (this.isRunning) {
      return;
    }
    if (!this.lock.acquire()) {
      const count = await this.store.count();
      const stats = await this.store.getIndexedFileStats();
      this.status.indexedChunks = count;
      this.status.indexedFiles = stats.size;
      this.status.totalFiles = stats.size;
      this.status.state = "ready";
      this.status.progressPercentage = stats.size > 0 ? 100 : 0;
      onProgress?.({ ...this.status });
      return;
    }
    this.isRunning = true;
    try {
      this.status.state = "scanning";
      this.status.error = void 0;
      onProgress?.({ ...this.status });
      if (forceFull) {
        await this.store.clear();
      }
      const indexedFilesMap = forceFull ? /* @__PURE__ */ new Map() : await this.store.getIndexedFileStats();
      const scan = await scanDirectory(this.config, indexedFilesMap);
      for (const relPath of scan.filesToDelete) {
        await this.store.deleteByFilePath(relPath);
      }
      this.status.totalFiles = scan.totalFilesCount;
      this.status.indexedFiles = scan.unchangedFilesCount;
      this.status.progressPercentage = scan.totalFilesCount === 0 ? 100 : Math.round(scan.unchangedFilesCount / scan.totalFilesCount * 100);
      onProgress?.({ ...this.status });
      if (scan.filesToIndex.length === 0) {
        this.status.state = "ready";
        this.status.progressPercentage = 100;
        this.status.lastIndexedAt = Date.now();
        this.status.indexedChunks = await this.store.count();
        this.isRunning = false;
        onProgress?.({ ...this.status });
        return;
      }
      this.status.state = "indexing";
      onProgress?.({ ...this.status });
      let processedInScan = 0;
      const batchSize = this.config.batchSize;
      for (let i = 0; i < scan.filesToIndex.length; i += batchSize) {
        const batch = scan.filesToIndex.slice(i, i + batchSize);
        const batchChunks = [];
        const batchRelPaths = [];
        for (const file of batch) {
          this.status.currentFile = file.relativePath;
          batchRelPaths.push(file.relativePath);
          try {
            if (fs5.existsSync(file.absolutePath)) {
              const content = fs5.readFileSync(file.absolutePath, "utf8");
              const fileChunks = chunkCodeFile(file.relativePath, file.absolutePath, content);
              batchChunks.push(...fileChunks);
            }
          } catch (fileErr) {
            console.warn(`[code-search-mcp] Failed to read ${file.relativePath}:`, fileErr);
          }
        }
        if (batchChunks.length > 0) {
          const texts = batchChunks.map((c) => formatChunkForEmbedding(c));
          const vectors = await this.embeddings.embedBatch(texts, 64);
          for (let j = 0; j < batchChunks.length; j++) {
            batchChunks[j].vector = vectors[j];
          }
          await this.store.deleteByFilePaths(batchRelPaths);
          await this.store.insertChunks(batchChunks);
        } else if (batchRelPaths.length > 0) {
          await this.store.deleteByFilePaths(batchRelPaths);
        }
        processedInScan += batch.length;
        this.status.indexedFiles = Math.min(scan.totalFilesCount, scan.unchangedFilesCount + processedInScan);
        this.status.progressPercentage = Math.round(
          this.status.indexedFiles / scan.totalFilesCount * 100
        );
        onProgress?.({ ...this.status });
      }
      this.status.state = "ready";
      this.status.progressPercentage = 100;
      this.status.lastIndexedAt = Date.now();
      this.status.currentFile = void 0;
      this.status.indexedChunks = await this.store.count();
      onProgress?.({ ...this.status });
    } catch (err) {
      this.status.state = "error";
      this.status.error = err?.message || String(err);
      console.error("[code-search-mcp] Indexing worker error:", err);
      onProgress?.({ ...this.status });
    } finally {
      this.isRunning = false;
      this.lock.release();
    }
  }
  async indexSingleFile(relativePath, absolutePath) {
    const absPath = absolutePath || path5.join(this.config.projectRoot, relativePath);
    const normRelPath = normalizePath(relativePath);
    if (!fs5.existsSync(absPath)) {
      await this.store.deleteByFilePath(normRelPath);
      return;
    }
    const content = fs5.readFileSync(absPath, "utf8");
    const chunks = chunkCodeFile(normRelPath, absPath, content);
    if (chunks.length === 0) {
      await this.store.deleteByFilePath(normRelPath);
      return;
    }
    const texts = chunks.map((c) => formatChunkForEmbedding(c));
    const vectors = await this.embeddings.embedBatch(texts);
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].vector = vectors[i];
    }
    await this.store.deleteByFilePath(normRelPath);
    await this.store.insertChunks(chunks);
  }
  async removeSingleFile(relativePath) {
    const normRelPath = normalizePath(relativePath);
    await this.store.deleteByFilePath(normRelPath);
  }
  async query(queryText, options) {
    const opts = typeof options === "number" ? { limit: options } : options || {};
    const queryVector = await this.embeddings.embedText(queryText);
    const results = await this.store.search(queryVector, opts, queryText);
    const status = this.getStatus();
    let output = "";
    if (status.state !== "ready") {
      output += `\u26A0\uFE0F [Index status: ${status.state.toUpperCase()} (${status.progressPercentage}% complete - ${status.indexedFiles}/${status.totalFiles} files indexed)]
`;
      output += `Results from currently indexed files:

`;
    }
    if (results.length === 0) {
      output += `No matching code snippets found for query: "${queryText}".`;
    } else {
      results.forEach((res, idx) => {
        output += `### Match ${idx + 1}: ${res.filePath}:${res.startLine}-${res.endLine} [Score: ${(res.score * 100).toFixed(1)}% | ${res.language || "text"}]
`;
        output += "```" + (res.language || "") + "\n";
        const lines = res.content.split("\n");
        const numberedContent = lines.map((line, lineIdx) => `${res.startLine + lineIdx}: ${line}`).join("\n");
        output += numberedContent + "\n";
        output += "```\n\n";
      });
    }
    return {
      status,
      results,
      formattedOutput: output.trim()
    };
  }
};

// src/indexer/watcher.ts
import chokidar from "chokidar";
import * as fs6 from "fs";
import * as path6 from "path";
var FileWatcher = class {
  config;
  worker;
  watcher = null;
  debounceMap = /* @__PURE__ */ new Map();
  supportedExts;
  matcher;
  constructor(config, worker) {
    this.config = config;
    this.worker = worker;
    this.supportedExts = new Set(config.supportedExtensions.map((e) => e.toLowerCase()));
    this.matcher = createIgnoreMatcher(config.projectRoot, config.customExcludes, config.respectGitignore);
  }
  readyPromise = null;
  async start() {
    if (this.watcher) return;
    this.readyPromise = new Promise((resolve5) => {
      this.watcher = chokidar.watch(this.config.projectRoot, {
        ignored: (filePath, stats) => {
          const rel = normalizePath(path6.relative(this.config.projectRoot, filePath));
          if (!rel || rel === ".") return false;
          const isDir = stats ? typeof stats.isDirectory === "function" ? stats.isDirectory() : false : false;
          return this.matcher.ignores(rel, isDir);
        },
        persistent: true,
        ignoreInitial: true
      });
      this.watcher.on("ready", () => {
        resolve5();
      });
      this.watcher.on("add", (filePath) => this.handleFileChange(filePath));
      this.watcher.on("change", (filePath) => this.handleFileChange(filePath));
      this.watcher.on("unlink", (filePath) => this.handleFileUnlink(filePath));
    });
    await this.readyPromise;
  }
  async whenReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }
  handleFileChange(filePath) {
    const ext = path6.extname(filePath).toLowerCase();
    if (!this.supportedExts.has(ext)) return;
    let absPath = path6.resolve(filePath);
    try {
      absPath = fs6.realpathSync(absPath);
    } catch {
    }
    const relPath = normalizePath(path6.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith("..") || this.matcher.ignores(relPath)) return;
    const existingTimeout = this.debounceMap.get(relPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    const timer = setTimeout(async () => {
      this.debounceMap.delete(relPath);
      try {
        await this.worker.indexSingleFile(relPath, absPath);
      } catch (err) {
        console.warn(`[code-search-mcp] Failed to incrementally index ${relPath}:`, err);
      }
    }, 200);
    this.debounceMap.set(relPath, timer);
  }
  handleFileUnlink(filePath) {
    let absPath = path6.resolve(filePath);
    try {
      absPath = fs6.realpathSync(absPath);
    } catch {
    }
    const relPath = normalizePath(path6.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith("..")) return;
    const existingTimeout = this.debounceMap.get(relPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.debounceMap.delete(relPath);
    }
    this.worker.removeSingleFile(relPath).catch((err) => {
      console.warn(`[code-search-mcp] Failed to remove ${relPath} from index:`, err);
    });
  }
  async stop() {
    for (const timer of this.debounceMap.values()) {
      clearTimeout(timer);
    }
    this.debounceMap.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
};

// src/cli/init.ts
import * as fs8 from "fs";
import * as path8 from "path";
import { select, confirm, input } from "@inquirer/prompts";

// src/cli/detector.ts
import * as fs7 from "fs";
import * as path7 from "path";
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
  const canonicalRoot = path7.resolve(projectRoot);
  const respectGitignore = options.respectGitignore ?? true;
  const maxFiles = options.maxFilesToSample ?? 5e4;
  const matcher = createIgnoreMatcher(canonicalRoot, [], respectGitignore);
  const counts = {};
  let totalFiles = 0;
  function walk(currentDir) {
    if (totalFiles >= maxFiles) return;
    let entries;
    try {
      entries = fs7.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (totalFiles >= maxFiles) break;
      const fullPath = path7.join(currentDir, entry.name);
      const relPath = normalizePath(path7.relative(canonicalRoot, fullPath));
      const isDir = entry.isDirectory();
      if (matcher.ignores(relPath, isDir)) {
        continue;
      }
      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path7.extname(entry.name).toLowerCase();
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
  const targetDir = options.projectRoot ? path8.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs8.realpathSync(targetDir);
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
  const hasNodeModules = fs8.existsSync(path8.join(canonicalRoot, "node_modules"));
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
  const ignoreFilePath = path8.join(canonicalRoot, ".codesearchignore");
  const ignoreFileExists = fs8.existsSync(ignoreFilePath);
  let createIgnoreFile = options.createIgnoreFile ?? !ignoreFileExists;
  if (isInteractive && options.createIgnoreFile === void 0) {
    if (!ignoreFileExists) {
      createIgnoreFile = await confirm({
        message: "Create a .codesearchignore file with recommended excludes (fixtures, mocks, minified code)?",
        default: true
      });
    } else {
      createIgnoreFile = false;
    }
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
    const fullDbPath = path8.isAbsolute(chosenIndexPath) ? chosenIndexPath : path8.join(canonicalRoot, chosenIndexPath);
    if (fs8.existsSync(fullDbPath)) {
      try {
        fs8.rmSync(fullDbPath, { recursive: true, force: true });
      } catch {
      }
    }
  }
  const gitignorePath = path8.join(canonicalRoot, ".gitignore");
  if (fs8.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs8.readFileSync(gitignorePath, "utf8");
      const relIndexPath = chosenIndexPath.replace(/\\/g, "/");
      if (!relIndexPath.startsWith("node_modules") && !gitignoreContent.includes(".code-search")) {
        const toAppend = "\n# code-search vector database index\n.code-search/\n";
        fs8.appendFileSync(gitignorePath, toAppend, "utf8");
        if (isInteractive) {
          console.log("\u{1F6E1} Added .code-search/ to .gitignore");
        }
      }
    } catch {
    }
  }
  const rcPath = path8.join(canonicalRoot, ".codesearchrc.json");
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
  fs8.writeFileSync(rcPath, JSON.stringify(rcContent, null, 2) + "\n", "utf8");
  if (isInteractive) {
    console.log(`\u2705 Saved configuration to ${rcPath}`);
  }
  if (createIgnoreFile && !fs8.existsSync(ignoreFilePath)) {
    fs8.writeFileSync(ignoreFilePath, RECOMMENDED_CODESEARCHIGNORE, "utf8");
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
      console.log(`\u2728 Initial indexing completed! (${status.indexedFiles} files, ${status.indexedChunks} chunks indexed)`);
      console.log(`\u{1F4A1} Tip: You can change your configuration anytime by editing .codesearchrc.json or .codesearchignore.
`);
    }
  } else if (isInteractive) {
    console.log("\n\u{1F389} Setup complete! Run `code-search-mcp index` whenever you are ready to index.");
    console.log(`\u{1F4A1} Tip: You can change your configuration anytime by editing .codesearchrc.json or .codesearchignore.
`);
  }
}

// src/server/mcp.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
async function createMcpServer(initialConfig) {
  let currentConfig = initialConfig;
  let isInit = isProjectInitialized(currentConfig.projectRoot);
  let worker = new IndexerWorker(currentConfig);
  let watcher = new FileWatcher(currentConfig, worker);
  if (isInit) {
    await worker.init();
  }
  const server = new Server(
    {
      name: "code-search-mcp",
      version: "0.1.0"
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
          name: "code_search",
          description: 'Search the codebase semantically using natural language queries (e.g. "how is payment verified", "calculate discount rate"). Returns relevant code snippets with file paths and line numbers. Supports filtering by directory path, programming language, or codeOnly (to exclude markdown docs).',
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The natural language or identifier search query"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              },
              pathFilter: {
                type: "string",
                description: 'Optional directory or file path substring to restrict search (e.g. "src/auth", "src/billing")'
              },
              language: {
                type: "string",
                description: 'Optional programming language filter (e.g. "typescript", "javascript", "vue")'
              },
              codeOnly: {
                type: "boolean",
                description: "If true, excludes markdown documentation files (.md) to prioritize actual code formulas and logic"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "code_search_status",
          description: "Get the current indexing status, progress percentage, total files, and indexed chunk count.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "code_search_reindex",
          description: "Trigger a background re-index of the repository. Can be used to force a full reindex.",
          inputSchema: {
            type: "object",
            properties: {
              forceFull: {
                type: "boolean",
                description: "If true, clears existing vector database and rebuilds index from scratch"
              }
            }
          }
        },
        {
          name: "code_search_init",
          description: "Initialize semantic search for the project (creates .codesearchrc.json, .codesearchignore, and builds index).",
          inputSchema: {
            type: "object",
            properties: {
              indexPath: {
                type: "string",
                description: "Optional custom index storage path (default: node_modules/.cache/code-search/lancedb or .code-search/lancedb)"
              },
              respectGitignore: {
                type: "boolean",
                description: "Whether to skip files listed in .gitignore (default: true)"
              },
              supportedExtensions: {
                type: "array",
                items: { type: "string" },
                description: 'List of file extensions to index (e.g. [".ts", ".tsx", ".py", ".md"])'
              }
            }
          }
        },
        {
          name: "code_search_guide",
          description: "Get best practices and usage instructions for AI agents on how and when to use code_search.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === "code_search_init") {
      await runInit({
        projectRoot: currentConfig.projectRoot,
        yes: true,
        indexPath: typeof args?.indexPath === "string" ? args.indexPath : void 0,
        respectGitignore: typeof args?.respectGitignore === "boolean" ? args.respectGitignore : void 0,
        supportedExtensions: Array.isArray(args?.supportedExtensions) ? args.supportedExtensions : void 0,
        skipIndex: false
      });
      currentConfig = loadConfig(currentConfig.projectRoot);
      isInit = true;
      worker = new IndexerWorker(currentConfig);
      await worker.init();
      watcher = new FileWatcher(currentConfig, worker);
      await watcher.start();
      return {
        content: [
          {
            type: "text",
            text: `\u2705 Code search initialized successfully in ${currentConfig.projectRoot}.
Index path: ${currentConfig.dbPath}
Initial indexing completed.`
          }
        ]
      };
    }
    if (name === "code_search_guide") {
      const guideText = `# Semantic Code Search \u2014 AI Agent Guide

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
            type: "text",
            text: guideText
          }
        ]
      };
    }
    if (name === "code_search") {
      if (!isInit) {
        return {
          content: [
            {
              type: "text",
              text: `\u2139\uFE0F Semantic code search is not initialized for this project (${currentConfig.projectRoot}).

To enable semantic search:
1. Call the 'code_search_init' tool, OR
2. Run 'npx code-search-mcp init' in the project root.`
            }
          ]
        };
      }
      const query = args?.query || "";
      const limit = typeof args?.limit === "number" ? args.limit : 10;
      const pathFilter = typeof args?.pathFilter === "string" ? args.pathFilter : void 0;
      const language = typeof args?.language === "string" ? args.language : void 0;
      const codeOnly = typeof args?.codeOnly === "boolean" ? args.codeOnly : void 0;
      if (!query.trim()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Search query cannot be empty."
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
            type: "text",
            text: res.formattedOutput
          }
        ]
      };
    }
    if (name === "code_search_status") {
      if (!isInit) {
        return {
          content: [
            {
              type: "text",
              text: `Index Status: UNINITIALIZED
Project ${currentConfig.projectRoot} is not initialized. Run code_search_init to begin.`
            }
          ]
        };
      }
      const status = worker.getStatus();
      const text = [
        `Index Status: ${status.state.toUpperCase()}`,
        `Progress: ${status.progressPercentage}%`,
        `Files: ${status.indexedFiles} / ${status.totalFiles} indexed`,
        `Chunks: ${status.indexedChunks} code chunks in LanceDB`,
        status.currentFile ? `Currently indexing: ${status.currentFile}` : null,
        status.lastIndexedAt ? `Last completed: ${new Date(status.lastIndexedAt).toLocaleTimeString()}` : null,
        status.error ? `Error: ${status.error}` : null
      ].filter(Boolean).join("\n");
      return {
        content: [
          {
            type: "text",
            text
          }
        ]
      };
    }
    if (name === "code_search_reindex") {
      if (!isInit) {
        return {
          content: [
            {
              type: "text",
              text: `Project is not initialized. Run code_search_init first.`
            }
          ]
        };
      }
      const forceFull = Boolean(args?.forceFull);
      worker.startIndexing(forceFull).catch((err) => {
        console.error("[code-search-mcp] Reindex error:", err);
      });
      return {
        content: [
          {
            type: "text",
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
    if (isInit) {
      await watcher.start();
      worker.startIndexing().catch((err) => {
        console.error("[code-search-mcp] Initial background index failed:", err);
      });
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

export {
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDES,
  DEFAULT_CONFIG,
  RECOMMENDED_CODESEARCHIGNORE,
  findProjectRoot,
  isProjectInitialized,
  createIgnoreMatcher,
  loadConfig,
  EmbeddingEngine,
  TABLE_NAME,
  VectorStore,
  computeHash,
  normalizePath,
  detectLanguage,
  extractChunkSymbols,
  formatChunkForEmbedding,
  chunkCodeFile,
  scanDirectory,
  IndexerWorker,
  FileWatcher,
  runInit,
  createMcpServer
};
//# sourceMappingURL=chunk-CAKW5ZZ4.js.map