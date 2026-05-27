export type ImportStage =
  | 'uploading'
  | 'extracting'
  | 'parsing'
  | 'matching_media'
  | 'preview'
  | 'mapping_users'
  | 'importing'
  | 'complete'
  | 'failed';

export interface ImportProgressEvent {
  jobId: string;
  stage: ImportStage;
  progress: number; // 0-100
  currentStep: string;
  stats: {
    totalMessages: number;
    processedMessages: number;
    matchedMedia: number;
    totalMedia: number;
    errors: number;
  };
}

export interface ImportCompleteEvent {
  jobId: string;
  chatId: string | null;
  summary: {
    totalMessages: number;
    mediaImported: number;
    mediaOmitted: number;
    participantsCreated: number;
    participantsMapped: number;
    durationMs: number;
  };
}

export interface ImportErrorEvent {
  jobId: string;
  error: string;
  stage: ImportStage;
  recoverable: boolean;
}
