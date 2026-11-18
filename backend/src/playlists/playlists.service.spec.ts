// Unit test với Prisma được mock — không cần DB. Test tích hợp với DB thật xem test/ (e2e).
jest.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return { PrismaClient: class {}, Prisma: { PrismaClientKnownRequestError } };
});

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlaylistsService } from './playlists.service';

const OWNER = 'owner-1';
const OTHER = 'other-1';
const PID = 'playlist-1';

function setup(lockRow: { ownerId: string; visibility: string } | undefined = { ownerId: OWNER, visibility: 'private' }) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(lockRow ? [lockRow] : []),
    $executeRaw: jest.fn().mockResolvedValue(1),
    song: { findFirst: jest.fn().mockResolvedValue({ songId: 's1' }) },
    playlistSong: {
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    playlist: { findUnique: jest.fn() },
  };
  return { tx, prisma, service: new PlaylistsService(prisma as never) };
}

describe('PlaylistsService', () => {
  describe('addSong', () => {
    it('đặt position = max + 1', async () => {
      const { service, tx } = setup();
      const res = await service.addSong(PID, OWNER, 's1');
      expect(res.position).toBe(5);
      expect(tx.playlistSong.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { playlistId: PID, songId: 's1', position: 5 } }),
      );
    });

    it('playlist rỗng → position 0', async () => {
      const { service, tx } = setup();
      tx.playlistSong.aggregate.mockResolvedValue({ _max: { position: null } });
      expect((await service.addSong(PID, OWNER, 's1')).position).toBe(0);
    });

    it('thêm trùng (P2002) → 409', async () => {
      const { service, tx } = setup();
      tx.playlistSong.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002' } as never));
      await expect(service.addSong(PID, OWNER, 's1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('bài không tồn tại / không được xem → 404', async () => {
      const { service, tx } = setup();
      tx.song.findFirst.mockResolvedValue(null);
      await expect(service.addSong(PID, OWNER, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('không phải owner: playlist public → 403, private → 404', async () => {
      await expect(setup({ ownerId: OWNER, visibility: 'public' }).service.addSong(PID, OTHER, 's1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(setup({ ownerId: OWNER, visibility: 'private' }).service.addSong(PID, OTHER, 's1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(setup(undefined).service.addSong(PID, OTHER, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeSong', () => {
    it('xóa rồi dồn lại position theo thứ tự còn lại', async () => {
      const { service, tx } = setup();
      tx.playlistSong.findMany.mockResolvedValue([{ songId: 'a' }, { songId: 'c' }]);
      await service.removeSong(PID, OWNER, 'b');
      expect(tx.playlistSong.deleteMany).toHaveBeenCalledWith({ where: { playlistId: PID, songId: 'b' } });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw.mock.calls[0][1]).toEqual(['a', 'c']);
    });

    it('bài không có trong playlist → 404', async () => {
      const { service, tx } = setup();
      tx.playlistSong.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeSong(PID, OWNER, 'x')).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    const current = [{ songId: 'a' }, { songId: 'b' }, { songId: 'c' }];

    it('hợp lệ → ghi lại position', async () => {
      const { service, tx } = setup();
      tx.playlistSong.findMany.mockResolvedValue(current);
      const res = await service.reorder(PID, OWNER, ['c', 'a', 'b']);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(res.songs).toEqual([
        { songId: 'c', position: 0 },
        { songId: 'a', position: 1 },
        { songId: 'b', position: 2 },
      ]);
    });

    it.each([
      ['thiếu bài', ['a', 'b']],
      ['thừa bài', ['a', 'b', 'c', 'd']],
      ['trùng bài', ['a', 'a', 'b']],
      ['sai bài', ['a', 'b', 'x']],
    ])('%s → 400', async (_name, ids) => {
      const { service, tx } = setup();
      tx.playlistSong.findMany.mockResolvedValue(current);
      await expect(service.reorder(PID, OWNER, ids)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('findOne / duplicate: quyền xem', () => {
    it('playlist private của người khác → 404', async () => {
      const { service, prisma } = setup();
      prisma.playlist.findUnique.mockResolvedValue({ ownerId: OWNER, visibility: 'private', name: 'x' });
      await expect(service.findOne(PID, OTHER)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.duplicate(PID, OTHER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
