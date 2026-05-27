import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * RAR extraction.
 *
 * Two paths:
 *   1. If `7z.exe` is found on Windows (default install), shell out to it.
 *      This is the recommended path on Windows Server.
 *   2. Otherwise try `node-unrar-js` if installed.
 *
 * If neither is available we throw a recoverable error so the import
 * job can be marked as failed cleanly.
 */
@Injectable()
export class RarExtractorService {
  private readonly logger = new Logger(RarExtractorService.name);

  async extract(rarFilePath: string, destDir: string): Promise<string[]> {
    await fs.mkdir(destDir, { recursive: true });

    const sevenZip = await this.findSevenZip();
    if (sevenZip) {
      await this.runSevenZip(sevenZip, rarFilePath, destDir);
    } else {
      const lib = await this.tryLoadUnrar();
      if (!lib) {
        throw new Error(
          'RAR extraction unavailable: install 7-Zip on PATH (recommended on Windows) ' +
            'OR `npm i node-unrar-js`. See docs/windows/PLAN.md.',
        );
      }
      throw new Error('node-unrar-js fallback not yet implemented — install 7-Zip.');
    }

    return this.walk(destDir);
  }

  async detectArchiveType(filePath: string): Promise<'rar' | 'zip' | 'unknown'> {
    const fd = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(8);
      await fd.read(buf, 0, 8, 0);
      // RAR4: 52 61 72 21 1A 07 00
      // RAR5: 52 61 72 21 1A 07 01 00
      if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) return 'rar';
      // ZIP: 50 4B 03 04
      if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
      return 'unknown';
    } finally {
      await fd.close();
    }
  }

  // ---- helpers ----------------------------------------------------------

  private async findSevenZip(): Promise<string | null> {
    const candidates = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    ];
    for (const c of candidates) {
      try {
        await fs.access(c);
        return c;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  private runSevenZip(bin: string, archive: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, ['x', archive, `-o${dest}`, '-y'], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => (stderr += d.toString()));
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`7z exited ${code}: ${stderr.slice(0, 500)}`));
      });
    });
  }

  private async tryLoadUnrar(): Promise<unknown | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('node-unrar-js') as unknown;
    } catch {
      return null;
    }
  }

  private async walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await this.walk(full)));
      else out.push(full);
    }
    return out;
  }
}
