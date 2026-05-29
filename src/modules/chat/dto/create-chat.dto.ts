import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChatDto {
  @ApiProperty({ enum: ['direct', 'group'] })
  @IsEnum(['direct', 'group'])
  type: 'direct' | 'group';

  @ApiPropertyOptional({ description: 'Required for type=group' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ type: [String], description: 'User IDs to add as participants (excluding the creator)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds: string[];
}
