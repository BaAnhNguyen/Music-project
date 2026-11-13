import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SongService } from './songs.service';
import { CreateSongDto, ParsePreviewDto } from './dto/create-song.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { QuerySongsDto } from './dto/query-songs.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { DiffQueryDto } from './dto/diff-query.dto';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('songs')
@Controller('songs')
export class SongController {
  constructor(private readonly service: SongService) {}

  @Public()
  @Get()
  listPublic(@Query() query: QuerySongsDto) {
    return this.service.listPublic(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  listMine(@Req() req: any, @Query() query: QuerySongsDto) {
    return this.service.listMine(req.user.userId, query);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  getSong(@Param('id') id: string, @Req() req: any) {
    return this.service.getSong(id, req.user?.userId);
  }

  // Fork bài PUBLIC (hoặc bài của mình) thành bản sao riêng tư cho user hiện tại
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/fork')
  forkSong(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.fork(id, req.user.userId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/forks')
  listForks(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @Query() query: PaginationQueryDto) {
    return this.service.listForks(id, req.user?.userId, query);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/lineage')
  lineage(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.lineage(id, req.user?.userId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/revisions')
  listRevisions(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.listRevisions(id, req.user?.userId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/revisions/:v')
  getRevision(@Param('id', ParseUUIDPipe) id: string, @Param('v', ParseIntPipe) v: number, @Req() req: any) {
    return this.service.getRevision(id, v, req.user?.userId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/diff')
  diff(@Param('id', ParseUUIDPipe) id: string, @Query() query: DiffQueryDto, @Req() req: any) {
    return this.service.diff(id, query, req.user?.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateSong(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateSongDto) {
    return this.service.updateSong(id, req.user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteSong(@Param('id') id: string, @Req() req: any) {
    return this.service.deleteSong(id, req.user.userId, req.user.role);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  async createSong(
    @Req() req: any, // Req chứa user payload từ JwtStrategy
    @Body() createSongDto: CreateSongDto,
  ) {
    const userId = req.user.userId;
    return this.service.createSong(userId, createSongDto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('parse-preview')
  @HttpCode(HttpStatus.OK)
  parsePreview(@Body() parsePreviewDto: ParsePreviewDto) {
    const ast = this.service.parsePreview(parsePreviewDto.rawText);
    return {
      message: 'Parse thành công',
      ast,
    };
  }


}
