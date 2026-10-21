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
  // Minimal internal safety guards (never index VCS internal metadata, dependencies, build or database folders)
  ".git",
  ".git/**",
  ".code-search",
  ".code-search/**",
  "node_modules",
  "node_modules/**",
  "**/node_modules/**",
  ".cache",
  ".cache/**",
  "dist",
  "dist/**",
  "build",
  "build/**",
  "bin",
  "bin/**",
  "obj",
  "obj/**",
  "target",
  "target/**",
  "coverage",
  "coverage/**",
  ".nyc_output",
  ".nyc_output/**",
  "ios",
  "ios/**",
  "android",
  "android/**",
  // Safe non-source artifacts (lockfiles, minified bundles, source maps, generated files, test snapshots/mocks)
  "package-lock.json",
  "**/package-lock.json",
  "yarn.lock",
  "**/yarn.lock",
  "pnpm-lock.yaml",
  "**/pnpm-lock.yaml",
  "*.min.js",
  "**/*.min.js",
  "*.min.css",
  "**/*.min.css",
  "*-min.js",
  "**/*-min.js",
  "*.map",
  "**/*.map",
  "*.generated.*",
  "**/*.generated.*",
  "**/__snapshots__/**",
  "*.snap",
  "**/__mocks__/**",
  "**/mocks/**",
  "**/fixtures/**"
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

