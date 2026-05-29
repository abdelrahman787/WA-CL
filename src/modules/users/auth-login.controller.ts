import { Body, Controller, Post, Res, UseGuards, Get, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { UsersService } from './users.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/auth.decorators';

const COOKIE = 'owa_jwt';
const DAYS = 7;

@ApiTags('auth')
@Controller('auth')
export class AuthLoginController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in with username + password, set JWT cookie' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.users.verifyPassword(dto.username, dto.password);
    const token = await this.jwt.signAsync({
      sub: user.id, username: user.username, role: user.role,
    });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.ENABLE_HTTPS === 'true',
      maxAge: DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
    await this.users.touchLastSeen(user.id);
    return {
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    };
  }

  @Public()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @Public()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: { id: string; username: string; role: string; displayName: string } }) {
    return req.user;
  }
}
