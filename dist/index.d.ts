import { Server } from '@modelcontextprotocol/sdk/server/index.js';

interface CodeSearchConfig {
    projectRoot: string;
    dbPath: string;
    embeddingModel: string;
    batchSize: number;
    maxFileSizeKb: number;
    supportedExtensions: string[];
    customExcludes: string[];
    respectGitignore: boolean;
    queryMultiplier: number;
    searchEf: number;
}
interface ExtensionDetectionResult {
    extensions: string[];
    counts: Record<string, number>;
    totalFiles: number;
}
interface InitOptions {
    projectRoot?: string;
    yes?: boolean;
    clean?: boolean;
    indexPath?: string;
    respectGitignore?: boolean;
    createIgnoreFile?: boolean;
    supportedExtensions?: string[];
    skipIndex?: boolean;
}
interface CodeChunk {
    id: string;
    filePath: string;
    absolutePath: string;
    startLine: number;
    endLine: number;
    content: string;
    contentHash: string;
    vector?: number[];
    language?: string;
    updatedAt: number;
}
interface SearchResult {
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    score: number;
    language?: string;
}
interface SearchOptions {
    limit?: number;
    pathFilter?: string;
    language?: string;
    codeOnly?: boolean;
}
type IndexingState = 'idle' | 'scanning' | 'indexing' | 'ready' | 'error';
interface IndexStatus {
    state: IndexingState;
    progressPercentage: number;
    indexedFiles: number;
    totalFiles: number;
    indexedChunks: number;
    currentFile?: string;
    lastIndexedAt?: number;
    error?: string;
}
interface ScannedFile {
    relativePath: string;
    absolutePath: string;
    mtimeMs: number;
    sizeBytes: number;
}
interface ScanResult {
    filesToIndex: ScannedFile[];
    filesToDelete: string[];
    unchangedFilesCount: number;
    totalFilesCount: number;
}

declare const DEFAULT_EXTENSIONS: string[];
declare const DEFAULT_EXCLUDES: string[];
declare const DEFAULT_CONFIG: {
    embeddingModel: string;
    batchSize: number;
    maxFileSizeKb: number;
    respectGitignore: boolean;
    queryMultiplier: number;
    searchEf: number;
};
declare const RECOMMENDED_CODESEARCHIGNORE = "# code-search-mcp ignore patterns\n# Syntax matches standard .gitignore glob rules\n\n# Test fixtures, snapshots and mocks\n**/fixtures/**\n**/__snapshots__/**\n**/mocks/**\n*.snap\n\n# Generated code and type declarations\n*.generated.*\n*.d.ts.map\n\n# Build, cache and bundle output\ndist/**\nbuild/**\n.cache/**\n\n# Documentation assets & media\ndocs/images/**\ndocs/assets/**\n";

declare function findProjectRoot(startDir?: string): string;
declare function isProjectInitialized(projectRoot: string): boolean;
declare function createIgnoreMatcher(projectRoot: string, customExcludes?: string[], respectGitignore?: boolean): {
    ignores: (relPath: string, isDirectory?: boolean) => boolean;
};
declare function loadConfig(projectRoot: string): CodeSearchConfig;

declare class EmbeddingEngine {
    private static instance;
    private modelName;
    private extractorPromise;
    private constructor();
    static getInstance(modelName?: string): EmbeddingEngine;
    private getExtractor;
    embedText(text: string): Promise<number[]>;
    embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
}

declare class QueryEnhancer {
    private vocabulary;
    private lowerToWord;
    addWords(text: string): void;
    private addSingleWord;
    getVocabularySize(): number;
    /**
     * Find typo correction for a token if not exact match.
     * Returns corrected string or null if no close match found.
     */
    correctTypo(token: string): string | null;
    enhanceTokens(rawTokens: string[]): {
        tokens: string[];
        corrections: Map<string, string>;
        stemmed: string[];
    };
}

declare const TABLE_NAME = "code_chunks";
declare class VectorStore {
    private dbPath;
    private db;
    private table;
    queryEnhancer: QueryEnhancer;
    constructor(dbPath: string);
    init(): Promise<void>;
    private ensureTable;
    private retryOnConflict;
    insertChunks(chunks: CodeChunk[]): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;
    deleteByFilePaths(filePaths: string[]): Promise<void>;
    searchVector(queryVector: number[], limit?: number): Promise<SearchResult[]>;
    searchLexical(queryText: string, limit?: number): Promise<SearchResult[]>;
    searchHybrid(queryVector: number[], queryText: string, limit?: number): Promise<SearchResult[]>;
    private applyFilters;
    search(queryVector: number[], options?: number | SearchOptions, queryText?: string): Promise<SearchResult[]>;
    count(): Promise<number>;
    getIndexedFileStats(): Promise<Map<string, {
        updatedAt: number;
        contentHash: string;
    }>>;
    clear(): Promise<void>;
}

interface ChunkerOptions {
    maxLinesPerChunk?: number;
    overlapLines?: number;
}
declare function computeHash(text: string): string;
declare function normalizePath(p: string): string;
declare function detectLanguage(filePath: string): string;
/**
 * Formats a code chunk with contextual metadata (file path, line numbers, language)
 * to maximize semantic vector embedding relevance across large repositories.
 */
declare function formatChunkForEmbedding(chunk: {
    filePath: string;
    startLine: number;
    endLine: number;
    language?: string;
    content: string;
}): string;
declare function chunkCodeFile(relativePath: string, absolutePath: string, content: string, options?: ChunkerOptions): CodeChunk[];

declare function scanDirectory(config: CodeSearchConfig, indexedFilesMap?: Map<string, {
    updatedAt: number;
    contentHash: string;
}>): Promise<ScanResult>;

declare class IndexerWorker {
    private config;
    private store;
    private embeddings;
    private status;
    private isRunning;
    private lock;
    constructor(config: CodeSearchConfig);
    init(): Promise<void>;
    getStatus(): IndexStatus;
    startIndexing(forceFull?: boolean): Promise<void>;
    indexSingleFile(relativePath: string, absolutePath?: string): Promise<void>;
    removeSingleFile(relativePath: string): Promise<void>;
    query(queryText: string, options?: number | SearchOptions): Promise<{
        status: IndexStatus;
        results: SearchResult[];
        formattedOutput: string;
    }>;
}

declare class FileWatcher {
    private config;
    private worker;
    private watcher;
    private debounceMap;
    private supportedExts;
    private matcher;
    constructor(config: CodeSearchConfig, worker: IndexerWorker);
    private readyPromise;
    start(): Promise<void>;
    whenReady(): Promise<void>;
    private handleFileChange;
    private handleFileUnlink;
    stop(): Promise<void>;
}

declare function createMcpServer(initialConfig: CodeSearchConfig): Promise<{
    server: Server;
    worker: IndexerWorker;
    watcher: FileWatcher;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}>;

export { type ChunkerOptions, type CodeChunk, type CodeSearchConfig, DEFAULT_CONFIG, DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, EmbeddingEngine, type ExtensionDetectionResult, FileWatcher, type IndexStatus, IndexerWorker, type IndexingState, type InitOptions, RECOMMENDED_CODESEARCHIGNORE, type ScanResult, type ScannedFile, type SearchOptions, type SearchResult, TABLE_NAME, VectorStore, chunkCodeFile, computeHash, createIgnoreMatcher, createMcpServer, detectLanguage, findProjectRoot, formatChunkForEmbedding, isProjectInitialized, loadConfig, normalizePath, scanDirectory };
