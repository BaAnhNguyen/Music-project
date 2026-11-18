// Unit test với Prisma được mock — không cần DB. Test tích hợp với DB thật: test/practice.e2e-spec.ts
jest.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
  return { PrismaClient: class {}, Prisma: { PrismaClientKnownRequestError, sql } };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PracticeService } from './practice.service';

const USER = 'user-1';
const REQ_ID = 'b1f1c7d2-0000-4000-8000-000000000001';
const SESSION = { sessionId: 's1', songId: null, durationSec: 1800, clientRequestId: REQ_ID };

const dto = (over: Record<string, unknown> = {}) => ({
  clientRequestId: REQ_ID,
  songId: null,
  durationSec: 1800,
  practicedAt: new Date(Date.now() - 60_000).toISOString(),
  ...over,
});

function setup() {
  const tx = {
    song: { findFirst: jest.fn().mockResolvedValue({ songId: 'song-1' }) },
    practiceSession: { create: jest.fn().mockResolvedValue(SESSION) },
    practiceStat: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]))),
    $queryRaw: jest.fn().mockResolvedValue([]),
    practiceSession: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn(), count: jest.fn() },
    practiceStat: { findUnique: jest.fn() },
  };
  return { tx, prisma, service: new PracticeService(prisma as never) };
}

describe('PracticeService', () => {
  describe('record', () => {
    it('tạo session + upsert stat với atomic increment, created = true', async () => {
      const { service, tx } = setup();
      const res = await service.record(USER, dto() as never);

      expect(res).toEqual({ session: SESSION, created: true });
      expect(tx.practiceStat.upsert).toHaveBeenCalledWith({
        where: { userId: USER },
        create: { userId: USER, totalSeconds: 1800, totalSessions: 1 },
        update: { totalSeconds: { increment: 1800 }, totalSessions: { increment: 1 } },
      });
    });

    it('clientRequestId đã tồn tại (retry) → trả bản ghi cũ, không mở transaction, không cộng stat', async () => {
      const { service, prisma, tx } = setup();
      prisma.practiceSession.findUnique.mockResolvedValue(SESSION);

      const res = await service.record(USER, dto() as never);

      expect(res).toEqual({ session: SESSION, created: false });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.practiceStat.upsert).not.toHaveBeenCalled();
    });

    it('race: insert lỗi P2002 → trả bản ghi đã có, không cộng stat lần hai', async () => {
      const { service, prisma, tx } = setup();
      // Lần tra cứu đầu (đường nhanh) chưa thấy; sau khi tx rollback thì đã thấy
      prisma.practiceSession.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(SESSION);
      tx.practiceSession.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002' } as never));

      const res = await service.record(USER, dto() as never);

      expect(res).toEqual({ session: SESSION, created: false });
      expect(tx.practiceStat.upsert).not.toHaveBeenCalled();
    });

    it('lỗi không phải P2002 thì ném lại nguyên vẹn', async () => {
      const { service, tx } = setup();
      tx.practiceSession.create.mockRejectedValue(new Error('boom'));
      await expect(service.record(USER, dto() as never)).rejects.toThrow('boom');
    });

    it('songId không tồn tại / không có quyền xem → 404, không tạo session', async () => {
      const { service, tx } = setup();
      tx.song.findFirst.mockResolvedValue(null);

      await expect(service.record(USER, dto({ songId: 'song-x' }) as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.song.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { songId: 'song-x', OR: [{ visibility: 'public' }, { ownerId: USER }] } }),
      );
      expect(tx.practiceSession.create).not.toHaveBeenCalled();
    });

    it('songId null → không kiểm tra bài hát', async () => {
      const { service, tx } = setup();
      await service.record(USER, dto({ songId: null }) as never);
      expect(tx.song.findFirst).not.toHaveBeenCalled();
    });

    it('practicedAt ở tương lai quá 5 phút → 400; trong ngưỡng 5 phút thì chấp nhận', async () => {
      const { service } = setup();
      const future = new Date(Date.now() + 10 * 60_000).toISOString();
      await expect(service.record(USER, dto({ practicedAt: future }) as never)).rejects.toBeInstanceOf(BadRequestException);

      const slightlyAhead = new Date(Date.now() + 2 * 60_000).toISOString();
      await expect(service.record(USER, dto({ practicedAt: slightlyAhead }) as never)).resolves.toMatchObject({ created: true });
    });
  });

  describe('summary', () => {
    it('chưa có stat → 0/0', async () => {
      const { service, prisma } = setup();
      prisma.practiceStat.findUnique.mockResolvedValue(null);
      expect(await service.summary(USER)).toEqual({ totalSeconds: 0, totalSessions: 0 });
    });
  });

  describe('list', () => {
    it('from >= to → 400', async () => {
      const { service } = setup();
      const q = { page: 1, limit: 20, from: '2026-11-05T00:00:00Z', to: '2026-11-04T00:00:00Z' };
      await expect(service.list(USER, q as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lọc theo user + songId + khoảng [from, to), phân trang offset', async () => {
      const { service, prisma } = setup();
      prisma.practiceSession.findMany.mockResolvedValue([]);
      prisma.practiceSession.count.mockResolvedValue(0);

      await service.list(USER, { page: 2, limit: 10, songId: 'song-1', from: '2026-11-01T00:00:00Z', to: '2026-11-04T00:00:00Z' } as never);

      expect(prisma.practiceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER,
            songId: 'song-1',
            practicedAt: { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-11-04T00:00:00Z') },
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('timeline', () => {
    it('map kết quả raw sang camelCase + ISO string', async () => {
      const { service, prisma } = setup();
      prisma.$queryRaw.mockResolvedValue([{ bucket: new Date('2026-11-02T00:00:00Z'), total_sec: 3600, sessions: 2 }]);

      const res = await service.timeline(USER, { period: 'week' });

      expect(res.buckets).toEqual([{ bucket: '2026-11-02T00:00:00.000Z', totalSeconds: 3600, sessions: 2 }]);
      expect(res.period).toBe('week');
    });

    it('from >= to → 400', async () => {
      const { service } = setup();
      await expect(
        service.timeline(USER, { period: 'day', from: '2026-11-05T00:00:00Z', to: '2026-11-04T00:00:00Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
