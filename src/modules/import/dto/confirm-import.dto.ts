import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConfirmImportDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  chatTitle?: string;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  preserveTimestamps?: boolean = true;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  createAsArchived?: boolean = false;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
