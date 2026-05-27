import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * ZIP extraction.
 *
 * Skeleton — switches over to `unzipper` when the dep is installed.
 * Until then it throws a clear error so the orchestrator can mark the
 * job as failed with a recoverable message.
 */
@Injectable()
export class ZipExtractorService {
  private readonly logger = new Logger(ZipExtractorService.name);

  async extract(zipFilePath: string, destDir: string): Promise<string[]> {
    await fs.mkdir(destDir, { recursive: true });

    const unzipper = await this.tryLoad();
    if (!unzipper) {
      throw new Error(
        'ZIP extraction unavailable: install `unzipper` (`npm i unzipper`) ' +
          'and rebuild. See docs/windows/PLAN.md.',
      );
    }

    // Lazy implementation guarded behind the optional dep.
    const out: string[] = [];
    const directory = await unzipper.Open.file(zipFilePath);
    for (const entry of directory.files) {
      if (entry.type !== 'File') continue;
      const target = path.join(destDir, entry.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const content = await entry.buffer();
      await fs.writeFile(target, content);
      out.push(target);
    }
    return out;
  }

  async listContents(zipFilePath: string): Promise<string[]> {
    const unzipper = await this.tryLoad();
    if (!unzipper) throw new Error('unzipper not installed');
    const directory = await unzipper.Open.file(zipFilePath);
    return directory.files.filter((f: { type: string }) => f.type === 'File').map((f: { path: string }) => f.path);
  }

  private async tryLoad(): Promise<UnzipperLike | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('unzipper') as UnzipperLike;
    } catch {
      this.logger.warn('unzipper not installed — ZIP extraction disabled.');
      return null;
    }
  }
}

interface UnzipperLike {
  Open: {
    file(p: string): Promise<{
      files: Array<{ type: string; path: string; buffer(): Promise<Buffer> }>;
    }>;
  };
}
