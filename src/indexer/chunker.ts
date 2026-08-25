import * as crypto from 'crypto';
import * as path from 'path';
import { CodeChunk } from '../types.js';

export interface ChunkerOptions {
  maxLinesPerChunk?: number;
  overlapLines?: number;
}

export function computeHash(text: string): string {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.vue':
      return 'vue';
    case '.svelte':
      return 'svelte';
    case '.cs':
      return 'csharp';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.cpp':
    case '.cc':
    case '.c':
    case '.h':
    case '.hpp':
      return 'cpp';
    case '.sql':
      return 'sql';
    case '.json':
      return 'json';
    case '.md':
    case '.mdx':
      return 'markdown';
    default:
      return ext.replace('.', '') || 'text';
  }
}

const LANGUAGE_KEYWORDS = new Set([
  'if', 'else', 'return', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'import', 'export', 'from', 'default', 'as', 'new', 'this', 'super',
  'true', 'false', 'null', 'undefined', 'void', 'any', 'string', 'number', 'boolean',
  'public', 'private', 'protected', 'static', 'readonly', 'const', 'let', 'var',
  'function', 'class', 'interface', 'type', 'enum', 'struct', 'trait', 'def', 'fn'
]);

/**
 * Extracts top-level declarations, methods, and prominent camelCase identifiers
 * from a code chunk to augment vector embedding representations.
 */
export function extractChunkSymbols(content: string, language?: string): string[] {
  const symbols = new Set<string>();

  // 1. Declarations: class, interface, type, enum, function, method, struct, trait
  const declRegex = /(?:class|interface|type|enum|struct|trait|record|function|fn|func|def)\s+([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(content)) !== null) {
    if (match[1] && match[1].length > 1 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
    }
  }

  // 2. Variable function assignments & method signatures: const foo = () =>, methodName()
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

  // 3. Prominent camelCase or PascalCase identifier tokens (e.g. isKOEntity, futureOrderVisible)
  const idRegex = /\b([a-z]+[A-Z0-9][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z0-9][A-Za-z0-9]*)\b/g;
  while ((match = idRegex.exec(content)) !== null) {
    if (match[1] && match[1].length >= 3 && !LANGUAGE_KEYWORDS.has(match[1])) {
      symbols.add(match[1]);
      if (symbols.size >= 20) break;
    }
  }

  return Array.from(symbols).slice(0, 15);
}

/**
 * Formats a code chunk with contextual metadata (file path, line numbers, language, symbols)
 * to maximize semantic vector embedding relevance across large repositories.
 */
export function formatChunkForEmbedding(chunk: {
  filePath: string;
  startLine: number;
  endLine: number;
  language?: string;
  content: string;
}): string {
  const lang = chunk.language || detectLanguage(chunk.filePath);
  const symbols = lang !== 'markdown' && lang !== 'text' ? extractChunkSymbols(chunk.content, lang) : [];
  const symbolLine = symbols.length > 0 ? `\n// Symbols: ${symbols.join(', ')}` : '';
  const header = `// File: ${chunk.filePath} [L${chunk.startLine}-L${chunk.endLine}] (${lang})${symbolLine}`;
  return `${header}\n${chunk.content}`;
}

export function chunkCodeFile(
  relativePath: string,
  absolutePath: string,
  content: string,
  options: ChunkerOptions = {}
): CodeChunk[] {
  const maxLines = options.maxLinesPerChunk ?? 45;
  const overlap = options.overlapLines ?? 10;
  const normalizedRelPath = normalizePath(relativePath);
  const normalizedAbsPath = normalizePath(absolutePath);
  const language = detectLanguage(relativePath);
  const now = Date.now();

  let rawLines = content.split(/\r?\n/);
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  const totalLines = rawLines.length;

  if (totalLines === 0 || (totalLines === 1 && rawLines[0].trim() === '')) {
    return [];
  }

  // Small file single chunk
  if (totalLines <= maxLines) {
    const chunkContent = rawLines.join('\n');
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

  const chunks: CodeChunk[] = [];
  let currentStart = 0; // 0-indexed

  while (currentStart < totalLines) {
    let currentEnd = Math.min(currentStart + maxLines, totalLines);

    // Snap to a natural boundary (empty line, function closure, declaration) if not at EOF
    if (currentEnd < totalLines) {
      const searchWindowStart = Math.max(currentStart + (maxLines - 10), currentStart + 15);
      for (let lineIdx = currentEnd - 1; lineIdx >= searchWindowStart; lineIdx--) {
        const line = rawLines[lineIdx].trim();
        if (line === '' || line === '}' || line === '};' || line.startsWith('export ') || line.startsWith('function ') || line.startsWith('/**')) {
          // If closing brace or empty line, include it in the current chunk
          currentEnd = lineIdx + (line === '' || line === '}' || line === '};' ? 1 : 0);
          break;
        }
      }
    }

    const chunkLines = rawLines.slice(currentStart, currentEnd);
    const chunkContent = chunkLines.join('\n');

    const startLineNum = currentStart + 1; // 1-indexed
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

    // Advance start position
    const advance = Math.max(1, (currentEnd - currentStart) - overlap);
    currentStart += advance;
  }

  return chunks;
}
