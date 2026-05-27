import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { ParsedMessage } from '../interfaces/parsed-message.interface';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

export interface MatchResult {
  filePath: string | null;
  confidence: MatchConfidence;
  strategy: string;
}

export interface MatchingReport {
  totalMediaMessages: number;
  exactMatches: number;
  fuzzyMatches: number;
  unmatched: number;
  unmatchedMessages: ParsedMessage[];
  orphanFiles: string[];
  perMessage: Map<number, MatchResult>;
}

const MEDIA_TYPES = new Set([
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
  'gif',
  'omitted',
]);

@Injectable()
export class MediaMatcherService {
  private readonly logger = new Logger(MediaMatcherService.name);

  matchByExactFilename(message: ParsedMessage, availableFiles: string[]): string | null {
    if (!message.attachedFileName) return null;
    const target = message.attachedFileName.toLowerCase();
    return (
      availableFiles.find(f => path.basename(f).toLowerCase() === target) ?? null
    );
  }

  /**
   * WA media filenames embed a date: IMG-YYYYMMDD-WAxxxx.jpg.
   * If we can pull that date out and it's close to the message timestamp,
   * we treat it as a likely match.
   */
  matchByDateProximity(
    message: ParsedMessage,
    availableFiles: string[],
    toleranceHours = 24,
  ): string | null {
    const messageDay = this.dayKey(message.timestamp);
    const re = /(\d{8})/;
    let best: string | null = null;
    let bestDelta = Infinity;
    for (const file of availableFiles) {
      const base = path.basename(file);
      const m = re.exec(base);
      if (!m) continue;
      const fileDay = m[1];
      const delta = this.dayDelta(fileDay, messageDay);
      if (delta * 24 <= toleranceHours && delta < bestDelta) {
        bestDelta = delta;
        best = file;
      }
    }
    return best;
  }

  /**
   * For sequences of media messages, files in the archive listing usually
   * appear in the same order. Walk forward from the previous matched file
   * and pick the next unmatched one whose extension is compatible with the
   * message type.
   */
  matchBySequence(
    messages: ParsedMessage[],
    availableFiles: string[],
    messageIndex: number,
    matched: Set<string>,
  ): string | null {
    const target = messages[messageIndex];
    for (const file of availableFiles) {
      if (matched.has(file)) continue;
      if (this.fileMatchesType(file, target.messageType)) return file;
    }
    return null;
  }

  matchByMediaType(message: ParsedMessage, availableFiles: string[], matched: Set<string>): string | null {
    for (const f of availableFiles) {
      if (matched.has(f)) continue;
      if (this.fileMatchesType(f, message.messageType)) return f;
    }
    return null;
  }

  findBestMatch(
    message: ParsedMessage,
    availableFiles: string[],
    allMessages: ParsedMessage[],
    matched: Set<string>,
  ): MatchResult {
    if (!MEDIA_TYPES.has(message.messageType)) {
      return { filePath: null, confidence: 'none', strategy: 'not-media' };
    }

    const exact = this.matchByExactFilename(message, availableFiles);
    if (exact) return { filePath: exact, confidence: 'exact', strategy: 'exact-filename' };

    const dateMatch = this.matchByDateProximity(message, availableFiles);
    if (dateMatch && !matched.has(dateMatch)) {
      return { filePath: dateMatch, confidence: 'high', strategy: 'date-proximity' };
    }

    const seq = this.matchBySequence(allMessages, availableFiles, message.index, matched);
    if (seq) return { filePath: seq, confidence: 'medium', strategy: 'sequence' };

    const typeMatch = this.matchByMediaType(message, availableFiles, matched);
    if (typeMatch) return { filePath: typeMatch, confidence: 'low', strategy: 'media-type' };

    return { filePath: null, confidence: 'none', strategy: 'no-match' };
  }

  matchAllMedia(messages: ParsedMessage[], extractedFiles: string[]): MatchingReport {
    const matched = new Set<string>();
    const perMessage = new Map<number, MatchResult>();
    let exact = 0;
    let fuzzy = 0;
    const unmatchedMessages: ParsedMessage[] = [];
    let totalMediaMessages = 0;

    for (const msg of messages) {
      if (!MEDIA_TYPES.has(msg.messageType)) continue;
      totalMediaMessages++;
      const result = this.findBestMatch(msg, extractedFiles, messages, matched);
      perMessage.set(msg.index, result);
      if (result.filePath) {
        matched.add(result.filePath);
        if (result.confidence === 'exact') exact++;
        else fuzzy++;
      } else {
        unmatchedMessages.push(msg);
      }
    }

    const orphanFiles = extractedFiles.filter(f => !matched.has(f));
    return {
      totalMediaMessages,
      exactMatches: exact,
      fuzzyMatches: fuzzy,
      unmatched: unmatchedMessages.length,
      unmatchedMessages,
      orphanFiles,
      perMessage,
    };
  }

  // ---- helpers ----------------------------------------------------------

  private dayKey(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}${m}${day}`;
  }

  private dayDelta(a: string, b: string): number {
    const toDate = (s: string) =>
      new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
    const diff = Math.abs(toDate(a).getTime() - toDate(b).getTime());
    return diff / (1000 * 60 * 60 * 24);
  }

  private fileMatchesType(file: string, type: string): boolean {
    const ext = path.extname(file).toLowerCase().slice(1);
    switch (type) {
      case 'image': return ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext);
      case 'video': return ['mp4', 'mov', 'mkv', '3gp'].includes(ext);
      case 'gif':   return ext === 'mp4' && /gif/i.test(file);
      case 'voice': return ['opus', 'm4a', 'aac'].includes(ext) && /PTT/i.test(file);
      case 'audio': return ['mp3', 'm4a', 'ogg', 'aac', 'opus'].includes(ext);
      case 'sticker': return ext === 'webp';
      case 'document':
      case 'omitted':
        return true;
      default:
        return false;
    }
  }
}
