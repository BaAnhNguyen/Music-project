import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findRoles() {
    return this.prisma.role.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async createRole(dto: CreateRoleDto) {
    try {
      return await this.prisma.role.create({ data: { code: dto.code, name: dto.name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Role code already exists');
      }
      throw error;
    }
  }

  async updateRole(code: string, dto: UpdateRoleDto) {
    try {
      return await this.prisma.role.update({
        where: { code },
        data: { name: dto.name },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Role not found');
      }
      throw error;
    }
  }

  async deleteRole(code: string) {
    const role = await this.prisma.role.findUnique({
      where: { code },
      select: { code: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role._count.users > 0) {
      throw new ConflictException('Role is assigned to users and cannot be deleted');
    }

    await this.prisma.role.delete({ where: { code } });
  }
}
