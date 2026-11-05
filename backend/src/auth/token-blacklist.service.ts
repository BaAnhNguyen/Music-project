import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const key = (jti: string) => `auth:revoked:${jti}`;

/**
 * Danh sách token bị thu hồi, lưu trong Redis (không dùng bảng DB).
 * Mỗi key tự hết hạn đúng lúc token hết hạn nên không phình dữ liệu.
 */
@Injectable()
export class TokenBlacklistService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Thu hồi token. Trả về true nếu đây là lần thu hồi ĐẦU TIÊN (SET NX là atomic),
   * false nếu token đã bị thu hồi trước đó.
   */
  async revoke(jti: string, exp: number): Promise<boolean> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return false; // token đã hết hạn, không cần lưu
    const res = await this.redis.client.set(key(jti), '1', 'EX', ttl, 'NX');
    return res === 'OK';
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.client.exists(key(jti))) === 1;
  }
}
