import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Webhook } from './entities/webhook.entity';
import { CreateWebhookDto, UpdateWebhookDto } from './dto';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  sessionId: string;
  data: any;
}

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    private readonly configService: ConfigService,
  ) {}

  async create(sessionId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const webhook = this.webhookRepository.create({
      sessionId,
      url: dto.url,
      events: dto.events || ['message.received'],
      secret: dto.secret || null,
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
    if (dto.secret !== undefined) webhook.secret = dto.secret;
    if (dto.headers !== undefined) webhook.headers = dto.headers;
    if (dto.active !== undefined) webhook.active = dto.active;
    if (dto.retryCount !== undefined) webhook.retryCount = dto.retryCount;

    return this.webhookRepository.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepository.remove(webhook);
  }

  async dispatch(sessionId: string, event: string, data: any): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { sessionId, active: true },
    });

    const matchingWebhooks = webhooks.filter(
      (w) => w.events.includes(event) || w.events.includes('*'),
    );

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      sessionId,
      data,
    };

    // Dispatch to all matching webhooks (fire and forget for now)
    // In production, this should use a job queue
    for (const webhook of matchingWebhooks) {
      this.deliverWebhook(webhook, payload).catch((error) => {
        console.error(
          `Webhook delivery failed for ${webhook.id}:`,
          error.message,
        );
      });
    }
  }

  private async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
    attempt = 1,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenWA-Webhook/0.1.0',
      ...webhook.headers,
    };

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = this.generateSignature(body, webhook.secret);
      headers['X-OpenWA-Signature'] = signature;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(
          this.configService.get<number>('webhook.timeout', 10000),
        ),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Update last triggered timestamp
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
      });
    } catch (error) {
      if (attempt < webhook.retryCount) {
        const delay = this.configService.get<number>(
          'webhook.retryDelay',
          5000,
        );
        await this.delay(delay * attempt); // Exponential backoff
        return this.deliverWebhook(webhook, payload, attempt + 1);
      }
      throw error;
    }
  }

  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
