import { Injectable } from '@nestjs/common';
import { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';

export type TypingSpeed = 'slow' | 'normal' | 'fast';

export interface HumanizeConfig {
  enabled: boolean;
  speed: TypingSpeed;
  variability: number;
  minDelayMs: number;
  maxDelayMs: number;
  simulateRecording: boolean;
}

// Characters per second for each speed — tuned for realistic human typing
const SPEED_CHARS_PER_SECOND: Record<TypingSpeed, number> = {
  slow: 2.5,
  normal: 4.5,
  fast: 6.5,
};

const DEFAULT_CONFIG: HumanizeConfig = {
  enabled: false,
  speed: 'normal',
  variability: 0.3,
  minDelayMs: 1500,
  maxDelayMs: 70000,
  simulateRecording: false,
};

export function createHumanizeConfig(overrides?: Partial<HumanizeConfig>): HumanizeConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

@Injectable()
export class HumanizeService {
  private readonly logger = createLogger('HumanizeService');
  private readonly TYPING_REFRESH_INTERVAL_MS = 8000;

  async simulateHumanTyping(
    engine: IWhatsAppEngine,
    chatId: string,
    text: string,
    config: Partial<HumanizeConfig> = {},
  ): Promise<void> {
    const cleanConfig: Partial<HumanizeConfig> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        (cleanConfig as Record<string, unknown>)[key] = value;
      }
    }
    const cfg = { ...DEFAULT_CONFIG, ...cleanConfig };
    if (!cfg.enabled) return;

    const charCount = text.length;
    const charsPerSecond = SPEED_CHARS_PER_SECOND[cfg.speed];
    const baseDelayMs = (charCount / charsPerSecond) * 1000;

    const jitter = baseDelayMs * cfg.variability * (Math.random() * 2 - 1);
    let delayMs = Math.round(baseDelayMs + jitter);

    delayMs = Math.max(cfg.minDelayMs, cfg.maxDelayMs > 0 ? Math.min(cfg.maxDelayMs, delayMs) : delayMs);

    this.logger.debug(
      `Humanize: "${text.substring(0, 30)}..." (${charCount} chars) → ${delayMs}ms at "${cfg.speed}" speed`,
    );

    const indicatorFn = cfg.simulateRecording ? 'simulateRecording' : 'simulateTyping';

    await engine[indicatorFn](chatId);

    await this.sleepWithRefresh(engine, chatId, indicatorFn, delayMs, this.TYPING_REFRESH_INTERVAL_MS);

    await this.sleep(200);
  }

  calculateTypingDelay(text: string, config: Partial<HumanizeConfig> = {}): number {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const charsPerSecond = SPEED_CHARS_PER_SECOND[cfg.speed];
    const baseDelayMs = (text.length / charsPerSecond) * 1000;
    const jitter = baseDelayMs * cfg.variability * (Math.random() * 2 - 1);
    const delayMs = Math.round(baseDelayMs + jitter);
    return Math.max(cfg.minDelayMs, cfg.maxDelayMs > 0 ? Math.min(cfg.maxDelayMs, delayMs) : delayMs);
  }

  private async sleepWithRefresh(
    engine: IWhatsAppEngine,
    chatId: string,
    indicatorFn: 'simulateTyping' | 'simulateRecording',
    totalDelayMs: number,
    refreshIntervalMs: number,
  ): Promise<number> {
    let elapsed = 0;
    while (elapsed < totalDelayMs) {
      const remaining = totalDelayMs - elapsed;
      const sleepTime = Math.min(refreshIntervalMs, remaining);
      await this.sleep(sleepTime);
      elapsed += sleepTime;

      if (elapsed < totalDelayMs) {
        await engine[indicatorFn](chatId);
      }
    }
    return elapsed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
