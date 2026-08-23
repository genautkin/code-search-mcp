export interface CodeSearchConfig {
  projectRoot: string;
  dbPath: string;
  embeddingModel: string;
  batchSize: number;
  maxFileSizeKb: number;
  supportedExtensions: string[];
  customExcludes: string[];
  queryMultiplier: number;
  searchEf: number;
}

export interface CodeChunk {
  id: string; // e.g. "relPath:startLine:endLine"
  filePath: string; // relative path to projectRoot
  absolutePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  vector?: number[];
  language?: string;
  updatedAt: number;
}

export interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number; // cosine similarity score (0 to 1)
  language?: string;
}

export type IndexingState = 'idle' | 'scanning' | 'indexing' | 'ready' | 'error';

export interface IndexStatus {
  state: IndexingState;
  progressPercentage: number;
  indexedFiles: number;
  totalFiles: number;
  indexedChunks: number;
  currentFile?: string;
  lastIndexedAt?: number;
  error?: string;
}

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface ScanResult {
  filesToIndex: ScannedFile[];
  filesToDelete: string[]; // relative paths
  unchangedFilesCount: number;
  totalFilesCount: number;
}
