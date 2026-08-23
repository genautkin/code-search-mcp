import * as fs from 'fs';
import * as path from 'path';

export class ProcessLock {
  private lockFilePath: string;
  private hasLock: boolean = false;

  constructor(lockDir: string) {
    this.lockFilePath = path.join(lockDir, '.indexer.lock');
  }

  public acquire(): boolean {
    try {
      if (!fs.existsSync(path.dirname(this.lockFilePath))) {
        fs.mkdirSync(path.dirname(this.lockFilePath), { recursive: true });
      }

      if (fs.existsSync(this.lockFilePath)) {
        const rawPid = fs.readFileSync(this.lockFilePath, 'utf8').trim();
        const existingPid = parseInt(rawPid, 10);

        if (!isNaN(existingPid) && existingPid !== process.pid && this.isPidAlive(existingPid)) {
          // Another alive process already holds the lock
          return false;
        }
      }

      // Claim lock with current PID
      fs.writeFileSync(this.lockFilePath, String(process.pid), 'utf8');
      this.hasLock = true;
      return true;
    } catch {
      return false;
    }
  }

  public release(): void {
    if (this.hasLock) {
      try {
        if (fs.existsSync(this.lockFilePath)) {
          const rawPid = fs.readFileSync(this.lockFilePath, 'utf8').trim();
          if (parseInt(rawPid, 10) === process.pid) {
            fs.unlinkSync(this.lockFilePath);
          }
        }
      } catch {
        // Ignore unlink error on exit
      }
      this.hasLock = false;
    }
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e: any) {
      return e.code === 'EPERM';
    }
  }
}
