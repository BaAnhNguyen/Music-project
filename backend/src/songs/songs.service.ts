import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChordValidationException, parseSongText, SongAst } from './parser/chord.validator';
import { CreateSongDto } from './dto/create-song.dto';
import { QuerySongsDto } from './dto/query-songs.dto';
import { UpdateSongDto } from './dto/update-song.dto';
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

  parsePreview(rawText: string): SongAst {
    return parseSongText(rawText);
  }
}
