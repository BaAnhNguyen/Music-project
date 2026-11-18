import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryPracticeSessionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Bao gồm mốc này (practicedAt >= from)' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Không bao gồm mốc này (practicedAt < to)' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  songId?: string;
}
