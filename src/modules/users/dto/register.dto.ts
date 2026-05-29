import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ahmed' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username: string;

  @ApiProperty({ example: 'Ahmed Mohamed' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ required: false, enum: ['admin', 'operator', 'viewer'] })
  @IsOptional()
  @IsEnum(['admin', 'operator', 'viewer'])
  role?: 'admin' | 'operator' | 'viewer';
}
