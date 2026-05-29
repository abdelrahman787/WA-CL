import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/auth.decorators';

type AuthedReq = Request & { user: { id: string; role: string } };

@ApiTags('users')
@Public()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin) or self (operator/viewer)' })
  async list(@Req() req: AuthedReq) {
    if (req.user.role !== 'admin') {
      const self = await this.users.findById(req.user.id);
      return [self];
    }
    return this.users.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user — admin only' })
  async create(@Req() req: AuthedReq, @Body() dto: RegisterDto) {
    if (req.user.role !== 'admin') throw new ForbiddenException('admin only');
    return this.users.createUser(dto);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user — admin, or self for limited fields' })
  async update(@Req() req: AuthedReq, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (req.user.role !== 'admin' && req.user.id !== id) throw new ForbiddenException();
    if (req.user.role !== 'admin') {
      // self-update: ignore privilege escalations
      delete dto.role;
      delete dto.isActive;
    }
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user — admin only' })
  async remove(@Req() req: AuthedReq, @Param('id') id: string) {
    if (req.user.role !== 'admin') throw new ForbiddenException('admin only');
    await this.users.remove(id);
    return { ok: true };
  }
}
