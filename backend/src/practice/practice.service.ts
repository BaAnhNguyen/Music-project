import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreatePracticeSessionDto } from './dto/create-practice-session.dto';
import { QueryPracticeSessionsDto } from './dto/query-practice-sessions.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { FUTURE_TOLERANCE_MS, TimelinePeriod } from './practice.constants';

const SESSION_SELECT = {
  sessionId: true,
  songId: true,
  durationSec: true,
  practicedAt: true,
  clientRequestId: true,
  createdAt: true,
} satisfies Prisma.PracticeSessionSelect;

// Whitelist: tên đơn vị date_trunc KHÔNG được nối từ input người dùng
const TRUNC_UNIT: Record<TimelinePeriod, Prisma.Sql> = {
  day: Prisma.sql`'day'`,
  week: Prisma.sql`'week'`, // tuần ISO, bắt đầu thứ Hai
  month: Prisma.sql`'month'`,
};

// Khoảng mặc định của timeline (ngày)
const DEFAULT_RANGE_DAYS: Record<TimelinePeriod, number> = { day: 30, week: 84, month: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ Ghi nhận

  async record(userId: string, dto: CreatePracticeSessionDto) {
    const practicedAt = new Date(dto.practicedAt);
    if (practicedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('practicedAt must not be in the future');
    }

    // Đường nhanh cho retry: bản ghi đã có thì trả luôn, không cần validate lại songId
    // (bài hát có thể đã bị chuyển private sau lần ghi đầu, retry vẫn phải thành công).
    const existing = await this.findByRequestId(userId, dto.clientRequestId);
    if (existing) return { session: existing, created: false };

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        if (dto.songId) {
          const song = await tx.song.findFirst({
            where: { songId: dto.songId, OR: [{ visibility: 'public' }, { ownerId: userId }] },
            select: { songId: true },
          });
          if (!song) throw new NotFoundException('Song not found');
        }

        // Insert trước: nếu trùng (userId, clientRequestId) sẽ ném P2002 và cả transaction rollback,
        // nên bước cộng thống kê bên dưới không bao giờ chạy cho request trùng.
        const created = await tx.practiceSession.create({
          data: {
            userId,
            songId: dto.songId ?? null,
            durationSec: dto.durationSec,
            practicedAt,
            clientRequestId: dto.clientRequestId,
          },
          select: SESSION_SELECT,
        });

        // Upsert + increment nguyên tử (INSERT ... ON CONFLICT DO UPDATE SET x = x + n),
        // không đọc-rồi-ghi nên 20 request song song không mất dữ liệu.
        await tx.practiceStat.upsert({
          where: { userId },
          create: { userId, totalSeconds: dto.durationSec, totalSessions: 1 },
          update: {
            totalSeconds: { increment: dto.durationSec },
            totalSessions: { increment: 1 },
          },
        });

        return created;
      });
      return { session, created: true };
    } catch (e) {
      // Hai request cùng clientRequestId chạy đồng thời: request thua cuộc bị P2002.
      // Phải tra cứu SAU khi transaction đã rollback (trong tx, Postgres đã đánh dấu aborted).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const dup = await this.findByRequestId(userId, dto.clientRequestId);
        if (dup) return { session: dup, created: false };
      }
      throw e;
    }
  }

  private findByRequestId(userId: string, clientRequestId: string) {
    return this.prisma.practiceSession.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId } },
      select: SESSION_SELECT,
    });
  }

  // ------------------------------------------------------------ Lịch sử

  async list(userId: string, query: QueryPracticeSessionsDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from >= to) throw new BadRequestException('from must be before to');

    const where: Prisma.PracticeSessionWhereInput = {
      userId,
      ...(query.songId && { songId: query.songId }),
      ...((from || to) && { practicedAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
    };

    // Dùng index (user_id, practiced_at DESC); sessionId làm tie-breaker để phân trang ổn định
    const [items, total] = await this.prisma.$transaction([
      this.prisma.practiceSession.findMany({
        where,
        orderBy: [{ practicedAt: 'desc' }, { sessionId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SESSION_SELECT,
      }),
      this.prisma.practiceSession.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  // ------------------------------------------------------------ Thống kê

  async summary(userId: string) {
    const stat = await this.prisma.practiceStat.findUnique({
      where: { userId },
      select: { totalSeconds: true, totalSessions: true },
    });
    // Chưa luyện buổi nào → chưa có dòng stat
    return stat ?? { totalSeconds: 0, totalSessions: 0 };
  }

  async timeline(userId: string, query: TimelineQueryDto) {
    const to = query.to ? new Date(query.to) : new Date(Date.now() + FUTURE_TOLERANCE_MS);
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_RANGE_DAYS[query.period] * DAY_MS);
    if (from >= to) throw new BadRequestException('from must be before to');

    // Tên bảng/cột là snake_case theo @map trong schema.prisma.
    // - user_id là CHAR(36): ép tham số về char(36) để so sánh bpchar = bpchar và dùng được index
    //   (tham số text sẽ khiến Postgres ép cột sang text → bỏ qua index).
    // - practiced_at là timestamp(3) không múi giờ, lưu UTC: truyền chuỗi ISO rồi ::timestamp
    //   để kết quả không phụ thuộc timezone của session Postgres.
    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; total_sec: number; sessions: number }>>(Prisma.sql`
      SELECT date_trunc(${TRUNC_UNIT[query.period]}, practiced_at) AS bucket,
             SUM(duration_sec)::int AS total_sec,
             COUNT(*)::int AS sessions
      FROM practice_sessions
      WHERE user_id = ${userId}::char(36)
        AND practiced_at >= ${from.toISOString()}::timestamp
        AND practiced_at <  ${to.toISOString()}::timestamp
      GROUP BY bucket
      ORDER BY bucket
    `);

    return {
      period: query.period,
      from: from.toISOString(),
      to: to.toISOString(),
      buckets: rows.map((r) => ({
        bucket: r.bucket.toISOString(),
        totalSeconds: r.total_sec,
        sessions: r.sessions,
      })),
    };
  }
}
