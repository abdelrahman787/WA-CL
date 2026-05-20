import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsUrl,
  ValidateIf,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TypingSpeed = 'slow' | 'normal' | 'fast';

export class HumanizeOptionsDto {
  @ApiPropertyOptional({
    description: 'Enable human-like typing simulation',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Typing speed preset',
    enum: ['slow', 'normal', 'fast'],
    default: 'normal',
  })
  @IsOptional()
  @IsEnum(['slow', 'normal', 'fast'])
  speed?: TypingSpeed;

  @ApiPropertyOptional({
    description: 'Random variability factor (0-1). Higher = more natural variation',
    default: 0.2,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  variability?: number;

  @ApiPropertyOptional({
    description: 'Minimum typing delay in milliseconds',
    default: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(100)
  minDelayMs?: number;

  @ApiPropertyOptional({
    description: 'Maximum typing delay in milliseconds (0 = no limit)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(500)
  maxDelayMs?: number;

  @ApiPropertyOptional({
    description: 'Show recording indicator instead of typing (for voice-like feel)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  simulateRecording?: boolean;
}

export class SendTextMessageDto {
  @ApiProperty({
    description: 'WhatsApp chat ID (phone@c.us for individual, groupId@g.us for groups)',
    example: '628123456789@c.us',
  })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({
    description: 'Text message content',
    example: 'Hello from OpenWA!',
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text: string;

  @ApiPropertyOptional({
    description: 'Human-like typing simulation options',
    type: HumanizeOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HumanizeOptionsDto)
  humanize?: HumanizeOptionsDto;
}

export class SendMediaMessageDto {
  @ApiProperty({
    description: 'WhatsApp chat ID',
    example: '628123456789@c.us',
  })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiPropertyOptional({
    description: 'Media URL (http/https)',
    example: 'https://example.com/image.jpg',
  })
  @IsOptional()
  @IsUrl()
  @ValidateIf((o: SendMediaMessageDto) => !o.base64)
  url?: string;

  @ApiPropertyOptional({
    description: 'Base64 encoded media data',
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o: SendMediaMessageDto) => !o.url)
  base64?: string;

  @ApiPropertyOptional({
    description: 'Media MIME type (required when using base64)',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimetype?: string;

  @ApiPropertyOptional({
    description: 'Filename for the media',
    example: 'image.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  @ApiPropertyOptional({
    description: 'Caption for the media',
    example: 'Check out this image!',
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'true_628123456789@c.us_3EB0123456789' })
  messageId: string;

  @ApiProperty({ example: 1706868000 })
  timestamp: number;
}
