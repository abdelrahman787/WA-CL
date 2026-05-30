import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';

/**
 * Streaming ZIP extraction.
 *
 * Implemented with `unzipper`'s Parse stream so we never hold the whole
 * archive in memory — each entry is piped straight to disk and the
 * stream is drained before moving on.
 */
@Injectable()
export class ZipExtractorService {
  private readonly logger = new Logger(ZipExtractorService.name);

  async extract(zipFilePath: string, destDir: string): Promise<string[]> {
    await fs.mkdir(destDir, { recursive: true });
    const out: string[] = [];

    // Random-access read via the central directory. We tried streaming
    // (`unzipper.Parse({ forceStream: true })`) first but it silently
    // dropped entries from archives created by the `zip` CLI on Linux —
    // `Open.file` reliably enumerates the central directory and gives
    // each entry as a buffer we can write out.
    const directory = await unzipper.Open.file(zipFilePath);
    for (const entry of directory.files) {
      const relPath = this.sanitize(entry.path);
      if (!relPath) continue;
      const target = path.join(destDir, relPath);
      if (entry.type === 'Directory') {
        await fs.mkdir(target, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      const buf = await entry.buffer();
      await fs.writeFile(target, buf);
      out.push(target);
    }

    return out;
  }

  async listContents(zipFilePath: string): Promise<string[]> {
    const directory = await unzipper.Open.file(zipFilePath);
    return directory.files
      .filter(f => f.type === 'File')
      .map(f => f.path);
  }

  /**
   * Block zip-slip: refuse absolute paths or anything that escapes the
   * destination via `..`.
   */
  private sanitize(entryPath: string): string | null {
    const normalized = path.normalize(entryPath).replace(/^[/\\]+/, '');
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
    return normalized;
  }
}
