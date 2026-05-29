import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from './users.service';

export interface JwtPayload {
  sub: string;        // user id
  username: string;
  role: string;
}

const JWT_COOKIE_NAME = 'owa_jwt';

const cookieExtractor = (req: Request): string | null => {
  if (req?.cookies?.[JWT_COOKIE_NAME]) return req.cookies[JWT_COOKIE_NAME] as string;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || process.env.JWT_SECRET || 'dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) throw new UnauthorizedException();
    return { id: user.id, username: user.username, role: user.role, displayName: user.displayName };
  }
}
