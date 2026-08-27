import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IndexerWorker } from '../src/indexer/worker.js';
import { loadConfig } from '../src/config/loader.js';

describe('Indexer Worker & Query Flow', () => {
  let tempDir: string;
  let worker: IndexerWorker;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'worker-test-')));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

    // File 1: Payment module
    fs.writeFileSync(
      path.join(tempDir, 'src', 'payment.ts'),
      `export class PaymentProcessor {
  validateCreditCard(cardNumber: string): boolean {
    return cardNumber.length === 16;
  }
}`
    );

    // File 2: User auth module
    fs.writeFileSync(
      path.join(tempDir, 'src', 'auth.ts'),
      `export class AuthService {
  loginWithPassword(email: string, pass: string): boolean {
    return true;
  }
}`
    );

    const config = loadConfig(tempDir);
    worker = new IndexerWorker(config);
    await worker.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should index directory and find semantic query matches', async () => {
    await worker.startIndexing();
    const status = worker.getStatus();
    expect(status.state).toBe('ready');
    expect(status.indexedFiles).toBe(2);
    expect(status.progressPercentage).toBe(100);

    const res = await worker.query('credit card verification', 5);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].filePath).toBe('src/payment.ts');
    expect(res.formattedOutput).toContain('PaymentProcessor');
  }, 60000);

  it('should update single file incrementally without full reindex', async () => {
    await worker.startIndexing();

    // Modify auth.ts to add logout
    fs.writeFileSync(
      path.join(tempDir, 'src', 'auth.ts'),
      `export class AuthService {
  logoutUserSession(sessionId: string): void {
    console.log("Logged out", sessionId);
  }
}`
    );

    await worker.indexSingleFile('src/auth.ts');

    const res = await worker.query('terminate session logout', 5);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].filePath).toBe('src/auth.ts');
    expect(res.results[0].content).toContain('logoutUserSession');
  }, 60000);

  it('should support both fast mode and gentle mode options', async () => {
    await worker.startIndexing({ forceFull: true, mode: 'gentle', batchDelayMs: 5 });
    let status = worker.getStatus();
    expect(status.state).toBe('ready');
    expect(status.indexedFiles).toBe(2);

    await worker.startIndexing({ forceFull: false, mode: 'fast' });
    status = worker.getStatus();
    expect(status.state).toBe('ready');
    expect(status.indexedFiles).toBe(2);
  }, 60000);
});
