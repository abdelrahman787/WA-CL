import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Webhook } from './entities/webhook.entity';
import { generateWebhookSignature } from '../../common/security/webhook-signature.util';
import { CreateWebhookDto, UpdateWebhookDto } from './dto';
import { createLogger } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue/queue-names';
import { generateIdempotencyKey, generateDeliveryId } from './utils/idempotency.util';
import { HookManager } from '../../core/hooks';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  sessionId: string;
  idempotencyKey: string;
  deliveryId: string;
  data: Record<string, unknown>;
}

export interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: WebhookPayload;
  signature: string;
  headers: Record<string, string>;
  attempt: number;
  maxRetries: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = createLogger('WebhookService');
  private readonly queueEnabled: boolean;

  constructor(
    @InjectRepository(Webhook, 'data')
    private readonly webhookRepository: Repository<Webhook>,
    private readonly configService: ConfigService,
    private readonly hookManager: HookManager,
    @Optional()
    @InjectQueue(QUEUE_NAMES.WEBHOOK)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {
    this.queueEnabled = configService.get<boolean>('queue.enabled', false);
  }

  async create(sessionId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const secret = this.resolveWebhookSecret(dto.secret);

    const webhook = this.webhookRepository.create({
      sessionId,
      url: dto.url,
      events: dto.events || ['message.received'],
      secret,
      headers: dto.headers || {},
      retryCount: dto.retryCount ?? 3,
    });

    return this.webhookRepository.save(webhook);
  }

  async findBySession(sessionId: string): Promise<Webhook[]> {
    return this.webhookRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Webhook[]> {
    return this.webhookRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found`);
    }
    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(id);

    if (dto.url !== undefined) webhook.url = dto.url;
    if (dto.events !== undefined) webhook.events = dto.events;
    if (dto.secret !== undefined) webhook.secret = this.resolveWebhookSecret(dto.secret);
    if (dto.headers !== undefined) webhook.headers = dto.headers;
    if (dto.active !== undefined) webhook.active = dto.active;
    if (dto.retryCount !== undefined) webhook.retryCount = dto.retryCount;

    return this.webhookRepository.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepository.remove(webhook);
  }

  async test(sessionId: string, webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.findOne(webhookId);

    const testPayload: WebhookPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      sessionId,
      idempotencyKey: generateIdempotencyKey('test', { webhookId: webhook.id }),
      deliveryId: generateDeliveryId(),
      data: {
        message: 'This is a test webhook from OpenWA',
        webhookId: webhook.id,
        url: webhook.url,
      },
    };

    const body = JSON.stringify(testPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenWA-Webhook/1.0.0',
      'X-OpenWA-Event': 'test',
      'X-OpenWA-Idempotency-Key': testPayload.idempotencyKey,
      'X-OpenWA-Delivery-Id': testPayload.deliveryId,
      'X-OpenWA-Retry-Count': '0',
      ...webhook.headers,
    };

    const secret = this.getEffectiveSecret(webhook);
    headers['X-OpenWA-Signature'] = generateWebhookSignature(body, secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async dispatch(sessionId: string, event: string, data: Record<string, unknown>): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { sessionId, active: true },
    });

    const matchingWebhooks = webhooks.filter(w => w.events.includes(event) || w.events.includes('*'));

    // Generate idempotency key (same for all webhooks receiving this event)
    const idempotencyKey = generateIdempotencyKey(event, { ...data, sessionId });

    // Dispatch to all matching webhooks
    for (const webhook of matchingWebhooks) {
      let deliverySecret: string;
      try {
        deliverySecret = this.getEffectiveSecret(webhook);
      } catch (error) {
        this.logger.error(`Skipping webhook ${webhook.id}: missing HMAC secret`, String(error), {
          webhookId: webhook.id,
          action: 'webhook_skipped_no_secret',
        });
        continue;
      }

      // Generate unique delivery ID for each webhook
      const deliveryId = generateDeliveryId();

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        sessionId,
        idempotencyKey,
        deliveryId,
        data,
      };

      // Execute hook before webhook dispatch - plugins can modify payload
      const { continue: shouldContinue, data: hookResult } = await this.hookManager.execute(
        'webhook:before',
        { sessionId, event, payload },
        { sessionId, source: 'WebhookService' },
      );

      if (!shouldContinue) {
        this.logger.debug(`Webhook dispatch cancelled by plugin for ${event}`, {
          webhookId: webhook.id,
          action: 'webhook_cancelled_by_plugin',
        });
        continue;
      }

      // Use potentially modified payload
      const finalPayload = (hookResult as { payload: WebhookPayload }).payload;

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenWA-Webhook/1.0.0',
        'X-OpenWA-Event': event,
        'X-OpenWA-Idempotency-Key': idempotencyKey,
        'X-OpenWA-Delivery-Id': deliveryId,
        'X-OpenWA-Retry-Count': '0',
        ...webhook.headers,
      };

      const body = JSON.stringify(finalPayload);
      const signature = generateWebhookSignature(body, deliverySecret);
      headers['X-OpenWA-Signature'] = signature;

      // Use queue if available, otherwise fallback to direct delivery
      if (this.queueEnabled && this.webhookQueue) {

        const jobData: WebhookJobData = {
          webhookId: webhook.id,
          url: webhook.url,
          event,
          payload: finalPayload,
          signature,
          headers,
          attempt: 1,
          maxRetries: webhook.retryCount,
        };

        try {
          await this.webhookQueue.add(`webhook-${webhook.id}`, jobData, {
            attempts: webhook.retryCount,
            backoff: {
              type: 'exponential',
              delay: this.configService.get<number>('webhook.retryDelay', 5000),
            },
          });

          // Execute hook after successful queue (NOT delivery - that happens in processor)
          await this.hookManager.execute(
            'webhook:queued',
            { sessionId, event, webhookId: webhook.id, deliveryId },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.debug(`Webhook job queued for ${webhook.id}`, {
            webhookId: webhook.id,
            event,
            idempotencyKey,
            deliveryId,
            action: 'webhook_queued',
          });
        } catch (error) {
          // Execute hook on queue error (not delivery error - that happens in processor)
          await this.hookManager.execute(
            'webhook:error',
            { sessionId, event, webhookId: webhook.id, error: `Queue failed: ${String(error)}` },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.error(`Failed to queue webhook ${webhook.id}`, String(error), {
            webhookId: webhook.id,
            action: 'webhook_queue_failed',
          });
        }
      } else {
        // Direct delivery when queue is disabled
        try {
          await this.deliverWebhook(webhook, finalPayload, headers);

          // Execute hook after successful delivery
          await this.hookManager.execute(
            'webhook:delivered',
            { sessionId, event, webhookId: webhook.id, deliveryId },
            { sessionId, source: 'WebhookService' },
          );

          // Legacy hook for backward compatibility
          await this.hookManager.execute(
            'webhook:after',
            { sessionId, event, webhookId: webhook.id, success: true },
            { sessionId, source: 'WebhookService' },
          );
        } catch (error) {
          // Execute hook on error
          await this.hookManager.execute(
            'webhook:error',
            { sessionId, event, webhookId: webhook.id, error: String(error) },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.error(`Failed to deliver webhook ${webhook.id}`, String(error), {
            webhookId: webhook.id,
            action: 'webhook_delivery_failed',
          });
        }
      }
    }
  }

  /**
   * @deprecated Use job queue dispatch instead. This is kept for fallback.
   */
  private async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
    headers: Record<string, string>,
    attempt = 1,
  ): Promise<void> {
    const body = JSON.stringify(payload);

    // Update retry count header
    headers['X-OpenWA-Retry-Count'] = String(attempt - 1);

    if (!headers['X-OpenWA-Signature']) {
      const secret = this.getEffectiveSecret(webhook);
      headers['X-OpenWA-Signature'] = generateWebhookSignature(body, secret);
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.configService.get<number>('webhook.timeout', 10000)),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Update last triggered timestamp
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
      });

      this.logger.debug(`Webhook delivered to ${webhook.id}`, {
        webhookId: webhook.id,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivered',
      });
    } catch (error) {
      this.logger.error(`Webhook delivery failed for ${webhook.id}`, String(error), {
        webhookId: webhook.id,
        attempt,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivery_failed',
      });

      if (attempt < webhook.retryCount) {
        const delay = this.configService.get<number>('webhook.retryDelay', 5000);
        await this.delay(delay * attempt);
        return this.deliverWebhook(webhook, payload, headers, attempt + 1);
      }
      throw error;
    }
  }

  private resolveWebhookSecret(provided?: string): string {
    const secret = (provided || this.configService.get<string>('webhook.defaultSecret') || '').trim();
    const requireSecret = this.configService.get<boolean>('webhook.requireSecret', false);

    if (!secret && requireSecret) {
      throw new BadRequestException(
        'Webhook secret is required. Provide secret in the request body or set WEBHOOK_SECRET.',
      );
    }

    if (!secret) {
      throw new BadRequestException('Webhook secret is required for signed deliveries.');
    }

    if (secret.length < 32) {
      throw new BadRequestException('Webhook secret must be at least 32 characters.');
    }

    return secret;
  }

  private getEffectiveSecret(webhook: Webhook): string {
    const secret = (webhook.secret || this.configService.get<string>('webhook.defaultSecret') || '').trim();

    if (!secret) {
      throw new Error('Webhook secret is not configured');
    }

    return secret;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
