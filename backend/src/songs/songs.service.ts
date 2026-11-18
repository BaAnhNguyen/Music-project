import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { diffLines } from 'diff';
import { PrismaService } from '../../prisma/prisma.service';
import { ChordValidationException, parseSongText, SongAst } from './parser/chord.validator';
import { CreateSongDto } from './dto/create-song.dto';
import { QuerySongsDto } from './dto/query-songs.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { DiffQueryDto } from './dto/diff-query.dto';

// Giới hạn số cấp khi đi ngược chuỗi fork, tránh lặp vô hạn nếu dữ liệu bị vòng
const MAX_LINEAGE_DEPTH = 20;

@Injectable()
export class SongService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: QuerySongsDto) {
    return this.list({ ...query, visibility: 'public' });
  }

  async listMine(userId: string, query: QuerySongsDto) {
    return this.list({ ...query, ownerId: userId });
  }

  private async list(filters: QuerySongsDto & { visibility?: string; ownerId?: string }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const q = filters.q?.trim();
    const where: Prisma.SongWhereInput = {
      ...(filters.visibility ? { visibility: filters.visibility } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { artist: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        select: {
          songId: true,
          ownerId: true,
          title: true,
          artist: true,
          visibility: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.song.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getSong(songId: string, userId?: string) {
    const song = await this.prisma.song.findUnique({ where: { songId } });
    if (!song) throw new NotFoundException('Song not found');
    if (song.visibility !== 'public' && song.ownerId !== userId) {
      throw new ForbiddenException('You cannot view this song');
    }
    return song;
  }

  async updateSong(songId: string, userId: string, dto: UpdateSongDto) {
    const existing = await this.prisma.song.findUnique({ where: { songId } });
    if (!existing) throw new NotFoundException('Song not found');
    if (existing.ownerId !== userId) throw new ForbiddenException('Only the owner can update this song');

    let ast: SongAst | undefined;
    if (dto.rawText !== undefined) ast = parseSongText(dto.rawText);
    const data: Prisma.SongUpdateInput = {
      ...(dto.rawText !== undefined
        ? {
            rawText: dto.rawText,
            content: ast as any,
            title: ast?.meta['title'] || 'Untitled Song',
            artist: ast?.meta['artist'] || null,
            schemaVersion: ast?.schemaVersion,
          }
        : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      version: { increment: 1 },
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.song.updateMany({
        where: { songId, ownerId: userId, version: dto.version },
        data,
      });
      if (result.count === 0) throw new ConflictException('Song version is out of date');
      const song = await tx.song.findUniqueOrThrow({ where: { songId } });
      await tx.songRevision.create({
        data: {
          songId,
          version: song.version,
          rawText: song.rawText,
          content: song.content as any,
          createdById: userId,
        },
      });
      return song;
    });
    return updated;
  }

  async deleteSong(songId: string, userId: string, role: string) {
    const song = await this.prisma.song.findUnique({ where: { songId } });
    if (!song) throw new NotFoundException('Song not found');
    if (role !== 'admin' && song.ownerId !== userId) {
      throw new ForbiddenException('Only the owner or admin can delete this song');
    }
    await this.prisma.song.delete({ where: { songId } });
    return { message: 'Xóa bài hát thành công' };
  }

  async createSong(userId: string, dto: CreateSongDto) {
    try {
      // Parse và Validate (sẽ throw ChordValidationException nếu có lỗi)
      const ast: SongAst = parseSongText(dto.rawText);

      const title = ast.meta['title'] || 'Untitled Song';
      const artist = ast.meta['artist'] || null;
      const visibility = dto.visibility || 'private';

      // Lưu song và revision trong cùng 1 transaction qua nested writes của Prisma[cite: 1]
      const newSong = await this.prisma.song.create({
        data: {
          ownerId: userId,
          title,
          artist,
          rawText: dto.rawText,
          content: ast as any, // Cast sang any/Prisma.JsonValue để tránh lỗi type Json của Prisma
          schemaVersion: ast.schemaVersion,
          visibility,
          version: 1,
          revisions: {
            create: {
              version: 1,
              rawText: dto.rawText,
              content: ast as any,
              createdById: userId,
            },
          },
        },
      });

      return {
        message: 'Tạo bài hát thành công',
        songId: newSong.songId,
        content: newSong.content,
      };
    } catch (error) {
      // Nếu lỗi là do parser thì ném ra cho Controller xử lý, ngược lại ném lỗi 500
      if (error instanceof ChordValidationException) {
        throw error;
      }
      console.error('SongService.createSong Error:', error);
      throw new InternalServerErrorException('Lỗi hệ thống khi tạo bài hát.');
    }
  }

  // ---- Fork & lịch sử revision ----

  // Xem được bài khi bài PUBLIC hoặc user là chủ bài
  private canRead(song: { ownerId: string; visibility: string }, userId?: string) {
    return song.visibility === 'public' || (userId !== undefined && song.ownerId === userId);
  }

  // 404 nếu không có bài, 403 nếu không đủ quyền xem
  private async assertCanRead(db: Prisma.TransactionClient, songId: string, userId?: string) {
    const song = await db.song.findUnique({
      where: { songId },
      select: { songId: true, ownerId: true, visibility: true },
    });
    if (!song) throw new NotFoundException('Song not found');
    if (!this.canRead(song, userId)) throw new ForbiddenException('You cannot view this song');
    return song;
  }

  // Tạo bản sao độc lập cho user hiện tại: Song mới + revision v1 trong cùng 1 transaction
  async fork(songId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.song.findUnique({ where: { songId } });
      if (!src) throw new NotFoundException('Song not found');
      if (!this.canRead(src, userId)) throw new ForbiddenException('You cannot fork this song');

      const content = src.content as Prisma.InputJsonValue;
      const forked = await tx.song.create({
        data: {
          ownerId: userId,
          title: src.title,
          artist: src.artist,
          forkedFromId: src.songId,
          rawText: src.rawText,
          content,
          schemaVersion: src.schemaVersion,
          version: 1,
          visibility: 'private', // fork luôn bắt đầu ở chế độ riêng tư
        },
      });
      await tx.songRevision.create({
        data: { songId: forked.songId, version: 1, rawText: forked.rawText, content, createdById: userId },
      });
      return forked;
    });
  }

  // Fork trực tiếp của một bài; người lạ chỉ thấy fork PUBLIC, chủ fork thấy cả fork PRIVATE của mình
  async listForks(songId: string, userId: string | undefined, query: PaginationQueryDto) {
    await this.assertCanRead(this.prisma, songId, userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SongWhereInput = {
      forkedFromId: songId,
      OR: [{ visibility: 'public' }, ...(userId ? [{ ownerId: userId }] : [])],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        select: {
          songId: true,
          ownerId: true,
          title: true,
          artist: true,
          visibility: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.song.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // Chuỗi tổ tiên: bài này -> bài gốc, đi từng cấp, tối đa MAX_LINEAGE_DEPTH cấp
  async lineage(songId: string, userId?: string) {
    const chain: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    let currentId: string | null = songId;

    while (currentId && chain.length < MAX_LINEAGE_DEPTH) {
      if (seen.has(currentId)) break; // dữ liệu bị vòng thì dừng
      seen.add(currentId);

      const song: {
        songId: string;
        title: string;
        artist: string | null;
        ownerId: string;
        visibility: string;
        forkedFromId: string | null;
      } | null = await this.prisma.song.findUnique({
        where: { songId: currentId },
        select: { songId: true, title: true, artist: true, ownerId: true, visibility: true, forkedFromId: true },
      });

      if (!song) {
        if (chain.length === 0) throw new NotFoundException('Song not found');
        break;
      }
      if (!this.canRead(song, userId)) {
        if (chain.length === 0) throw new ForbiddenException('You cannot view this song');
        chain.push({ hidden: true }); // tổ tiên riêng tư của người khác: không lộ thông tin
        break;
      }
      chain.push({
        songId: song.songId,
        title: song.title,
        artist: song.artist,
        ownerId: song.ownerId,
        forkedFromId: song.forkedFromId,
      });
      currentId = song.forkedFromId;
    }
    return chain;
  }

  // Lịch sử revision (không kèm nội dung)
  async listRevisions(songId: string, userId?: string) {
    await this.assertCanRead(this.prisma, songId, userId);
    return this.prisma.songRevision.findMany({
      where: { songId },
      orderBy: { version: 'desc' },
      select: { version: true, createdAt: true, createdById: true },
    });
  }

  // Nội dung đầy đủ của một revision
  async getRevision(songId: string, version: number, userId?: string) {
    await this.assertCanRead(this.prisma, songId, userId);
    const revision = await this.prisma.songRevision.findUnique({
      where: { songId_version: { songId, version } },
    });
    if (!revision) throw new NotFoundException('Revision not found');
    return revision;
  }

  // So sánh rawText của hai revision theo từng dòng
  async diff(songId: string, query: DiffQueryDto, userId?: string) {
    await this.assertCanRead(this.prisma, songId, userId);
    const revisions = await this.prisma.songRevision.findMany({
      where: { songId, version: { in: [query.from, query.to] } },
      select: { version: true, rawText: true },
    });
    const a = revisions.find((r) => r.version === query.from);
    const b = revisions.find((r) => r.version === query.to);
    if (!a || !b) throw new NotFoundException('Revision not found');

    return diffLines(a.rawText, b.rawText).map((part) => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
    }));
  }

  parsePreview(rawText: string): SongAst {
    return parseSongText(rawText);
  }
}
