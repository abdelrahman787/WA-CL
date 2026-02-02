import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { SessionModule } from './modules/session/session.module';
import { MessageModule } from './modules/message/message.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { HealthModule } from './modules/health/health.module';
import { EngineModule } from './engine/engine.module';
import { LoggerModule } from './common/services/logger.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: configService.get<'sqlite' | 'postgres'>(
          'database.type',
          'sqlite',
        ),
        database: configService.get<string>(
          'database.database',
          './data/openwa.sqlite',
        ),
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get<boolean>('database.synchronize', true),
        logging: configService.get<boolean>('database.logging', false),
      }),
    }),

    // Core modules
    LoggerModule,
    EngineModule,
    SessionModule,
    MessageModule,
    WebhookModule,
    HealthModule,
  ],
})
export class AppModule {}
