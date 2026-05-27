import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import {
  buildDate,
  detectDateFormat,
  matchTimestampPrefix,
  normalizeDigits,
  stripBidiMarks,
  DateFormat,
} from './date-parser.util';
import {
  ChatSummary,
  ParsedMessage,
  ParticipantInfo,
} from '../interfaces/parsed-message.interface';

const SYSTEM_PATTERNS: RegExp[] = [
  /created (this )?group/i,
  /added\s/i,
  /removed\s/i,
  /changed the group/i,
  /changed this group's icon/i,
  /left\s*$/i,
  /messages and calls are end-to-end encrypted/i,
  /you were added/i,
  /joined using this group's invite link/i,
];

const OMITTED_RE = /(image|video|audio|document|sticker|gif|voice) omitted/i;
const ATTACHED_RE = /<attached:\s*([^>]+)>/i;
const DELETED_RE = /This message was deleted|You deleted this message/i;

@Injectable()
export class ChatParserService {
  private readonly logger = new Logger(ChatParserService.name);

  async parseChat(chatTxtPath: string): Promise<ParsedMessage[]> {
    const buf = await fs.readFile(chatTxtPath);
    // Strip BOM if present
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);

    const fmt = detectDateFormat(lines.slice(0, 200));
    this.logger.log(`Detected date format: ${fmt}`);

    return this.parseLines(lines, fmt);
  }

  parseLines(rawLines: string[], fmt: DateFormat): ParsedMessage[] {
    const grouped = this.handleMultilineMessages(rawLines);
    const out: ParsedMessage[] = [];

    for (const line of grouped) {
      const m = matchTimestampPrefix(line);
      if (!m) continue;
      const ts = buildDate(m, fmt);
      const body = stripBidiMarks(m.rest).trim();

      // Split sender from body. WA uses ": " as separator.
      const colonIdx = body.indexOf(': ');
      let sender: string;
      let content: string;
      let isSystem = false;
      if (colonIdx === -1) {
        sender = 'System';
        content = body;
        isSystem = true;
      } else {
        sender = body.slice(0, colonIdx).trim();
        content = body.slice(colonIdx + 2);
      }

      if (!isSystem) isSystem = SYSTEM_PATTERNS.some(re => re.test(content));

      const attachedMatch = ATTACHED_RE.exec(content);
      const isDeleted = DELETED_RE.test(content);
      const omittedMatch = OMITTED_RE.exec(content);
      const isOmitted = !!omittedMatch;

      let messageType: ParsedMessage['messageType'] = 'text';
      let attachedFileName: string | undefined;
      if (attachedMatch) {
        attachedFileName = attachedMatch[1].trim();
        messageType = this.classifyByFilename(attachedFileName);
      } else if (omittedMatch) {
        messageType = 'omitted';
      } else if (isDeleted) {
        messageType = 'deleted';
      } else if (isSystem) {
        messageType = 'system';
      }

      out.push({
        index: out.length,
        rawLine: line,
        timestamp: ts,
        rawTimestampString: m.rawPrefix,
        senderName: this.normalizeParticipantName(sender),
        messageType,
        textContent: messageType === 'text' || messageType === 'system' ? content : undefined,
        attachedFileName,
        isSystemMessage: isSystem,
        isDeleted,
        isOmitted,
      });
    }

    return out;
  }

  /**
   * If a line does NOT begin with a timestamp it's a continuation of the
   * previous line.
   */
  handleMultilineMessages(rawLines: string[]): string[] {
    const out: string[] = [];
    for (const raw of rawLines) {
      if (!raw) continue;
      const normalized = normalizeDigits(stripBidiMarks(raw));
      if (matchTimestampPrefix(normalized)) {
        out.push(raw);
      } else if (out.length) {
        out[out.length - 1] += '\n' + raw;
      }
    }
    return out;
  }

  normalizeParticipantName(name: string): string {
    return stripBidiMarks(name)
      .replace(/^[‎\s]+|[‎\s]+$/g, '')
      .trim();
  }

  classifyByFilename(filename: string): ParsedMessage['messageType'] {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'mkv', '3gp'].includes(ext)) {
      if (filename.toLowerCase().startsWith('gif-')) return 'gif';
      return 'video';
    }
    if (['opus', 'm4a', 'aac', 'ogg'].includes(ext)) {
      if (filename.toUpperCase().startsWith('PTT-')) return 'voice';
      return 'audio';
    }
    if (ext === 'mp3') return 'audio';
    if (['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'zip', 'rar'].includes(ext)) {
      return 'document';
    }
    if (ext === 'webp' || filename.toUpperCase().startsWith('STK-')) return 'sticker';
    return 'document';
  }

  extractParticipants(messages: ParsedMessage[]): ParticipantInfo[] {
    const map = new Map<string, ParticipantInfo>();
    for (const m of messages) {
      if (m.isSystemMessage) continue;
      const existing = map.get(m.senderName);
      if (existing) {
        existing.messageCount++;
        if (m.timestamp < existing.firstSeen) existing.firstSeen = m.timestamp;
        if (m.timestamp > existing.lastSeen) existing.lastSeen = m.timestamp;
      } else {
        map.set(m.senderName, {
          name: m.senderName,
          messageCount: 1,
          firstSeen: m.timestamp,
          lastSeen: m.timestamp,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.messageCount - a.messageCount);
  }

  detectChatType(messages: ParsedMessage[]): 'group' | 'private' {
    const participants = this.extractParticipants(messages);
    return participants.length > 2 ? 'group' : 'private';
  }

  extractGroupName(messages: ParsedMessage[]): string | null {
    const re = /changed the (group )?(subject|name) (to|from .* to) ["“]?(.+?)["”]?\s*$/i;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.isSystemMessage || !m.textContent) continue;
      const match = re.exec(m.textContent);
      if (match) return match[4].trim();
    }
    return null;
  }

  summarize(messages: ParsedMessage[]): ChatSummary {
    const participants = this.extractParticipants(messages);
    const real = messages.filter(m => !m.isSystemMessage);
    return {
      chatType: this.detectChatType(messages),
      groupName: this.extractGroupName(messages),
      participants,
      firstMessageAt: real.length ? real[0].timestamp : null,
      lastMessageAt: real.length ? real[real.length - 1].timestamp : null,
      totalMessages: messages.length,
    };
  }
}
