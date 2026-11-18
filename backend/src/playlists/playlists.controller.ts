import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AddSongDto } from './dto/add-song.dto';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { ReorderSongsDto } from './dto/reorder-songs.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { PlaylistsService } from './playlists.service';

@ApiTags('playlists')
@ApiBearerAuth()
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly service: PlaylistsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo playlist' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlaylistDto) {
    return this.service.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Playlist của tôi (phân trang)' })
  findMine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.service.findMine(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết playlist + bài hát theo position (private: chỉ owner)' })
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Đổi tên / visibility (chỉ owner)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa playlist (chỉ owner)' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, user.userId);
  }

  @Post(':id/songs')
  @ApiOperation({ summary: 'Thêm bài vào cuối playlist (trùng → 409)' })
  addSong(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSongDto) {
    return this.service.addSong(id, user.userId, dto.songId);
  }

  // Khai báo trước ':songId' không bắt buộc (khác method) nhưng giữ cạnh nhau cho dễ đọc
  @Put(':id/songs/order')
  @ApiOperation({ summary: 'Sắp xếp lại toàn bộ bài trong playlist' })
  reorder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderSongsDto) {
    return this.service.reorder(id, user.userId, dto.songIds);
  }

  @Delete(':id/songs/:songId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gỡ bài khỏi playlist và dồn lại position' })
  removeSong(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('songId', ParseUUIDPipe) songId: string,
  ) {
    return this.service.removeSong(id, user.userId, songId);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Nhân bản playlist cho user hiện tại' })
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.duplicate(id, user.userId);
  }
}
