import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadImportDto {
  @ApiProperty({
    description: 'Target WhatsApp session ID to attach the imported chat to.',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
