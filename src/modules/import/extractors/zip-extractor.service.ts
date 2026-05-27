import { Injectable, Logger } from '@nestjs/common';
import { promises as fs, createReadStream } from 'fs';
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

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(zipFilePath)
        .pipe(unzipper.Parse({ forceStream: true }));

      stream.on('entry', (entry: unzipper.Entry) => {
        const relPath = this.sanitize(entry.path);
        if (!relPath) {
          entry.autodrain();
          return;
        }
        const target = path.join(destDir, relPath);
        if (entry.type === 'Directory') {
          fs.mkdir(target, { recursive: true })
            .then(() => entry.autodrain())
            .catch(reject);
          return;
        }
        fs.mkdir(path.dirname(target), { recursive: true })
          .then(() => {
            const ws = require('fs').createWriteStream(target);
            entry
              .pipe(ws)
              .on('finish', () => { out.push(target); })
              .on('error', reject);
          })
          .catch(reject);
      });

      stream.on('close', () => resolve());
      stream.on('error', reject);
    });

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
