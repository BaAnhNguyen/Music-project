import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from './auth.types';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly blacklist: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Chặn dùng refresh token như access token
    if (payload.type !== 'access') throw new UnauthorizedException();

    // Token đã đăng xuất / bị thu hồi
    if (payload.jti && (await this.blacklist.isRevoked(payload.jti))) {
      throw new UnauthorizedException('Token revoked');
    }

    return { userId: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
  }
}
