import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

type Tx = Prisma.TransactionClient;
type Access = { ownerId: string; visibility: string };

const PLAYLIST_SUMMARY = {
  playlistId: true,
  name: true,
  visibility: true,
  createdAt: true,
  _count: { select: { songs: true } },
} satisfies Prisma.PlaylistSelect;

const SONG_BRIEF = {
  songId: true,
  title: true,
  artist: true,
  ownerId: true,
  visibility: true,
} satisfies Prisma.SongSelect;

// Bài người dùng được phép thấy: public hoặc của chính họ
const accessibleSong = (userId: string): Prisma.SongWhereInput => ({
  OR: [{ visibility: 'public' }, { ownerId: userId }],
});

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- CRUD

  create(userId: string, dto: CreatePlaylistDto) {
    return this.prisma.playlist
      .create({
        data: { ownerId: userId, name: dto.name, visibility: dto.visibility ?? 'private' },
        select: PLAYLIST_SUMMARY,
      })
      .then((p) => this.toSummary(p));
  }

  async findMine(userId: string, query: PaginationQueryDto) {
    const where = { ownerId: userId };
    // 1 round-trip: findMany (kèm _count songs) + count. Không N+1.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.playlist.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { playlistId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: PLAYLIST_SUMMARY,
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return paginate(rows.map((r) => this.toSummary(r)), total, query);
  }

  async findOne(id: string, viewerId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { playlistId: id },
      select: { playlistId: true, ownerId: true, name: true, visibility: true, createdAt: true },
    });
    this.assertCanRead(playlist, viewerId);
    const songs = await this.loadSongs(this.prisma, id, viewerId);
    return { ...playlist, songs };
  }

  async update(id: string, userId: string, dto: UpdatePlaylistDto) {
    if (dto.name === undefined && dto.visibility === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const current = await this.prisma.playlist.findUnique({
      where: { playlistId: id },
      select: { ownerId: true, visibility: true },
    });
    this.assertCanWrite(current, userId);

    try {
      const updated = await this.prisma.playlist.update({
        where: { playlistId: id },
        data: { name: dto.name, visibility: dto.visibility },
        select: PLAYLIST_SUMMARY,
      });
      return this.toSummary(updated);
    } catch (e) {
      if (this.isPrismaError(e, 'P2025')) throw new NotFoundException('Playlist not found');
      throw e;
    }
  }

  async remove(id: string, userId: string) {
    const current = await this.prisma.playlist.findUnique({
      where: { playlistId: id },
      select: { ownerId: true, visibility: true },
    });
    this.assertCanWrite(current, userId);
    // playlist_songs xóa theo onDelete: Cascade
    await this.prisma.playlist.deleteMany({ where: { playlistId: id } });
  }

  // ------------------------------------------------------- Songs in playlist

  async addSong(id: string, userId: string, songId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockForWrite(tx, id, userId);

        const song = await tx.song.findFirst({
          where: { songId, ...accessibleSong(userId) },
          select: { songId: true },
        });
        if (!song) throw new NotFoundException('Song not found');

        const { _max } = await tx.playlistSong.aggregate({
          where: { playlistId: id },
          _max: { position: true },
        });
        const position = (_max.position ?? -1) + 1;

        return tx.playlistSong.create({
          data: { playlistId: id, songId, position },
          select: { playlistId: true, songId: true, position: true, addedAt: true },
        });
      });
    } catch (e) {
      // Khóa chính ghép (playlistId, songId): thêm trùng → P2002
      if (this.isPrismaError(e, 'P2002')) throw new ConflictException('Song already in playlist');
      throw e;
    }
  }

  async removeSong(id: string, userId: string, songId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockForWrite(tx, id, userId);

      const { count } = await tx.playlistSong.deleteMany({ where: { playlistId: id, songId } });
      if (count === 0) throw new NotFoundException('Song not in playlist');

      const remaining = await tx.playlistSong.findMany({
        where: { playlistId: id },
        orderBy: [{ position: 'asc' }, { addedAt: 'asc' }, { songId: 'asc' }],
        select: { songId: true },
      });
      await this.rewritePositions(tx, id, remaining.map((r) => r.songId));
    });
  }

  async reorder(id: string, userId: string, songIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockForWrite(tx, id, userId);

      const current = await tx.playlistSong.findMany({
        where: { playlistId: id },
        select: { songId: true },
      });

      // songIds phải trùng đúng tập bài hiện có: không trùng lặp, không thiếu, không thừa
      const currentSet = new Set(current.map((c) => c.songId));
      const inputSet = new Set(songIds);
      const missing = [...currentSet].filter((s) => !inputSet.has(s));
      const extra = [...inputSet].filter((s) => !currentSet.has(s));
      if (inputSet.size !== songIds.length || missing.length > 0 || extra.length > 0) {
        throw new BadRequestException({
          message: 'songIds must match exactly the songs currently in the playlist',
          missing,
          extra,
          duplicated: inputSet.size !== songIds.length,
        });
      }

      await this.rewritePositions(tx, id, songIds);
    });
    return { playlistId: id, songs: songIds.map((songId, position) => ({ songId, position })) };
  }

  // ------------------------------------------------------------ Duplicate

  async duplicate(id: string, userId: string) {
    const source = await this.prisma.playlist.findUnique({
      where: { playlistId: id },
      select: { ownerId: true, visibility: true, name: true },
    });
    this.assertCanRead(source, userId);

    const songs = await this.loadSongs(this.prisma, id, userId);
    const suffix = ' (copy)';
    const name = `${source.name.slice(0, 100 - suffix.length)}${suffix}`;

    // Nested create chạy trong 1 transaction; position được đánh lại liên tục 0..n-1
    const copy = await this.prisma.playlist.create({
      data: {
        ownerId: userId,
        name,
        visibility: 'private',
        songs: { create: songs.map((s, position) => ({ songId: s.song.songId, position })) },
      },
      select: PLAYLIST_SUMMARY,
    });
    return this.toSummary(copy);
  }

  // -------------------------------------------------------------- Helpers

  private loadSongs(db: Pick<Tx, 'playlistSong'>, playlistId: string, viewerId: string) {
    return db.playlistSong.findMany({
      where: { playlistId, song: accessibleSong(viewerId) },
      orderBy: { position: 'asc' },
      // 1 query duy nhất cho cả danh sách bài (join), không N+1
      select: { position: true, addedAt: true, song: { select: SONG_BRIEF } },
    });
  }

  /**
   * Khóa dòng playlist (SELECT ... FOR UPDATE) rồi kiểm tra quyền ghi.
   * Serialize mọi thao tác đổi position trên cùng 1 playlist → không bị trùng position khi thêm đồng thời.
   */
  private async lockForWrite(tx: Tx, id: string, userId: string) {
    const rows = await tx.$queryRaw<Access[]>`
      SELECT owner_id AS "ownerId", visibility
      FROM playlists
      WHERE playlist_id = ${id}
      FOR UPDATE`;
    this.assertCanWrite(rows[0], userId);
  }

  /** Ghi lại position = 0..n-1 theo thứ tự songIds bằng 1 câu UPDATE (bỏ qua dòng đã đúng). */
  private async rewritePositions(tx: Tx, playlistId: string, songIds: string[]) {
    if (songIds.length === 0) return;
    await tx.$executeRaw`
      UPDATE playlist_songs ps
      SET position = (t.ord - 1)::int
      FROM unnest(${songIds}::text[]) WITH ORDINALITY AS t(song_id, ord)
      WHERE ps.playlist_id = ${playlistId}
        AND ps.song_id = t.song_id
        AND ps.position <> (t.ord - 1)::int`;
  }

  // Playlist private của người khác → 404 (không lộ sự tồn tại)
  private assertCanRead<T extends Access>(p: T | null | undefined, userId: string): asserts p is T {
    if (!p) throw new NotFoundException('Playlist not found');
    if (p.visibility === 'private' && p.ownerId !== userId) throw new NotFoundException('Playlist not found');
  }

  // Chỉ owner được sửa: người khác thấy được (public) → 403, không thấy được (private) → 404
  private assertCanWrite<T extends Access>(p: T | null | undefined, userId: string): asserts p is T {
    this.assertCanRead(p, userId);
    if (p.ownerId !== userId) throw new ForbiddenException('Only the owner can modify this playlist');
  }

  private isPrismaError(e: unknown, code: string) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
  }

  private toSummary<T extends { _count: { songs: number } }>(row: T) {
    const { _count, ...rest } = row;
    return { ...rest, songCount: _count.songs };
  }
}
