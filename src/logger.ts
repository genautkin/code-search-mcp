import * as fs from 'fs';
import * as path from 'path';

export class Logger {
  private static instance: Logger | null = null;
  private logFilePath: string | null = null;
  private maxSizeBytes = 2 * 1024 * 1024; // 2 MB rotating limit

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public init(baseDir: string): void {
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.logFilePath = path.join(baseDir, 'code-search.log');
      this.info('Logger initialized', { logFilePath: this.logFilePath });
    } catch {
      // Fallback silently if log folder is not writable
    }
  }

  public info(message: string, meta?: any): void {
    this.write('INFO', message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.write('WARN', message, meta);
  }

  public error(message: string, meta?: any): void {
    this.write('ERROR', message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.write('DEBUG', message, meta);
  }

  public getLogPath(): string | null {
    return this.logFilePath;
  }

  private write(level: string, message: string, meta?: any): void {
    if (!this.logFilePath) return;

    try {
      const timestamp = new Date().toISOString();
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

      // Check for rotation if file is too large
      if (fs.existsSync(this.logFilePath)) {
        const stat = fs.statSync(this.logFilePath);
        if (stat.size > this.maxSizeBytes) {
          const oldPath = `${this.logFilePath}.1`;
          try {
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            fs.renameSync(this.logFilePath, oldPath);
          } catch {}
        }
      }

      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch {
      // Never throw from logger
    }
  }
}

export const logger = Logger.getInstance();
