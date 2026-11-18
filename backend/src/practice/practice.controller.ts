import { Body, Controller, Get, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePracticeSessionDto } from './dto/create-practice-session.dto';
import { QueryPracticeSessionsDto } from './dto/query-practice-sessions.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { PracticeService } from './practice.service';

// Không đặt prefix vì có cả /practice-sessions và /practice-stats/* (giống FavoritesController)
@ApiTags('practice')
@ApiBearerAuth()
@Controller()
export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  @Post('practice-sessions')
  @ApiOperation({ summary: 'Ghi nhận một buổi luyện tập (idempotent theo clientRequestId)' })
  @ApiResponse({ status: 201, description: 'Tạo mới' })
  @ApiResponse({ status: 200, description: 'clientRequestId đã tồn tại → trả bản ghi cũ, không cộng thống kê' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePracticeSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, created } = await this.service.record(user.userId, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return session;
  }

  @Get('practice-sessions')
  @ApiOperation({ summary: 'Lịch sử luyện tập (lọc from, to, songId; phân trang)' })
  list(@CurrentUser() user: AuthUser, @Query() query: QueryPracticeSessionsDto) {
    return this.service.list(user.userId, query);
  }

  @Get('practice-stats/summary')
  @ApiOperation({ summary: 'Tổng thời gian + tổng số buổi' })
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.userId);
  }

  @Get('practice-stats/timeline')
  @ApiOperation({ summary: 'Thống kê theo ngày/tuần/tháng (cho biểu đồ)' })
  timeline(@CurrentUser() user: AuthUser, @Query() query: TimelineQueryDto) {
    return this.service.timeline(user.userId, query);
  }
}
