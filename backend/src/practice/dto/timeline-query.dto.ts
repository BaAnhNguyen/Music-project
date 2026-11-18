import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { TIMELINE_PERIODS, TimelinePeriod } from '../practice.constants';

export class TimelineQueryDto {
  @ApiProperty({ enum: TIMELINE_PERIODS })
  @IsIn(TIMELINE_PERIODS)
  period: TimelinePeriod;

  @ApiPropertyOptional({ format: 'date-time', description: 'Mặc định: 30 ngày / 12 tuần / 12 tháng gần nhất' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Không bao gồm mốc này. Mặc định: hiện tại' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}
