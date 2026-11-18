import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly blacklist: TokenBlacklistService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash, displayName: dto.displayName.trim(), role: 'user' },
      });
    } catch (e) {
      // 2 request đăng ký cùng email chạy đồng thời: unique constraint là chốt chặn cuối
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw e;
    }

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Cùng 1 thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã tồn tại
    const ok = user && (await argon2.verify(user.passwordHash, dto.password));
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    return this.buildAuthResponse(user);
  }

  /**
   * Refresh token dùng 1 lần (rotation): mỗi lần đổi, refresh token cũ bị đưa vào blacklist Redis.
   * Dùng lại token cũ (kể cả 2 request đồng thời) -> 401.
   */
  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    // Lấy role mới nhất từ DB; user đã bị xóa thì không cấp token nữa
    const user = await this.prisma.user.findUnique({ where: { userId: payload.sub } });
    if (!user) throw new UnauthorizedException('User no longer exists');

    // Thu hồi atomic: chỉ request đầu tiên thắng
    if (!payload.jti || !payload.exp || !(await this.blacklist.revoke(payload.jti, payload.exp))) {
      throw new UnauthorizedException('Refresh token already used or revoked');
    }

    return this.issueTokens(user);
  }

  /** Thu hồi access token hiện tại (+ refresh token nếu client gửi kèm). */
  async logout(authUser: AuthUser, refreshToken?: string): Promise<void> {
    if (authUser.jti && authUser.exp) {
      await this.blacklist.revoke(authUser.jti, authUser.exp);
    }

    if (refreshToken) {
      try {
        const payload = await this.verifyRefreshToken(refreshToken);
        // Chỉ được thu hồi refresh token của chính mình
        if (payload.sub === authUser.userId && payload.jti && payload.exp) {
          await this.blacklist.revoke(payload.jti, payload.exp);
        }
      } catch {
        // refresh token sai/hết hạn thì không cần thu hồi, bỏ qua
      }
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, displayName: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ---------------------------------------------------------------------------

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');
    return payload;
  }

  private async buildAuthResponse(user: User) {
    return {
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      ...(await this.issueTokens(user)),
    };
  }

  private async issueTokens(user: User) {
    const base = { sub: user.userId, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, type: 'access' } satisfies JwtPayload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
        jwtid: randomUUID(),
      }),
      this.jwt.signAsync({ ...base, type: 'refresh' } satisfies JwtPayload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
        jwtid: randomUUID(),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
