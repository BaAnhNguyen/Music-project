import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { FavoritesService } from './favorites.service';

// Controller không có prefix vì cần cả /songs/:id/favorite và /favorites
@ApiTags('favorites')
@ApiBearerAuth()
@Controller()
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Put('songs/:id/favorite')
  @ApiOperation({ summary: 'Đánh dấu yêu thích (idempotent)' })
  add(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) songId: string) {
    return this.service.add(user.userId, songId);
  }

  @Delete('songs/:id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ yêu thích (idempotent)' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) songId: string) {
    return this.service.remove(user.userId, songId);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Danh sách yêu thích của tôi (phân trang)' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.service.list(user.userId, query);
  }
}
