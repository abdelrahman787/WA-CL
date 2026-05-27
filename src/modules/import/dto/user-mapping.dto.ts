import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NewUserDataDto {
  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;
}

export type UserMappingAction = 'map_existing' | 'create_new' | 'skip';

export class UserMappingDto {
  @ApiProperty()
  @IsString()
  senderName: string;

  @ApiProperty({ enum: ['map_existing', 'create_new', 'skip'] })
  @IsEnum(['map_existing', 'create_new', 'skip'])
  action: UserMappingAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  existingUserId?: string;

  @ApiProperty({ type: NewUserDataDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewUserDataDto)
  newUserData?: NewUserDataDto;
}

export class MapUsersDto {
  @ApiProperty({ type: [UserMappingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UserMappingDto)
  mappings: UserMappingDto[];
}
