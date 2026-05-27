import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createExtractorFromFile } from 'node-unrar-js';

/**
 * RAR extraction with two strategies, picked at runtime:
 *
 *  1. `node-unrar-js` — pure WASM, works on every platform. Default.
 *  2. Shell out to `7z.exe` — used on Windows when WASM init fails or
 *     when the bundled binary is present at `tools/7zip/7z.exe`.
 *
 * Both write to `destDir` and return absolute paths of regular files.
 * The dest dir is created if absent.
 */
@Injectable()
export class RarExtractorService {
  private readonly logger = new Logger(RarExtractorService.name);

  async extract(rarFilePath: string, destDir: string): Promise<string[]> {
    await fs.mkdir(destDir, { recursive: true });

    try {
      await this.extractWithUnrarJs(rarFilePath, destDir);
    } catch (err) {
      this.logger.warn(`node-unrar-js failed (${(err as Error).message}); trying 7-Zip fallback`);
      const sevenZip = await this.findSevenZip();
      if (!sevenZip) {
        throw new Error(
          'RAR extraction failed and no 7-Zip fallback found. ' +
            'Install 7-Zip on PATH or bundle tools/7zip/7z.exe.',
        );
      }
      await this.runSevenZip(sevenZip, rarFilePath, destDir);
    }

    return this.walk(destDir);
  }

  async detectArchiveType(filePath: string): Promise<'rar' | 'zip' | 'unknown'> {
    const fd = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(8);
      await fd.read(buf, 0, 8, 0);
      if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) return 'rar';
      if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
      return 'unknown';
    } finally {
      await fd.close();
    }
  }

  // ---- strategy 1: node-unrar-js ---------------------------------------

  private async extractWithUnrarJs(rarFilePath: string, destDir: string): Promise<void> {
    const extractor = await createExtractorFromFile({
      filepath: rarFilePath,
      targetPath: destDir,
    });
    // Generator-based: pull every entry to drain extraction.
    const result = extractor.extract();
    for (const _file of result.files) {
      // intentional drain
      void _file;
    }
  }

  // ---- strategy 2: shell out to 7z.exe ---------------------------------

  private async findSevenZip(): Promise<string | null> {
    const candidates = [
      path.join(process.cwd(), 'tools', '7zip', '7z.exe'),
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    ];
    for (const c of candidates) {
      try {
        await fs.access(c);
        return c;
      } catch { /* ignore */ }
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
