import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Unique name for the session (alphanumeric and hyphens only)',
    example: 'my-bot',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Session name can only contain letters, numbers, and hyphens',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Session configuration options',
    example: { autoReconnect: true },
  })
  @IsOptional()
  config?: Record<string, any>;
}
