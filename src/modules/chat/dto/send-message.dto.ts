import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({ enum: ['text', 'image', 'video', 'audio', 'voice', 'document'] })
  @IsOptional()
  @IsEnum(['text', 'image', 'video', 'audio', 'voice', 'document'])
  type?: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
