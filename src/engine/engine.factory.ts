import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppEngine } from './interfaces/whatsapp-engine.interface';
import { WhatsAppWebJsAdapter } from './adapters/whatsapp-web-js.adapter';

@Injectable()
export class EngineFactory {
  constructor(private readonly configService: ConfigService) {}

  create(sessionId: string): IWhatsAppEngine {
    const engineType = this.configService.get<string>(
      'engine.type',
      'whatsapp-web.js',
    );

    switch (engineType) {
      case 'whatsapp-web.js':
      default:
        return new WhatsAppWebJsAdapter({
          sessionId,
          sessionDataPath: this.configService.get<string>(
            'engine.sessionDataPath',
            './data/sessions',
          ),
          puppeteer: {
            headless: this.configService.get<boolean>(
              'engine.puppeteer.headless',
              true,
            ),
            args: this.configService.get<string[]>('engine.puppeteer.args', [
              '--no-sandbox',
              '--disable-setuid-sandbox',
            ]),
          },
        });
    }
  }
}
