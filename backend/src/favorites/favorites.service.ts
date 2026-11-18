import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** PUT idempotent: đánh dấu lại nhiều lần vẫn thành công, không tạo bản ghi thứ 2. */
  async add(userId: string, songId: string) {
    const song = await this.prisma.song.findFirst({
      where: { songId, OR: [{ visibility: 'public' }, { ownerId: userId }] },
      select: { songId: true },
    });
    if (!song) throw new NotFoundException('Song not found');

    try {
      const fav = await this.prisma.favorite.upsert({
        where: { userId_songId: { userId, songId } },
        create: { userId, songId },
        update: {},
        select: { songId: true, createdAt: true },
      });
      return { ...fav, favorite: true };
    } catch (e) {
      // Hai request đồng thời cùng insert → P2002: coi như đã yêu thích
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const fav = await this.prisma.favorite.findUniqueOrThrow({
          where: { userId_songId: { userId, songId } },
          select: { songId: true, createdAt: true },
        });
        return { ...fav, favorite: true };
      }
      throw e;
    }
  }

  /** DELETE idempotent: chưa yêu thích thì vẫn 204. */
  async remove(userId: string, songId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, songId } });
  }

  async list(userId: string, query: PaginationQueryDto) {
    // Ẩn bài đã bị chủ chuyển sang private (không còn quyền xem)
    const where: Prisma.FavoriteWhereInput = {
      userId,
      song: { OR: [{ visibility: 'public' }, { ownerId: userId }] },
    };
    // Dùng index Favorite(userId, createdAt); include bài bằng join, không N+1
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { songId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          createdAt: true,
          song: { select: { songId: true, title: true, artist: true, ownerId: true, visibility: true } },
        },
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return paginate(rows, total, query);
  }
}
