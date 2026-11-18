import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { MAX_DURATION_SEC, MIN_DURATION_SEC } from '../practice.constants';

// UUID lưu Char(36) so sánh phân biệt hoa/thường → chuẩn hóa về chữ thường để idempotency không bị lọt
const lowerString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toLowerCase() : value);

export class CreatePracticeSessionDto {
  @ApiProperty({ format: 'uuid', description: 'Client tự sinh; gửi lại cùng giá trị khi retry' })
  @Transform(lowerString)
  @IsUUID()
  clientRequestId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null/bỏ trống = luyện tập tự do' })
  @IsOptional() // cho phép cả null lẫn undefined
  @Transform(lowerString)
  @IsUUID()
  songId?: string | null;

  @ApiProperty({ minimum: MIN_DURATION_SEC, maximum: MAX_DURATION_SEC })
  @IsInt()
  @Min(MIN_DURATION_SEC)
  @Max(MAX_DURATION_SEC)
  durationSec: number;

  @ApiProperty({ format: 'date-time', example: '2026-11-04T09:30:00Z' })
  @IsISO8601({ strict: true, strictSeparator: true })
  // Bắt buộc có múi giờ (Z hoặc ±hh:mm), tránh chuỗi không offset bị hiểu theo giờ server
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/i, { message: 'practicedAt must include a timezone (Z or ±hh:mm)' })
  practicedAt: string;
}