# 1. Dependency directories & package caches
node_modules/**
vendor/**
bower_components/**
.pnpm-store/**

# 2. Build & distribution artifacts
dist/**
dist-*/**
build/**
out/**
bin/**
obj/**
www/**
wwwroot/**
.cache/**
coverage/**
.nyc_output/**

# 3. AI Agent skills, workflows & system prompts
.github/skills/**
.github/instructions/**
.github/prompts/**
.gemini/skills/**
.claude/skills/**
**/skills/**
**/.agents/**

# 4. Test fixtures, snapshots and mocks
**/fixtures/**
**/__snapshots__/**
**/mocks/**
*.snap

# 5. Generated code and type declarations
*.generated.*
*.d.ts.map

# 6. Lock files
package-lock.json
yarn.lock
pnpm-lock.yaml
composer.lock
Gemfile.lock
Cargo.lock
packages.lock.json

# 7. Minified code and source maps
*.min.js
*.min.css
*.map

# 8. Binary assets, archives and OS metadata
*.png
*.jpg
*.jpeg
*.gif
*.ico
*.cur
*.svg
*.woff
*.woff2
*.ttf
*.eot
*.otf
*.mp3
*.mp4
*.wav
*.zip
*.tar
*.gz
*.7z
*.rar
*.pdf
*.exe
*.dll
*.so
*.dylib
*.bin
*.DS_Store
Thumbs.db

# 9. IDE & tooling metadata
.idea/**
.vscode/**
.gemini/**
.claude/**
.codegraph/**
.vectorcode/**
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
function resolveMainWorktreeProjectRoot(projectRoot) {
  let cur = path.resolve(projectRoot);
  while (true) {
    const dotGit = path.join(cur, ".git");
    if (fs.existsSync(dotGit)) {
      try {
        const stat = fs.statSync(dotGit);
        if (stat.isFile()) {
          const content = fs.readFileSync(dotGit, "utf8").trim();
          const match = content.match(/^gitdir:\s*(.+)$/i);
          if (match) {
            const gitDir = path.resolve(cur, match[1].trim());
            const normalizedGitDir = gitDir.replace(/\\/g, "/");
            const worktreesMarker = "/.git/worktrees/";
            const markerIdx = normalizedGitDir.lastIndexOf(worktreesMarker);
            if (markerIdx !== -1) {
              const mainRepoRoot = normalizedGitDir.slice(0, markerIdx);
              const relFromWorktreeRoot = path.relative(cur, path.resolve(projectRoot));
              const candidate = path.join(mainRepoRoot, relFromWorktreeRoot);
              if (fs.existsSync(candidate)) {
                return candidate;
              }
            }
          }
        }
      } catch {
      }
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}
function isGlobalPluginDir(dirPath) {
  const norm = dirPath.replace(/\\/g, "/");
  return norm.includes("/.gemini/config/plugins/") || norm.includes("/.claude/plugins/");
}
function isProjectInitialized(projectRoot) {
  let canonicalRoot = path.resolve(projectRoot);
  try {
    canonicalRoot = fs.realpathSync(canonicalRoot);
  } catch {
  }
  if (isGlobalPluginDir(canonicalRoot)) {
    return false;
  }
  const rcPath = path.join(canonicalRoot, ".codesearchrc.json");
  const dotFolder = path.join(canonicalRoot, ".code-search");
  const nmCache = path.join(canonicalRoot, "node_modules", ".cache", "code-search", "lancedb");
  if (fs.existsSync(rcPath) || fs.existsSync(dotFolder) || fs.existsSync(nmCache)) {
    return true;
  }
  const mainWorktreeRoot = resolveMainWorktreeProjectRoot(canonicalRoot);
  if (mainWorktreeRoot) {
    if (fs.existsSync(path.join(mainWorktreeRoot, ".codesearchrc.json")) || fs.existsSync(path.join(mainWorktreeRoot, ".codesearchignore"))) {
      return true;
    }
  }
  return false;
}
function createIgnoreMatcher(projectRoot, customExcludes = [], respectGitignore = true) {
  const ig = ignore.default ? ignore.default() : ignore();
  ig.add(DEFAULT_EXCLUDES);
  const parentGitignoreMatchers = [];
  if (respectGitignore) {
    let cur = path.resolve(projectRoot);
    while (true) {
      const candidate = path.join(cur, ".gitignore");
      if (fs.existsSync(candidate)) {
        try {
          const content = fs.readFileSync(candidate, "utf8");
          if (cur === path.resolve(projectRoot)) {
            ig.add(content);
          } else {
            const parentIg = ignore.default ? ignore.default() : ignore();
            parentIg.add(content);
            const relPrefix = path.relative(cur, projectRoot).replace(/\\/g, "/");
            parentGitignoreMatchers.push({ relPrefix, matcher: parentIg });
          }
        } catch {
        }
      }
      if (fs.existsSync(path.join(cur, ".git"))) {
        break;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
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
  } else {
    const mainWorktreeRoot = resolveMainWorktreeProjectRoot(projectRoot);
    if (mainWorktreeRoot) {
      const mainIgnorePath = path.join(mainWorktreeRoot, ".codesearchignore");
      if (fs.existsSync(mainIgnorePath)) {
        try {
          const content = fs.readFileSync(mainIgnorePath, "utf8");
          ig.add(content);
        } catch {
        }
      }
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
      for (const { relPrefix, matcher } of parentGitignoreMatchers) {
        const pathFromParent = relPrefix ? `${relPrefix}/${normalized}` : normalized;
        if (matcher.ignores(pathFromParent)) return true;
        if (isDirectory && matcher.ignores(pathFromParent + "/")) return true;
      }
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
  let configPath = path.join(canonicalRoot, ".codesearchrc.json");
  if (!fs.existsSync(configPath)) {
    const mainWorktreeRoot = resolveMainWorktreeProjectRoot(canonicalRoot);
    if (mainWorktreeRoot) {
      const mainRcPath = path.join(mainWorktreeRoot, ".codesearchrc.json");
      if (fs.existsSync(mainRcPath)) {
        configPath = mainRcPath;
      }
    }
  }
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
  idleTimer = null;
  idleTimeoutMs = 2 * 60 * 1e3;
  // Auto-release ONNX after 2 min idle
  constructor(modelName = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }
  static getInstance(modelName) {
    if (!_EmbeddingEngine.instance || modelName && _EmbeddingEngine.instance.modelName !== modelName) {
      _EmbeddingEngine.instance = new _EmbeddingEngine(modelName);
    }
    return _EmbeddingEngine.instance;
  }
  scheduleIdleUnload() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(async () => {
      this.idleTimer = null;
      const currentPromise = this.extractorPromise;
      this.extractorPromise = null;
      if (currentPromise) {
        try {
          const extractor = await currentPromise;
          await extractor?.dispose?.();
        } catch {
        }
      }
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }
  async getExtractor() {
    this.scheduleIdleUnload();
    if (!this.extractorPromise) {
      const configuredThreads = Number(process.env.CODE_SEARCH_THREADS) || 2;
      this.extractorPromise = pipeline("feature-extraction", this.modelName, {
        dtype: "q8",
        session_options: {
          intraOpNumThreads: configuredThreads,
          interOpNumThreads: 1,
          executionMode: "sequential"
        }
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
  async embedBatch(texts, batchSize = 16, interSliceDelayMs = 0) {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const results = new Array(texts.length);
    const indexed = texts.map((t, idx) => ({
      idx,
      clean: t.replace(/\r?\n/g, " ").slice(0, 2048)
    }));
    indexed.sort((a, b) => a.clean.length - b.clean.length);
    for (let i = 0; i < indexed.length; i += batchSize) {
      const sliceItems = indexed.slice(i, i + batchSize);
      const batch = sliceItems.map((item) => item.clean);
      const output = await extractor(batch, {
        pooling: "mean",
        normalize: true
      });
      const batchDim = output.dims ? output.dims[1] : Math.round(output.data.length / batch.length);
      for (let j = 0; j < sliceItems.length; j++) {
        const vector = Array.from(output.data.slice(j * batchDim, (j + 1) * batchDim));
        results[sliceItems[j].idx] = vector;
      }
      if (i + batchSize < indexed.length) {
        if (interSliceDelayMs > 0) {
          await new Promise((resolve5) => setTimeout(resolve5, interSliceDelayMs));
        } else {
          await new Promise((resolve5) => setImmediate(resolve5));
        }
      }
    }
    return results;
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
var MAX_VOCABULARY_SIZE = 15e3;
var QueryEnhancer = class {
  vocabulary = /* @__PURE__ */ new Set();
  lowerToWord = /* @__PURE__ */ new Map();
  addWords(text) {
    if (this.vocabulary.size >= MAX_VOCABULARY_SIZE) return;
    const slice = text.length > 2048 ? text.slice(0, 2048) : text;
    const rawTokens = slice.split(/[^a-zA-Z0-9_$]+/);
    for (const t of rawTokens) {
      if (this.vocabulary.size >= MAX_VOCABULARY_SIZE) break;
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
    if (this.vocabulary.size >= MAX_VOCABULARY_SIZE && !this.vocabulary.has(word)) {
      return;
    }
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
      if (chunk.filePath) this.queryEnhancer.addWords(chunk.filePath);
      if (chunk.content) {
        const symbols = extractChunkSymbols(chunk.content, chunk.language);
        for (const sym of symbols) {
          this.queryEnhancer.addWords(sym);
        }
      }
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
  async createVectorIndex() {
    const table = this.ensureTable();
    const rowCount = await table.countRows();
    if (rowCount < 256) return;
    try {
      await table.createIndex("vector", { replace: true });
    } catch (err) {
      console.warn("[code-search-mcp] Notice: Could not build IVF-PQ vector index:", err);
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
    const searchTokens = Array.from(tokenSet).slice(0, 8);
    const pathClauses = searchTokens.map((token) => {
      const escaped = token.replace(/'/g, "''").replace(/\\/g, "\\\\").toLowerCase();
      return `LOWER(\`filePath\`) LIKE '%${escaped}%'`;
    });
    const isJsonQuery = queryText.toLowerCase().includes("json");
    try {
      const whereClause = pathClauses.join(" OR ");
      const records = await table.query().where(whereClause).limit(limit * 2).toArray();
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
        let score = Math.min(0.85, matchCount * 0.05);
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
    if (vectorHits.length === 0) {
      return lexicalHits.slice(0, limit);
    }
    const isJsonQuery = queryText.toLowerCase().includes("json");
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
    const queryTokens = queryText.split(/[\s,;:!?()[\]{}<>"'`]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && !stopWords.has(t));
    const combinedMap = /* @__PURE__ */ new Map();
    for (const hit of vectorHits) {
      const key = `${hit.filePath}:${hit.startLine}:${hit.endLine}`;
      const lowerContent = (hit.content || "").toLowerCase();
      const lowerPath = hit.filePath.toLowerCase();
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (lowerPath.includes(token) || lowerContent.includes(token)) {
          matchedTokens++;
        }
      }
      const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
      let finalScore = hit.score * 0.6 + matchRatio * 0.4;
      if (!isJsonQuery && (hit.filePath.endsWith(".json") || hit.language === "json")) {
        finalScore *= 0.6;
      }
      const isConfigOrLoggerFile = /(config|logger|startup|program|settings|assemblyinfo)\b/i.test(hit.filePath);
      const queryExplicitlyWantsConfig = /(config|logger|logging|startup|program|settings|setup|env)\b/i.test(queryText);
      if (isConfigOrLoggerFile && !queryExplicitlyWantsConfig) {
        finalScore *= 0.75;
      }
      if (hit.filePath.startsWith("src/") || hit.filePath.startsWith("app/") || hit.filePath.startsWith("lib/")) {
        finalScore = Math.min(1, finalScore * 1.05);
      }
      combinedMap.set(key, {
        result: {
          ...hit,
          score: Number(finalScore.toFixed(4))
        },
        finalScore
      });
    }
    for (const lex of lexicalHits) {
      const key = `${lex.filePath}:${lex.startLine}:${lex.endLine}`;
      const existing = combinedMap.get(key);
      if (existing) {
        existing.finalScore = Math.min(1, existing.finalScore + lex.score * 0.3);
        existing.result.score = Number(existing.finalScore.toFixed(4));
      } else {
        combinedMap.set(key, {
          result: lex,
          finalScore: lex.score
        });
      }
    }
    return Array.from(combinedMap.values()).sort((a, b) => b.finalScore - a.finalScore).map((item) => item.result).slice(0, limit);
  }
  normalizeLanguage(lang) {
    const l = lang.toLowerCase().trim().replace(/^\./, "");
    switch (l) {
      case "ts":
      case "tsx":
      case "typescript":
        return "typescript";
      case "js":
      case "jsx":
      case "javascript":
      case "mjs":
      case "cjs":
        return "javascript";
      case "vue":
        return "vue";
      case "svelte":
        return "svelte";
      case "cs":
      case "c#":
      case "csharp":
        return "csharp";
      case "py":
      case "python":
        return "python";
      case "md":
      case "markdown":
      case "mdx":
        return "markdown";
      case "golang":
      case "go":
        return "go";
      case "rs":
      case "rust":
        return "rust";
      case "cpp":
      case "c++":
      case "c":
        return "cpp";
      default:
        return l;
    }
  }
  applyFilters(results, options, queryText) {
    if (!options) return results;
    let filtered = results;
    if (options.pathFilter) {
      const pf = options.pathFilter.toLowerCase().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/$/, "");
      if (pf) {
        filtered = filtered.filter((r) => r.filePath.toLowerCase().includes(pf));
      }
    }
    if (options.language) {
      const targetLang = this.normalizeLanguage(options.language);
      filtered = filtered.filter((r) => this.normalizeLanguage(r.language || "") === targetLang);
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
    const fetchLimit = opts.pathFilter || opts.language || opts.codeOnly ? Math.max(limit * 10, 100) : Math.max(limit * 3, 30);
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
        if (!rec.filePath) continue;
        const existing = map.get(rec.filePath);
        if (!existing) {
          const chunkHashes = /* @__PURE__ */ new Set();
          if (rec.contentHash) chunkHashes.add(rec.contentHash);
          map.set(rec.filePath, {
            updatedAt: rec.updatedAt || 0,
            contentHash: rec.contentHash || "",
            chunkHashes,
            chunkCount: 1
          });
        } else {
          if (rec.updatedAt && rec.updatedAt > existing.updatedAt) {
            existing.updatedAt = rec.updatedAt;
          }
          if (rec.contentHash) {
            existing.chunkHashes.add(rec.contentHash);
          }
          existing.chunkCount++;
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

// src/logger.ts
import * as fs4 from "fs";
import * as path4 from "path";
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
      if (!fs4.existsSync(baseDir)) {
        fs4.mkdirSync(baseDir, { recursive: true });
      }
      this.logFilePath = path4.join(baseDir, "code-search.log");
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
      if (fs4.existsSync(this.logFilePath)) {
        const stat = fs4.statSync(this.logFilePath);
        if (stat.size > this.maxSizeBytes) {
          const oldPath = `${this.logFilePath}.1`;
          try {
            if (fs4.existsSync(oldPath)) fs4.unlinkSync(oldPath);
            fs4.renameSync(this.logFilePath, oldPath);
          } catch {
          }
        }
      }
      fs4.appendFileSync(this.logFilePath, line, "utf8");
    } catch {
    }
  }
};
var logger = Logger.getInstance();

// src/indexer/worker.ts
import * as fs6 from "fs";
import * as os from "os";
import * as path6 from "path";

// src/indexer/lock.ts
import * as fs5 from "fs";
import * as path5 from "path";
var ProcessLock = class {
  lockFilePath;
  hasLock = false;
  constructor(lockDir) {
    this.lockFilePath = path5.join(lockDir, ".indexer.lock");
  }
  acquire() {
    try {
      if (!fs5.existsSync(path5.dirname(this.lockFilePath))) {
        fs5.mkdirSync(path5.dirname(this.lockFilePath), { recursive: true });
      }
      if (fs5.existsSync(this.lockFilePath)) {
        const rawPid = fs5.readFileSync(this.lockFilePath, "utf8").trim();
        const existingPid = parseInt(rawPid, 10);
        if (!isNaN(existingPid) && existingPid !== process.pid && this.isPidAlive(existingPid)) {
          return false;
        }
      }
      fs5.writeFileSync(this.lockFilePath, String(process.pid), "utf8");
      this.hasLock = true;
      return true;
    } catch {
      return false;
    }
  }
  release() {
    if (this.hasLock) {
      try {
        if (fs5.existsSync(this.lockFilePath)) {
          const rawPid = fs5.readFileSync(this.lockFilePath, "utf8").trim();
          if (parseInt(rawPid, 10) === process.pid) {
            fs5.unlinkSync(this.lockFilePath);
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
  queuedIndexing = false;
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
  isInitialized = false;
  saveStatusSnapshot() {
    try {
      if (!fs6.existsSync(this.config.dbPath)) {
        fs6.mkdirSync(this.config.dbPath, { recursive: true });
      }
      const statusFilePath = path6.join(this.config.dbPath, "status.json");
      const data = JSON.stringify(
        {
          ...this.status,
          pid: process.pid,
          updatedAt: Date.now()
        },
        null,
        2
      );
      fs6.writeFileSync(statusFilePath, data, "utf8");
    } catch {
    }
  }
  async init() {
    if (this.isInitialized) return;
    const localTableDir = path6.join(this.config.dbPath, "code_chunks.lance");
    if (!fs6.existsSync(localTableDir)) {
      const mainWorktreeRoot = resolveMainWorktreeProjectRoot(this.config.projectRoot);
      if (mainWorktreeRoot) {
        try {
          const mainConfig = loadConfig(mainWorktreeRoot);
          const mainTableDir = path6.join(mainConfig.dbPath, "code_chunks.lance");
          if (fs6.existsSync(mainTableDir)) {
            fs6.mkdirSync(this.config.dbPath, { recursive: true });
            fs6.cpSync(mainTableDir, localTableDir, { recursive: true });
            logger.info("Seeded worktree LanceDB index from main repository", {
              from: mainTableDir,
              to: localTableDir
            });
          }
        } catch {
        }
      }
    }
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
    this.isInitialized = true;
    this.saveStatusSnapshot();
  }
  getStatus() {
    return { ...this.status };
  }
  async startIndexing(optionsOrForceFull = false, onProgress) {
    const options = typeof optionsOrForceFull === "boolean" ? { forceFull: optionsOrForceFull, mode: "gentle" } : { mode: "gentle", ...optionsOrForceFull };
    const forceFull = Boolean(options.forceFull);
    const mode = options.mode || "gentle";
    const batchDelayMs = options.batchDelayMs !== void 0 ? options.batchDelayMs : mode === "gentle" ? 50 : 0;
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.isRunning) {
      this.queuedIndexing = true;
      return;
    }
    if (!this.lock.acquire()) {
      const statusFile = path6.join(this.config.dbPath, "status.json");
      if (fs6.existsSync(statusFile)) {
        try {
          const raw = JSON.parse(fs6.readFileSync(statusFile, "utf8"));
          this.status = {
            state: raw.state || "indexing",
            progressPercentage: raw.progressPercentage ?? 0,
            indexedFiles: raw.indexedFiles ?? 0,
            totalFiles: raw.totalFiles ?? 0,
            indexedChunks: raw.indexedChunks ?? 0,
            currentFile: raw.currentFile,
            lastIndexedAt: raw.lastIndexedAt,
            error: raw.error
          };
          onProgress?.({ ...this.status });
          return;
        } catch {
        }
      }
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
    const indexingStartTime = Date.now();
    let prevPriority = null;
    if (mode === "gentle") {
      try {
        prevPriority = os.getPriority(process.pid);
        os.setPriority(process.pid, 10);
      } catch {
      }
    }
    try {
      this.status.state = "scanning";
      this.status.error = void 0;
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
      if (forceFull) {
        await this.store.clear();
      }
      const indexedFilesMap = forceFull ? /* @__PURE__ */ new Map() : await this.store.getIndexedFileStats();
      const scan = await scanDirectory(this.config, indexedFilesMap);
      if (scan.filesToDelete.length > 0) {
        await this.store.deleteByFilePaths(scan.filesToDelete);
      }
      this.status.totalFiles = scan.totalFilesCount;
      this.status.indexedFiles = scan.unchangedFilesCount;
      this.status.progressPercentage = scan.totalFilesCount === 0 ? 100 : Math.round(scan.unchangedFilesCount / scan.totalFilesCount * 100);
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
      if (scan.filesToIndex.length === 0) {
        this.status.state = "ready";
        this.status.progressPercentage = 100;
        this.status.lastIndexedAt = Date.now();
        this.status.indexedChunks = await this.store.count();
        this.isRunning = false;
        this.saveStatusSnapshot();
        onProgress?.({ ...this.status });
        return;
      }
      logger.info("Indexing started", {
        mode,
        forceFull,
        totalFiles: scan.totalFilesCount,
        filesToIndex: scan.filesToIndex.length,
        unchangedFiles: scan.unchangedFilesCount,
        deletedFiles: scan.filesToDelete.length
      });
      this.status.state = "indexing";
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
      let processedInScan = 0;
      let skippedByContentHash = 0;
      const batchSize = Math.min(this.config.batchSize, mode === "gentle" ? 8 : this.config.batchSize);
      const onnxMicroBatchSize = mode === "gentle" ? 8 : 16;
      const onnxInterSliceDelayMs = options.batchDelayMs !== void 0 ? Math.min(options.batchDelayMs, 25) : mode === "gentle" ? 35 : 0;
      for (let i = 0; i < scan.filesToIndex.length; i += batchSize) {
        const batchStartMs = Date.now();
        const batch = scan.filesToIndex.slice(i, i + batchSize);
        const batchChunks = [];
        const batchRelPaths = [];
        for (const file of batch) {
          this.status.currentFile = file.relativePath;
          try {
            if (fs6.existsSync(file.absolutePath)) {
              const content = fs6.readFileSync(file.absolutePath, "utf8");
              const fileChunks = chunkCodeFile(file.relativePath, file.absolutePath, content);
              const prevStats = indexedFilesMap.get(file.relativePath);
              if (prevStats && prevStats.chunkHashes && prevStats.chunkCount === fileChunks.length && fileChunks.length > 0 && fileChunks.every((c) => prevStats.chunkHashes.has(c.contentHash))) {
                skippedByContentHash++;
                continue;
              }
              batchRelPaths.push(file.relativePath);
              batchChunks.push(...fileChunks);
            } else {
              batchRelPaths.push(file.relativePath);
            }
          } catch (fileErr) {
            console.warn(`[code-search-mcp] Failed to read ${file.relativePath}:`, fileErr);
          }
        }
        if (batchChunks.length > 0) {
          const texts = batchChunks.map((c) => formatChunkForEmbedding(c));
          const vectors = await this.embeddings.embedBatch(texts, onnxMicroBatchSize, onnxInterSliceDelayMs);
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
        this.saveStatusSnapshot();
        onProgress?.({ ...this.status });
        await new Promise((resolve5) => setImmediate(resolve5));
        if (i + batchSize < scan.filesToIndex.length && batchChunks.length > 0) {
          const batchElapsedMs = Date.now() - batchStartMs;
          const effectiveDelayMs = options.batchDelayMs !== void 0 ? options.batchDelayMs : mode === "gentle" ? Math.min(1200, Math.max(150, Math.round(batchElapsedMs * 0.6))) : 0;
          if (effectiveDelayMs > 0) {
            await new Promise((resolve5) => setTimeout(resolve5, effectiveDelayMs));
          }
        }
      }
      this.status.state = "ready";
      this.status.progressPercentage = 100;
      this.status.lastIndexedAt = Date.now();
      this.status.currentFile = void 0;
      this.status.indexedChunks = await this.store.count();
      if (this.status.indexedChunks >= 256) {
        await this.store.createVectorIndex().catch(() => {
        });
      }
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
      logger.info("Indexing completed", {
        mode,
        indexedFiles: this.status.indexedFiles,
        indexedChunks: this.status.indexedChunks,
        skippedByContentHash,
        durationMs: Date.now() - indexingStartTime
      });
    } catch (err) {
      this.status.state = "error";
      this.status.error = err?.message || String(err);
      logger.error("Indexing worker error", { error: this.status.error });
      console.error("[code-search-mcp] Indexing worker error:", err);
      this.saveStatusSnapshot();
      onProgress?.({ ...this.status });
    } finally {
      if (prevPriority !== null) {
        try {
          os.setPriority(process.pid, prevPriority);
        } catch {
        }
      }
      this.isRunning = false;
      this.lock.release();
      this.saveStatusSnapshot();
      if (this.queuedIndexing) {
        this.queuedIndexing = false;
        void this.startIndexing({ forceFull: false, mode: "gentle" });
      }
    }
  }
  async indexSingleFile(relativePath, absolutePath) {
    if (!this.isInitialized) {
      await this.init();
    }
    const absPath = absolutePath || path6.join(this.config.projectRoot, relativePath);
    const normRelPath = normalizePath(relativePath);
    if (!fs6.existsSync(absPath)) {
      await this.store.deleteByFilePath(normRelPath);
      return;
    }
    const content = fs6.readFileSync(absPath, "utf8");
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
    if (!this.isInitialized) {
      await this.init();
    }
    const normRelPath = normalizePath(relativePath);
    await this.store.deleteByFilePath(normRelPath);
  }
  async removeFiles(relativePaths) {
    if (!this.isInitialized) {
      await this.init();
    }
    if (relativePaths.length === 0) return;
    const normPaths = relativePaths.map((p) => normalizePath(p));
    await this.store.deleteByFilePaths(normPaths);
  }
  async query(queryText, options) {
    if (!this.isInitialized) {
      await this.init();
    }
    const opts = typeof options === "number" ? { limit: options } : options || {};
    const SEARCH_TIMEOUT_MS = 5e3;
    const executeSearch = async () => {
      const queryVector = await this.embeddings.embedText(queryText);
      return await this.store.search(queryVector, opts, queryText);
    };
    const timeoutFallback = new Promise((resolve5) => {
      const timer = setTimeout(async () => {
        try {
          const lexicalOnly = await this.store.searchLexical(queryText, opts.limit || 10);
          resolve5(lexicalOnly);
        } catch {
          resolve5([]);
        }
      }, SEARCH_TIMEOUT_MS);
      timer.unref?.();
    });
    const results = await Promise.race([executeSearch(), timeoutFallback]);
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
import * as fs7 from "fs";
import * as path7 from "path";
var FileWatcher = class {
  config;
  worker;
  watcher = null;
  supportedExts;
  matcher;
  // Burst and batch queue state
  pendingUpdates = /* @__PURE__ */ new Map();
  pendingDeletes = /* @__PURE__ */ new Set();
  debounceTimer = null;
  firstEventTime = 0;
  isProcessing = false;
  debounceMs = 350;
  maxDebounceMs = 1500;
  burstThreshold = 15;
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
          const rel = normalizePath(path7.relative(this.config.projectRoot, filePath));
          if (!rel || rel === ".") return false;
          if (rel.startsWith("node_modules") || rel.startsWith(".git") || rel.startsWith(".code-search") || rel.includes("/node_modules/") || rel.startsWith("dist") || rel.startsWith("build") || rel.startsWith(".cache")) {
            return true;
          }
          const isDir = stats ? typeof stats.isDirectory === "function" ? stats.isDirectory() : false : false;
          return this.matcher.ignores(rel, isDir) || this.matcher.ignores(rel + "/");
        },
        persistent: true,
        ignoreInitial: true
      });
      this.watcher.on("ready", () => {
        resolve5();
      });
      this.watcher.on("error", (err) => {
        console.warn("[code-search-mcp] File watcher encountered error:", err?.message || err);
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
    const ext = path7.extname(filePath).toLowerCase();
    if (!this.supportedExts.has(ext)) return;
    let absPath = path7.resolve(filePath);
    try {
      absPath = fs7.realpathSync(absPath);
    } catch {
    }
    const relPath = normalizePath(path7.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith("..") || this.matcher.ignores(relPath)) return;
    this.pendingDeletes.delete(relPath);
    this.pendingUpdates.set(relPath, absPath);
    this.scheduleFlush();
  }
  handleFileUnlink(filePath) {
    let absPath = path7.resolve(filePath);
    try {
      absPath = fs7.realpathSync(absPath);
    } catch {
    }
    const relPath = normalizePath(path7.relative(this.config.projectRoot, absPath));
    if (!relPath || relPath.startsWith("..")) return;
    this.pendingUpdates.delete(relPath);
    this.pendingDeletes.add(relPath);
    this.scheduleFlush();
  }
  scheduleFlush() {
    const now = Date.now();
    if (this.firstEventTime === 0) {
      this.firstEventTime = now;
    }
    const elapsed = now - this.firstEventTime;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const remaining = Math.max(0, this.maxDebounceMs - elapsed);
    const delay = Math.min(this.debounceMs, remaining);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.firstEventTime = 0;
      void this.flushPending();
    }, delay);
  }
  async flushPending() {
    if (this.isProcessing) {
      this.scheduleFlush();
      return;
    }
    const updates = new Map(this.pendingUpdates);
    const deletes = new Set(this.pendingDeletes);
    this.pendingUpdates.clear();
    this.pendingDeletes.clear();
    const totalCount = updates.size + deletes.size;
    if (totalCount === 0) return;
    this.isProcessing = true;
    try {
      if (totalCount > this.burstThreshold) {
        await this.worker.startIndexing({ forceFull: false, mode: "gentle" });
      } else {
        if (deletes.size > 0) {
          await this.worker.removeFiles(Array.from(deletes));
        }
        for (const [relPath, absPath] of updates.entries()) {
          try {
            await this.worker.indexSingleFile(relPath, absPath);
          } catch (err) {
            console.warn(`[code-search-mcp] Failed to incrementally index ${relPath}:`, err);
          }
          await new Promise((resolve5) => setImmediate(resolve5));
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.pendingUpdates.size > 0 || this.pendingDeletes.size > 0) {
        this.scheduleFlush();
      }
    }
  }
  async stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.firstEventTime = 0;
    this.pendingUpdates.clear();
    this.pendingDeletes.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
};

// src/cli/init.ts
import * as fs9 from "fs";
import * as path9 from "path";
import { select, confirm, input } from "@inquirer/prompts";

// src/cli/detector.ts
import * as fs8 from "fs";
import * as path8 from "path";
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
  const canonicalRoot = path8.resolve(projectRoot);
  const respectGitignore = options.respectGitignore ?? true;
  const maxFiles = options.maxFilesToSample ?? 5e4;
  const matcher = createIgnoreMatcher(canonicalRoot, [], respectGitignore);
  const counts = {};
  let totalFiles = 0;
  function walk(currentDir) {
    if (totalFiles >= maxFiles) return;
    let entries;
    try {
      entries = fs8.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (totalFiles >= maxFiles) break;
      const fullPath = path8.join(currentDir, entry.name);
      const relPath = normalizePath(path8.relative(canonicalRoot, fullPath));
      const isDir = entry.isDirectory();
      if (matcher.ignores(relPath, isDir)) {
        continue;
      }
      if (isDir) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path8.extname(entry.name).toLowerCase();
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
function detectIgnoreCandidates(projectRoot) {
  const root = path8.resolve(projectRoot);
  const found = /* @__PURE__ */ new Map();
  const directChecks = [
    { pattern: ".github/skills", glob: ".github/skills/**", label: ".github/skills/** (AI agent skills)" },
    { pattern: ".github/instructions", glob: ".github/instructions/**", label: ".github/instructions/** (AI instructions)" },
    { pattern: ".github/prompts", glob: ".github/prompts/**", label: ".github/prompts/** (AI prompts)" },
    { pattern: ".gemini/skills", glob: ".gemini/skills/**", label: ".gemini/skills/** (AI agent skills)" },
    { pattern: ".claude/skills", glob: ".claude/skills/**", label: ".claude/skills/** (AI agent skills)" },
    { pattern: "cypress", glob: "cypress/**", label: "cypress/** (Cypress tests & fixtures)" },
    { pattern: "docs", glob: "docs/**", label: "docs/** (Documentation markdown)" }
  ];
  for (const check of directChecks) {
    if (fs8.existsSync(path8.join(root, check.pattern))) {
      found.set(check.glob, { path: check.glob, label: check.label, exists: true });
    }
  }
  const targetDirNames = {
    skills: { glob: "**/skills/**", label: "**/skills/** (AI agent skills)" },
    fixtures: { glob: "**/fixtures/**", label: "**/fixtures/** (Test fixtures)" },
    mocks: { glob: "**/mocks/**", label: "**/mocks/** (Mock data & stubs)" },
    __snapshots__: { glob: "**/__snapshots__/**", label: "**/__snapshots__/** (Test snapshots)" },
    e2e: { glob: "**/e2e/**", label: "**/e2e/** (End-to-end test suites)" },
    locales: { glob: "**/locales/**", label: "**/locales/** (Localization dictionaries)" },
    strings: { glob: "**/strings/**", label: "**/strings/** (Localization strings)" },
    i18n: { glob: "**/i18n/**", label: "**/i18n/** (Translation files)" }
  };
  function scanDirs(dir, depth) {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs8.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name.toLowerCase();
        if (name === "node_modules" || name === ".git" || name === "dist" || name === "build" || name === ".code-search") {
          continue;
        }
        if (targetDirNames[name]) {
          const match = targetDirNames[name];
          found.set(match.glob, { path: match.glob, label: match.label, exists: true });
        }
        scanDirs(path8.join(dir, entry.name), depth + 1);
      }
    }
  }
  scanDirs(root, 0);
  return Array.from(found.values());
}

// src/cli/init.ts
async function runInit(options = {}) {
  const targetDir = options.projectRoot ? path9.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs9.realpathSync(targetDir);
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
  const hasNodeModules = fs9.existsSync(path9.join(canonicalRoot, "node_modules"));
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
  const ignoreFilePath = path9.join(canonicalRoot, ".codesearchignore");
  const ignoreFileExists = fs9.existsSync(ignoreFilePath);
  let createIgnoreFile = options.createIgnoreFile ?? !ignoreFileExists;
  let extraCustomExcludes = [];
  if (isInteractive && options.createIgnoreFile === void 0) {
    const candidateFolders = detectIgnoreCandidates(canonicalRoot);
    if (candidateFolders.length > 0) {
      console.log("\n\u{1F9F9} Detected project folders suitable for exclusion:");
      for (const cand of candidateFolders) {
        console.log(`   \u2022 ${cand.label}`);
      }
      console.log("");
    }
    if (!ignoreFileExists) {
      createIgnoreFile = await confirm({
        message: "Create a .codesearchignore file with recommended excludes (agent skills, fixtures, mocks, builds)?",
        default: true
      });
    } else {
      createIgnoreFile = false;
    }
    const wantCustomExcludes = await confirm({
      message: "Add custom folder/pattern excludes to configuration now?",
      default: false
    });
    if (wantCustomExcludes) {
      const customInput = await input({
        message: "Enter comma-separated glob patterns to exclude (e.g. legacy/**, vendor/**, src/strings/**):",
        default: ""
      });
      extraCustomExcludes = customInput.split(",").map((p) => p.trim()).filter(Boolean);
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
    const fullDbPath = path9.isAbsolute(chosenIndexPath) ? chosenIndexPath : path9.join(canonicalRoot, chosenIndexPath);
    if (fs9.existsSync(fullDbPath)) {
      try {
        fs9.rmSync(fullDbPath, { recursive: true, force: true });
      } catch {
      }
    }
  }
  const gitignorePath = path9.join(canonicalRoot, ".gitignore");
  if (fs9.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs9.readFileSync(gitignorePath, "utf8");
      const relIndexPath = chosenIndexPath.replace(/\\/g, "/");
      if (!relIndexPath.startsWith("node_modules") && !gitignoreContent.includes(".code-search")) {
        const toAppend = "\n# code-search vector database index\n.code-search/\n";
        fs9.appendFileSync(gitignorePath, toAppend, "utf8");
        if (isInteractive) {
          console.log("\u{1F6E1} Added .code-search/ to .gitignore");
        }
      }
    } catch {
    }
  }
  const rcPath = path9.join(canonicalRoot, ".codesearchrc.json");
  const rcContent = {
    $schema: "https://raw.githubusercontent.com/genautkin/code-search-mcp/main/schema.json",
    version: 1,
    indexPath: chosenIndexPath,
    respectGitignore,
    supportedExtensions,
    customExcludes: extraCustomExcludes,
    maxFileSizeKb: DEFAULT_CONFIG.maxFileSizeKb,
    embeddingModel: DEFAULT_CONFIG.embeddingModel
  };
  fs9.writeFileSync(rcPath, JSON.stringify(rcContent, null, 2) + "\n", "utf8");
  if (isInteractive) {
    console.log(`\u2705 Saved configuration to ${rcPath}`);
  }
  if (createIgnoreFile && !fs9.existsSync(ignoreFilePath)) {
    fs9.writeFileSync(ignoreFilePath, RECOMMENDED_CODESEARCHIGNORE, "utf8");
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
    await worker.startIndexing({ forceFull: cleanExisting, mode: "fast" });
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
import * as path10 from "path";
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
  let initPromise = null;
  const ensureInitialized = async () => {
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
      name: "code-search-mcp",
      version: "0.2.1"
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
          description: "PRIMARY CODEBASE DISCOVERY TOOL \u2014 Call `code_search` FIRST before running multiple `grep` or file-search calls when locating features, domain logic, UI components, services, or business rules, or when you do not know the exact file path or symbol name. Uses a pre-indexed Hybrid engine (semantic vectors + CamelCase/snake_case identifier splitting + typo-tolerant symbol matching) to return the top ranked code snippets with exact file paths and line numbers in a single <50ms call. Supports filtering by directory (`pathFilter`), `language`, or `codeOnly: true` (to exclude markdown docs).",
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
          description: "Trigger a re-index of the repository. Defaults to fast mode when manually requested.",
          inputSchema: {
            type: "object",
            properties: {
              forceFull: {
                type: "boolean",
                description: "If true, clears existing vector database and rebuilds index from scratch"
              },
              mode: {
                type: "string",
                enum: ["fast", "gentle"],
                description: 'Indexing mode: "fast" (default for manual trigger) or "gentle" (low-CPU background mode)'
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
      logger.init(path10.dirname(currentConfig.dbPath));
      logger.info("Project initialized via code_search_init", {
        projectRoot: currentConfig.projectRoot,
        dbPath: currentConfig.dbPath
      });
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
      await ensureInitialized();
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
      const t0 = Date.now();
      const res = await worker.query(query, {
        limit,
        pathFilter,
        language,
        codeOnly
      });
      logger.info("Tool call: code_search", {
        query,
        limit,
        pathFilter,
        language,
        codeOnly,
        resultsCount: res.results.length,
        indexState: res.status.state,
        durationMs: Date.now() - t0
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
      logger.info("Tool call: code_search_status", {
        state: status.state,
        progressPercentage: status.progressPercentage,
        indexedFiles: status.indexedFiles,
        totalFiles: status.totalFiles
      });
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
      await ensureInitialized();
      const forceFull = Boolean(args?.forceFull);
      const mode = args?.mode || "fast";
      logger.info("Tool call: code_search_reindex", { forceFull, mode });
      worker.startIndexing({ forceFull, mode }).catch((err) => {
        console.error("[code-search-mcp] Reindex error:", err);
      });
      return {
        content: [
          {
            type: "text",
            text: `Indexing started in background (mode: ${mode}, forceFull: ${forceFull}). Use code_search_status to monitor progress.`
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
      } catch {
      }
      process.exit(0);
    };
    server.onerror = (err) => {
      if (err?.code === "EPIPE" || err?.code === "ERR_STREAM_DESTROYED") {
        process.exit(0);
      }
    };
    transport.onclose = async () => {
      try {
        await watcher.stop();
      } catch {
      }
      process.exit(0);
    };
    transport.onerror = (err) => {
      if (err?.code === "EPIPE" || err?.code === "ERR_STREAM_DESTROYED") {
        process.exit(0);
      }
    };
    await server.connect(transport);
    if (isInit) {
      void (async () => {
        try {
          await ensureInitialized();
          await watcher.start();
          await worker.startIndexing({ forceFull: false, mode: "gentle" });
        } catch {
        }
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

export {
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDES,
  DEFAULT_CONFIG,
  RECOMMENDED_CODESEARCHIGNORE,
  findProjectRoot,
  resolveMainWorktreeProjectRoot,
  isGlobalPluginDir,
  isProjectInitialized,
  createIgnoreMatcher,
  loadConfig,
  EmbeddingEngine,
  computeHash,
  normalizePath,
  detectLanguage,
  extractChunkSymbols,
  formatChunkForEmbedding,
  chunkCodeFile,
  TABLE_NAME,
  VectorStore,
  scanDirectory,
  logger,
  IndexerWorker,
  FileWatcher,
  runInit,
  createMcpServer
};
//# sourceMappingURL=chunk-ATMT4WQC.js.map