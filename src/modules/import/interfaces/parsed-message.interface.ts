export type ImportedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'gif'
  | 'system'
  | 'deleted'
  | 'omitted';

export interface ParsedMessage {
  index: number;
  rawLine: string;
  timestamp: Date;
  rawTimestampString: string;
  senderName: string;
  messageType: ImportedMessageType;
  textContent?: string;
  attachedFileName?: string;
  isSystemMessage: boolean;
  isDeleted: boolean;
  isOmitted: boolean;
}

export interface ParticipantInfo {
  name: string;
  messageCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ChatSummary {
  chatType: 'group' | 'private';
  groupName: string | null;
  participants: ParticipantInfo[];
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
  totalMessages: number;
}
